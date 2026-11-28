# Runbook: откат доставки (0006)

Откат схемы `0006` и интеграции СДЭК. T2: перед выполнением — backup,
остановка API, второй человек/владелец на подтверждение. Не запускать на
проде без инцидента.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/runbooks/delivery-cdek-webhook.md`,
`docs/stack/runbooks/delivery-reconcile.md`,
`docs/stack/runbooks/delivery-manual-track.md`.

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
  создаёт. Если провайдер выключен, endpoint отвечает `502`.
- Подписку CDEK удалять только после выключения провайдера и только на
  **собственном** аккаунте: при следующем старте с CDEK
  `ensureOrderStatusWebhook` создаст её снова. `GET /v2/webhooks` →
  `DELETE /v2/webhooks/{uuid}`; CDEK допускает две подписки на обычного
  клиента, удалять только совпадающую с текущим `CDEK_WEBHOOK_URL` или
  подтверждённо чужую/устаревшую. Детали — `delivery-cdek-webhook.md`.
- **Общую тестовую учётную запись CDEK не трогать.** У неё уже четыре
  подписки; её подписки не удалять и не изменять. Если совпадения с
  текущим URL нет, `ensureOrderStatusWebhook` даёт
  `delivery_webhook_subscription_failed reason=conflict`; при совпадении
  — no-op. Для webhook-тестов нужен отдельный аккаунт.

## 2. Остановить фоновые процессы

1. Остановить API (reconcile и вебхуки не должны писать в БД).
   Reconcile в v1 живёт в процессе API; отдельного cron нет. Дождаться
   graceful shutdown: таймер останавливается, текущий проход
   прерывается между строками.
2. Проверить, что второй API-инстанс не запущен: reconcile и подписка
   не имеют распределённой блокировки (`delivery-reconcile.md`,
   `delivery-cdek-webhook.md`).
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

Не запускать `pnpm db:migrate` после отката: он снова применит `0006`.
Запись миграции удаляется только после проверки отката (шаг 6).

## 5. Проверить откат до удаления записи миграции

```sql
SELECT to_regclass('public.order_deliveries') IS NULL AS deliveries_dropped,
       to_regclass('public.delivery_events') IS NULL AS events_dropped;

SELECT count(*) AS delivery_columns_left
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name = 'delivery_kopecks';

SELECT count(*) AS origin_columns_left
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'shops'
  AND column_name IN ('cdek_city_code', 'cdek_city_name', 'cdek_shipment_point');

SELECT count(*) AS delivery_types_left
FROM pg_type
WHERE typname = 'delivery_status';
```

Ожидается: `deliveries_dropped = true`, `events_dropped = true`, все
`*_left = 0`.

API smoke — на staging, развёрнутом с **pre-delivery SHA** (commit до
`0006`, без delivery-роутов). SHA зафиксировать в тикете инцидента; на
прод трафик не переключать до проверки. Доставка выключена.

```bash
# API_URL указывает на staging с pre-delivery SHA.
curl -s -o /dev/null -w 'health=%{http_code}\n' "$API_URL/health"
```

- `/health` → `200`.
- Checkout/orders работают без `delivery_kopecks`; заказ не падает на
  отсутствующих delivery-колонках.
- `/orders/:id/delivery` и `/seller/orders/:id/delivery` в предыдущей
  версии API отсутствуют (`404`).
- В логах нет PII/секретов.

## 6. Удалить запись миграции

Только после успешной проверки шага 5. Иначе повторный `db:migrate`
применит `0006` заново к уже откатанной схеме. Сначала найти hash
последней миграции (в `_journal.json` hash нет, он хранится в таблице):

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

## 7. Оплаченные заказы

- `orders.total_kopecks` **не пересчитывать**: деньги уже списаны с
  учётом доставки.
- `order_deliveries`/события сохранены в выгрузке; после отката их нет
  в БД. Повторный forward-run `0006` создаст пустые таблицы — данные не
  восстановятся автоматически.
- Покупателю/продавцу сообщить трек вручную; заказы остаются `paid`.
- Возвраты/разница — только через кабинет ЮKassa и runbook
  `payments-manual-review.md`; автоматического refund нет.

## 8. Forward-fix

Forward-fix — отдельное решение после инцидента, не часть проверки
отката.

1. Исправить причину в ветке, тест RED→GREEN.
2. На копии/staging применить `0006` заново (`pnpm db:migrate`) и
   проверить миграцию/тесты.
3. Включить `DELIVERY_PROVIDER=fake` в preview, затем `cdek` test.
4. Live — только после договора CDEK и `DELIVERY_LIVE_PII=true`.

## Контакты/владельцы

- Доставка: owner S3-2.
- Прод/БД: владелец инфраструктуры.
- ЮKassa/возвраты: runbook платежей.
