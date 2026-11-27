# Runbook: откат миграции `0003` (orders)

Откат аддитивной миграции `apps/api/drizzle/0003_*.sql`: enum
`order_status`, таблицы `orders` и `order_items`.

## Когда применять

- Релиз с checkout/orders откатывается на предыдущую версию API.
- Миграция `0003` ломает прод (ошибка создания/чтения заказов), и
  исправление вперёд невозможно в окне инцидента.

## Последствия

- Удаляются все заказы и позиции заказов: история покупателей и
  продавцов, телефоны и комментарии в `orders`.
- Down SQL необратим. Перед выполнением выгрузить `orders` и
  `order_items` в защищённое хранилище (ПДн, доступ только
  ответственным; не в публичный репозиторий).
- Ручки `/checkout`, `/orders/*`, `/seller/orders/*` на новой версии API
  начнут отвечать `500`, если выполнить SQL до отката кода. Сначала
  остановить трафик и задеплоить предыдущий commit, затем выполнять SQL.

## Порядок

1. Остановить трафик на API (предыдущий commit уже задеплоен или
   приложение остановлено).
2. Снять дамп затрагиваемых таблиц:

   ```bash
   pg_dump "$DATABASE_URL" --data-only --table=public.orders \
     --table=public.order_items > orders-backup.sql
   ```

3. Выполнить down SQL в одной транзакции:

   ```sql
   BEGIN;
   DROP TABLE IF EXISTS "order_items";
   DROP TABLE IF EXISTS "orders";
   DROP TYPE IF EXISTS "public"."order_status";
   COMMIT;
   ```

4. Удалить запись миграции `0003` из журнала drizzle, иначе следующий
   `db:migrate` новой версии не применит `0003` повторно:

   ```sql
   SELECT id, hash, created_at
   FROM drizzle.__drizzle_migrations
   ORDER BY id DESC
   LIMIT 1;

   DELETE FROM drizzle.__drizzle_migrations WHERE id = <id из шага выше>;
   ```

5. Проверить откат:

   ```sql
   SELECT to_regclass('public.orders') IS NULL AS orders_dropped,
          to_regclass('public.order_items') IS NULL AS order_items_dropped;

   SELECT count(*) AS order_status_left
   FROM pg_type WHERE typname = 'order_status';
   ```

   Ожидается `orders_dropped = true`, `order_items_dropped = true`,
   `order_status_left = 0`.

6. Smoke: каталог, корзина, seller shop/product работают; checkout и
   orders отсутствуют в предыдущей версии API.

## Проверка на тестовой БД

Процедура проверена 27.11.2026 на `localhand_s2_test`
(`DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`):

```bash
psql "$DATABASE_URL_TEST" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "orders";
DROP TYPE IF EXISTS "public"."order_status";
COMMIT;
SQL

psql "$DATABASE_URL_TEST" -c \
  "SELECT to_regclass('public.orders'), to_regclass('public.order_items'),
          (SELECT count(*) FROM pg_type WHERE typname = 'order_status');"
```

Результат: обе таблицы `NULL`, тип `order_status` отсутствует. После
проверки тестовая БД восстановлена (`DROP SCHEMA public CASCADE; CREATE
SCHEMA public;` + `pnpm db:migrate` с `DATABASE_URL` тестовой БД), все
DB-тесты снова зелёные.

## Восстановление после отката

- Вернуть код с миграцией `0003` и применить её заново (`pnpm db:migrate`).
- Данные заказов из шага 2 не восстанавливаются автоматически: импорт
  только вручную и только если это разрешено политикой ПДн.

## Ссылки

- Миграция: `apps/api/drizzle/0003_*.sql`.
- Change: `openspec/changes/05-checkout-orders`, task 3.7.
