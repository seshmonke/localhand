# Runbook: откат доставки (0006)

Откат схемы `0006` и интеграции СДЭК. T2: перед выполнением — backup,
остановка API, второй человек/владелец на подтверждение. Не запускать на
проде без инцидента.

## Когда применять

- Миграция `0006` сломала checkout/заказы и forward-fix не успевает.
- Нужно выключить CDEK, сохранив данные заказов.
- Ошибочно созданные отправления/подписки.

## 1. Выключить доставку без отката схемы (первый выбор)

Быстрее и безопаснее, чем drop:

```bash
# API: убрать провайдера и перезапустить
DELIVERY_PROVIDER=
```

- Checkout без доставки вернёт `delivery_unavailable`; старые заказы и
  snapshots остаются.
- Вебхук можно оставить: он проверяет локальный заказ и ничего не
  создаёт.
- Подписку CDEK удалить через `GET /v2/webhooks` →
  `DELETE /v2/webhooks/{uuid}`; не трогать чужие подписки тестового
  аккаунта.

## 2. Остановить фоновые процессы

1. Остановить API (reconcile и вебхуки не должны писать в БД).
2. Удалить/остановить cron reconcile, если вынесен.
3. Зафиксировать время остановки.

## 3. Backup и выгрузка

```bash
pg_dump "$DATABASE_URL" --format=custom --file=delivery-backup.dump
```

Выгрузить до drop:

```sql
COPY (SELECT * FROM order_deliveries) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM delivery_events) TO STDOUT WITH CSV HEADER;
```

Экспорт содержит имя/телефон получателя — ПДн. Хранить в защищённом
месте, не коммитить, удалить после инцидента по политике retention.

## 4. Откат схемы

```sql
BEGIN;

DROP TABLE IF EXISTS delivery_events;
DROP TABLE IF EXISTS order_deliveries;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_kopecks_check;
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_kopecks;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weight_g_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_length_cm_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_width_cm_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_height_cm_check;
ALTER TABLE products DROP COLUMN IF EXISTS weight_g;
ALTER TABLE products DROP COLUMN IF EXISTS length_cm;
ALTER TABLE products DROP COLUMN IF EXISTS width_cm;
ALTER TABLE products DROP COLUMN IF EXISTS height_cm;

ALTER TABLE shops DROP COLUMN IF EXISTS cdek_city_code;
ALTER TABLE shops DROP COLUMN IF EXISTS cdek_city_name;
ALTER TABLE shops DROP COLUMN IF EXISTS cdek_shipment_point;

DROP TYPE IF EXISTS delivery_status;

COMMIT;
```

Удалить запись миграции из журнала Drizzle, иначе повторный `db:migrate`
не применит `0006`. Сначала найти hash последней миграции (в `_journal.json`
hash нет, он хранится в таблице):

```sql
SELECT id, hash, created_at
  FROM drizzle.__drizzle_migrations
 ORDER BY created_at DESC
 LIMIT 5;
```

Сверить `created_at` с `when` из `apps/api/drizzle/meta/_journal.json`
(запись `0006_*`), затем удалить именно её:

```sql
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = '<hash из SELECT выше>'
   AND created_at = <when из journal>;
```

## 5. Оплаченные заказы

- `orders.total_kopecks` **не пересчитывать**: деньги уже списаны с
  учётом доставки.
- `order_deliveries`/события сохранены в выгрузке; после отката их нет
  в БД. Повторный forward-run `0006` создаст пустые таблицы — данные не
  восстановятся автоматически.
- Покупателю/продавцу сообщить трек вручную; заказы остаются `paid`.
- Возвраты/разница — только через кабинет ЮKassa и runbook
  `payments-manual-review.md`; автоматического refund нет.

## 6. Проверка после отката

```bash
pnpm db:migrate
pnpm verify
curl -s http://localhost:3000/health
```

- Checkout без delivery работает, `delivery_kopecks` отсутствует.
- `/delivery/*`, `/seller/orders/:id/delivery` → 404.
- В логах нет PII/секретов.

## 7. Forward-fix

1. Исправить причину в ветке, тест RED→GREEN.
2. `0006` заново, проверить на копии БД.
3. Включить `DELIVERY_PROVIDER=fake` в preview, затем `cdek` test.
4. Live — только после договора CDEK и `DELIVERY_LIVE_PII=true`.

## Контакты/владельцы

- Доставка: owner S3-2.
- Прод/БД: владелец инфраструктуры.
- ЮKassa/возвраты: runbook платежей.
