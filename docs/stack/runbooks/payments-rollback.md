# Runbook: откат миграций `0004`–`0005` (payments)

Откат двух аддитивных миграций:

- `apps/api/drizzle/0004_*.sql` — enum `payment_status`, enum
  `seller_payment_account_status`, расширение `order_status`
  значениями `payment_pending`/`paid`, таблицы
  `seller_payment_accounts` и `payments`.
- `apps/api/drizzle/0005_*.sql` — fail-closed default
  `seller_payment_accounts.status = 'error'`, поля
  `payments.reconcile_attempts`/`last_checked_at`, partial index
  `payments_pending_reconcile_idx`.

Опубликованные миграции не редактируются: `0004` остаётся ровно в
версии первого коммита, новые поля вынесены в `0005`. `0005` идемпотентна
(`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO`-guard для
constraint) и переживает инстанс, где успела примениться промежуточная
`0004` из ветки до split. Journal `0004` не меняется.

## Когда применять

- Релиз с оплатой откатывается на предыдущую версию API.
- Миграция `0005` ломает прод: откатить только её, `0004` оставить.
- Миграция `0004` ломает прод, и исправление вперёд невозможно в окне
  инцидента: откатить `0005`, затем `0004`.

## Последствия

- Откат `0005` удаляет `reconcile_attempts`, `last_checked_at` и
  partial index; default статуса аккаунта возвращается к `active`.
  Платёжные данные и таблицы `0004` остаются.
- Полный откат `0004` удаляет все платёжные аккаунты и платежи:
  `provider_payment_id`, суммы, статусы, `idempotency_key` и
  зашифрованные токены.
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

3. Откатить `0005` (до любых действий с таблицами `0004`):

   ```sql
   BEGIN;

   DROP INDEX IF EXISTS "payments_pending_reconcile_idx";
   ALTER TABLE "payments"
     DROP CONSTRAINT IF EXISTS "payments_reconcile_attempts_check";
   ALTER TABLE "payments" DROP COLUMN IF EXISTS "reconcile_attempts";
   ALTER TABLE "payments" DROP COLUMN IF EXISTS "last_checked_at";
   ALTER TABLE "seller_payment_accounts"
     ALTER COLUMN "status" SET DEFAULT 'active';

   COMMIT;
   ```

4. Если откатывается только `0005`, удалить последнюю запись журнала
   drizzle и перейти к проверке. При полном откате `0004` этот шаг
   пропустить: записи `0005` и `0004` удаляются вместе на шаге 6.

   ```sql
   SELECT id, hash, created_at
   FROM drizzle.__drizzle_migrations
   ORDER BY id DESC
   LIMIT 1;

   -- Убедиться, что последняя запись — 0005, затем:
   DELETE FROM drizzle.__drizzle_migrations WHERE id = <id из шага выше>;
   ```

5. Для полного отката `0004` вернуть заказы в `new` и удалить
   платёжные таблицы в одной транзакции:

   ```sql
   BEGIN;

   UPDATE orders
   SET status = 'new', updated_at = now()
   WHERE status IN ('payment_pending', 'paid');

   DROP TABLE IF EXISTS "payments";
   DROP TABLE IF EXISTS "seller_payment_accounts";

   COMMIT;
   ```

6. Удалить записи `0005` и `0004` из журнала drizzle, иначе следующий
   `db:migrate` не применит их повторно:

   ```sql
   SELECT id, hash, created_at
   FROM drizzle.__drizzle_migrations
   ORDER BY id DESC
   LIMIT 2;

   -- Убедиться, что две последние записи — 0005 и 0004, затем:
   DELETE FROM drizzle.__drizzle_migrations
   WHERE id IN (
     SELECT id FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2
   );
   ```

7. Проверить откат:

   ```sql
   -- После отката только 0005: таблицы на месте, полей/индекса нет.
   SELECT to_regclass('public.payments') IS NOT NULL AS payments_present,
          to_regclass('public.payments_pending_reconcile_idx') IS NULL AS reconcile_index_dropped,
          column_default
   FROM information_schema.columns
   WHERE table_name = 'seller_payment_accounts' AND column_name = 'status';

   -- После полного отката 0004: таблиц нет, enum-значения остались.
   SELECT to_regclass('public.payments') IS NULL AS payments_dropped,
          to_regclass('public.seller_payment_accounts') IS NULL AS accounts_dropped;

   SELECT typname, count(e.enumlabel) AS labels
   FROM pg_type t
   JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname IN ('order_status', 'payment_status', 'seller_payment_account_status')
   GROUP BY typname
   ORDER BY typname;
   ```

   После отката `0005`: `reconcile_index_dropped = true`, default
   `status` — `'active'`. После отката `0004`: обе таблицы `NULL`,
   enum-значения остались — `order_status` 3, `payment_status` 5,
   `seller_payment_account_status` 4.

8. Smoke предыдущей версии API: каталог, корзина, checkout, заказы
   работают; ручек оплаты и полей `payment_*` нет.

## Повторный деплой после отката

1. Задеплоить код с миграциями `0004` и `0005`.
2. Применить миграции:

   ```bash
   pnpm db:migrate
   ```

   `0004` идемпотентна по enum: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
   и `CREATE TYPE` в `DO`-блоке с `duplicate_object`. Таблицы создаются
   заново, потому что шаг 5 их удалил. `0005` аддитивна: default,
   колонки, constraint и index создаются заново.
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

   Ожидается 3/5/4 значения и 11 индексов (включая pkey и
   `payments_pending_reconcile_idx`).

## Полный rebuild enum

`DROP TYPE order_status` требует пересоздания типа и всех колонок,
которые его используют, с downtime и потерей статусов заказов. Это не
штатный откат: только отдельный скрипт с бэкапом и окном
обслуживания. Для `payment_status`/`seller_payment_account_status`
rebuild не нужен: их можно оставить, повторный деплой их переиспользует.

## Проверка на тестовой БД

Проверено 27.11.2026 на свежей временной БД и `localhand_s2_test`
(`DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`):

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test'

# 1. up: 0000 -> 0005
DATABASE_URL="$DATABASE_URL_TEST" pnpm db:migrate

# 2. down 0005 + удаление записи 0005 из drizzle.__drizzle_migrations
psql "$DATABASE_URL_TEST" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP INDEX IF EXISTS "payments_pending_reconcile_idx";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_reconcile_attempts_check";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "reconcile_attempts";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "last_checked_at";
ALTER TABLE "seller_payment_accounts" ALTER COLUMN "status" SET DEFAULT 'active';
COMMIT;
DELETE FROM drizzle.__drizzle_migrations
WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
SQL

# 3. повторный up 0005
DATABASE_URL="$DATABASE_URL_TEST" pnpm db:migrate

# 4. для полного отката: down 0004 (шаг 5) + удаление двух записей журнала,
#    затем повторный up 0004 и 0005.
```

Результат: 0000→0005 применяется на свежей БД; после down 0005 полей и
индекса нет, default `status` снова `active`; повторный up возвращает
11 индексов. Journal `0004` не меняется (`when` и hash остаются
исходными). Инстанс с промежуточной `0004` из ветки до split также
проходит: `0005` идемпотентна; при сомнении — пересоздать БД.

## Ссылки

- Миграции: `apps/api/drizzle/0004_*.sql`, `0005_*.sql`.
- Change: `openspec/changes/archive/2026-11-27-06-payments`, tasks 1.1/1.7.
- Design: `openspec/changes/archive/2026-11-27-06-payments/design.md`.
- Похожая процедура: `docs/stack/runbooks/orders-rollback.md`.
