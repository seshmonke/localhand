# Runbook: откат миграции `0004` (payments)

Откат аддитивной миграции `apps/api/drizzle/0004_*.sql`: enum
`payment_status`, enum `seller_payment_account_status`, расширение
`order_status` значениями `payment_pending`/`paid`, таблицы
`seller_payment_accounts` и `payments`.

## Когда применять

- Релиз с оплатой откатывается на предыдущую версию API.
- Миграция `0004` ломает прод (ошибка создания/чтения платежей), и
  исправление вперёд невозможно в окне инцидента.

## Последствия

- Удаляются все платёжные аккаунты и платежи: `provider_payment_id`,
  суммы, статусы, `idempotency_key`, `reconcile_attempts`/
  `last_checked_at` и зашифрованные токены.
- Down SQL необратим. Перед выполнением выгрузить
  `seller_payment_accounts` и `payments` в защищённое хранилище.
  `token_ciphertext` остаётся секретом даже в выгрузке: доступ только
  ответственным, файл не коммитить.
- Заказы в `payment_pending`/`paid` возвращаются в `new`: предыдущая
  версия API знает только `new`. Оплаченные заказы после отката
  выглядят неоплаченными — это ожидаемо, история остаётся только в
  выгрузке.
- Значения enum не удаляются: PostgreSQL не умеет `DROP VALUE`.
  `payment_status` и `seller_payment_account_status` тоже оставляются,
  чтобы повторный деплой `0004` прошёл без ручной чистки типов.
  Повторный деплой использует `ADD VALUE IF NOT EXISTS` и
  `CREATE TYPE` с обработкой `duplicate_object`.
- Сначала остановить трафик и задеплоить предыдущий commit, затем
  выполнять SQL: старый код не умеет читать новые статусы заказа.

## Порядок

1. Остановить трафик на API (предыдущий commit уже задеплоен или
   приложение остановлено).
2. Снять дамп затрагиваемых таблиц:

   ```bash
   pg_dump "$DATABASE_URL" --data-only \
     --table=public.payments \
     --table=public.seller_payment_accounts > payments-backup.sql
   ```

3. Вернуть заказы в `new` и удалить платёжные таблицы в одной
   транзакции:

   ```sql
   BEGIN;

   UPDATE orders
   SET status = 'new', updated_at = now()
   WHERE status IN ('payment_pending', 'paid');

   DROP TABLE IF EXISTS "payments";
   DROP TABLE IF EXISTS "seller_payment_accounts";

   COMMIT;
   ```

4. Удалить запись миграции `0004` из журнала drizzle, иначе следующий
   `db:migrate` не применит её повторно:

   ```sql
   SELECT id, hash, created_at
   FROM drizzle.__drizzle_migrations
   ORDER BY id DESC
   LIMIT 1;

   -- Убедиться, что последняя запись — 0004, затем:
   DELETE FROM drizzle.__drizzle_migrations WHERE id = <id из шага выше>;
   ```

5. Проверить откат:

   ```sql
   SELECT to_regclass('public.payments') IS NULL AS payments_dropped,
          to_regclass('public.seller_payment_accounts') IS NULL AS accounts_dropped;

   SELECT count(*) AS payment_tables_left
   FROM pg_class
   WHERE relname IN ('payments', 'seller_payment_accounts');

   SELECT typname, count(e.enumlabel) AS labels
   FROM pg_type t
   JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname IN ('order_status', 'payment_status', 'seller_payment_account_status')
   GROUP BY typname
   ORDER BY typname;
   ```

   Ожидается `payments_dropped = true`, `accounts_dropped = true`,
   `payment_tables_left = 0`; enum-значения остались:
   `order_status` — 3, `payment_status` — 5,
   `seller_payment_account_status` — 4.

6. Smoke предыдущей версии API: каталог, корзина, checkout, заказы
   работают; ручек оплаты и полей `payment_*` нет.

## Повторный деплой после отката

1. Задеплоить код с миграцией `0004`.
2. Применить миграцию:

   ```bash
   pnpm db:migrate
   ```

   `0004` идемпотентна по enum: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
   и `CREATE TYPE` в `DO`-блоке с `duplicate_object`. Таблицы создаются
   заново, потому что шаг 3 их удалил.
3. Проверить, что enum-значения не задвоились, а таблицы и индексы на
   месте:

   ```sql
   SELECT typname, count(e.enumlabel) AS labels
   FROM pg_type t
   JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname IN ('order_status', 'payment_status', 'seller_payment_account_status')
   GROUP BY typname
   ORDER BY typname;

   SELECT count(*) AS payment_indexes
   FROM pg_indexes
   WHERE tablename IN ('payments', 'seller_payment_accounts');
   ```

   Ожидается 3/5/4 значения и 11 индексов (включая pkey и `payments_pending_reconcile_idx`).

## Полный rebuild enum

`DROP TYPE order_status` требует пересоздания типа и всех колонок,
которые его используют, с downtime и потерей статусов заказов. Это не
штатный откат: только отдельный скрипт с бэкапом и окном
обслуживания. Для `payment_status`/`seller_payment_account_status`
rebuild не нужен: их можно оставить, повторный деплой их переиспользует.

## Проверка на тестовой БД

Проверено 27.11.2026 на `localhand_s2_test`
(`DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`):

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test'

# 1. up
DATABASE_URL="$DATABASE_URL_TEST" pnpm db:migrate

# 2. down (шаг 3) + удаление записи 0004 из drizzle.__drizzle_migrations
psql "$DATABASE_URL_TEST" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE orders SET status = 'new', updated_at = now()
WHERE status IN ('payment_pending', 'paid');
DROP TABLE IF EXISTS "payments";
DROP TABLE IF EXISTS "seller_payment_accounts";
COMMIT;
DELETE FROM drizzle.__drizzle_migrations
WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
SQL

# 3. повторный up
DATABASE_URL="$DATABASE_URL_TEST" pnpm db:migrate
```

Результат: после down таблиц нет, enum-значения на месте; повторный up
не падает на существующих enum, таблицы и 11 индексов восстановлены.
После проверки тестовая БД оставлена в состоянии `0004` для DB-тестов.

## Ссылки

- Миграция: `apps/api/drizzle/0004_*.sql`.
- Change: `openspec/changes/06-payments`, task 1.7.
- Design: `openspec/changes/06-payments/design.md`.
- Похожая процедура: `docs/stack/runbooks/orders-rollback.md`.
