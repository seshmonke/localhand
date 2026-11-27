# Design: delivery

## Context

- CDEK API v2: OpenAPI 3.0.1, test `api.edu.cdek.ru`, prod
  `api.cdek.ru`; OAuth query token, calculator, async order `202`,
  webhooks `ORDER_STATUS` (≤2 per client), 200 RPS. Сверено 27.11.2026,
  `docs/stack/integrations/cdek.md`.
- Owner decision 27.11.2026: **один договор СДЭК на платформе**;
  продавцы шлют через платформенный аккаунт; Ozon — второй адаптер
  после MVP.
- Sprint 3 S3-2; статусы заказа `shipped/delivered` — S3-3, здесь
  только delivery-статус.
- Юрпакет/ПДн не закрыт: реальные адреса/имена запрещены, только
  вымышленные тестовые данные.

## Decisions

### Provider seam

`DeliveryProvider`:

- `quote(input): QuoteResult` — `fromCityCode`, `toCityCode`,
  `pointCode`, `packages`.
- `createShipment(input): { providerOrderId, status }`.
- `getShipment(providerOrderId): { statusCode, statusName, track? }`.
- `cancel?`.
- `manual` — без API: quote 0/«уточнит продавец»? В v1 quote только
  CDEK; manual — fallback для уже оплаченного заказа, если CDEK create
  недоступен.
- Ozon adapter позже, без изменения заказа/UI.

### Схема `0006`

- `products`: `weight_g int null check >0`, `length_cm/width_cm/
  height_cm int null check >0`. Для физического checkout все обязательны;
  иначе 409 `delivery_dimensions_missing`.
- `shops`: `city_code int null`, `city_name text null` — город отправки
  продавца (CDEK city code); продавец заполняет в `/admin/shop`; для
  quote обязателен, иначе 409 `shop_city_missing`.
- `orders`: `delivery_kopecks bigint not null default 0 check >=0`;
  `total_kopecks` включает доставку. Существующие заказы — 0.
- `order_deliveries`: `order_id` unique FK orders cascade, `provider`
  (`cdek|manual`), `status`
  (`pending|created|in_transit|delivered|canceled|manual|failed`),
  `city_code`, `city_name`, `point_code`, `point_address`,
  `recipient_name`, `recipient_phone`, `tariff_code`, `tariff_name`,
  `price_kopecks`, `period_min/max`, `cdek_order_uuid`,
  `cdek_number`, `carrier`, `track_number`, `last_status_code`,
  `last_status_at`, `created_at`, `updated_at`.
- `delivery_events`: id, delivery_id FK cascade, status_code,
  status_name, occurred_at, payload_hash, created_at; unique
  `(delivery_id, status_code, occurred_at)`.
- Миграция аддитивная, down SQL/runbook `delivery-rollback.md`;
  enum rebuild не требуется.

### Checkout и quote

- `GET /delivery/cities?query=` — CDEK city suggest, public, rate-limit
  30/min, no PII; `GET /delivery/points?cityCode=` — PVZ list.
- `POST /delivery/quote` body `{items: [{productId}], cityCode,
  pointCode}`; auth не обязателен (корзина публична), rate-limit 30/min.
  Сервер группирует items по shop, проверяет published/dimensions/
  shop.city, зовёт CDEK `calculator/tarifflist` (from shop city to
  PVZ city, packages = одна упаковка на заказ: сумма веса, max
  габариты), выбирает самый дешёвый тариф с доставкой до ПВЗ.
  Ответ: `{shops: [{shopId, tariffCode, tariffName, priceKopecks,
  periodMin, periodMax, pointCode, cityCode}]}`.
- Проверка цены на checkout: клиент присылает `delivery: {cityCode,
  pointCode, recipientName}`; сервер **пересчитывает** quote, не
  доверяет цене клиента. Телефон получателя — `buyer_phone` сессии
  (snapshot), отдельно не собираем.
- `POST /checkout` расширяется `delivery`; для каждого shop создаётся
  заказ с `delivery_kopecks` из quote; `total_kopecks = items +
  delivery`. Если quote/размеры/город недоступны — 409/502, заказ не
  создаётся.
- `orders`/`checkout-orders` API возвращают delivery snapshot (без
  PII сверх текущих правил).

### CDEK adapter (test/platform)

- Env: `DELIVERY_PROVIDER=cdek|manual`, `DELIVERY_ENV=test|live`,
  `CDEK_CLIENT_ID`, `CDEK_CLIENT_SECRET`, `CDEK_API_URL`,
  `CDEK_WEBHOOK_URL`, `CDEK_DEFAULT_TARIFF?` (если не выбран).
- OAuth `POST /v2/oauth/token?grant_type=client_credentials...`,
  token cache до `expires_in` (3599), Bearer.
- Quote `POST /v2/calculator/tarifflist`; request `type:1`,
  `from_location.code`, `to_location.code`/`delivery_point`,
  `packages` (weight grams, dimensions cm).
- Create `POST /v2/orders` with `number = order-{id}`,
  `tariff_code`, `recipient` (name/phone), `packages`, `delivery_point`,
  `from_location`; response `202`, store `request_uuid`/`cdek_order_uuid`;
  poll `GET /v2/orders/{uuid}` через 2–3 с, timeout 60 с; не считать
  `202` успехом. `im_number` — только поиск, `number` — уникальный
  номер (см. integration doc).
- Webhook `POST /delivery/cdek/webhook`; no signature — verify via
  `GET /v2/orders/{uuid}`, сверять `cdek_number`/`number`; events
  идемпотентны; rate-limit 60/min; no-store.
- Reconcile: pending/created deliveries раз в 60 с; poll CDEK; unknown
  -> failed/manual_review (delivery status `failed`), ops.
- Status mapping: `DELIVERED` -> `delivered`;
  `NOT_DELIVERED`/`RETURNED` -> `canceled`; `CREATED`/`ACCEPTED` ->
  `created`; остальные известные -> `in_transit`; неизвестный ->
  `in_transit` + raw code (не терять).
- Manual fallback: `PATCH /seller/orders/:id/delivery` body
  `{carrier, trackNumber}`; status `manual`/`shipped` (в v1 `manual`);
  доступно, если CDEK create вернул 502/409 или `DELIVERY_PROVIDER=
  manual`; buyer видит carrier/track. Не отменяет CDEK-попытку
  автоматически.
- Ozon adapter later: same interface; product/order fields нейтральны.

### API и UI

- Buyer: checkout city/PVZ/quote; `/orders/:id` — delivery card
  (carrier, PVZ, price, period, track, status) без чужих данных.
- Seller: `/admin/orders/:id` — «Создать отправление СДЭК» для paid;
  manual carrier/track; status/events; `/admin/shop` — city.
- Authz: buyer own order, seller own shop; чужие 404.
- PII: recipient name/phone, PVZ; не в логах, не в публичных ответах;
  `no-store`; тестовые данные.

### Ошибки

- `delivery_dimensions_missing` 409, `shop_city_missing` 409,
  `delivery_unavailable` 502, `delivery_already_created` 409,
  `delivery_not_paid` 409, `delivery_tariff_unavailable` 409,
  `delivery_provider_error` 502.
- Lоги: order/delivery id, provider, status/code; без name/phone/
  address/raw payload.

## Alternatives

- **Доставка до двери** — отложена: больше PII/адресов, юрпакет.
- **Seller-level CDEK accounts** — отложено: онбординг и токены;
  platform account выбран owner.
- **Ozon сейчас** — договор/B2B, API новый; после MVP.
- **Только manual** — не даёт цену/трек API; fallback, не замена.
- **Цена доставки на клиенте** — отклонено: пересчёт на сервере.

## Risks

- Договор CDEK не заключён: test contour работает, live/реальные
  отправления — после договора; manual fallback для MVP.
- CDEK async/статусы/лимиты; 202 не success, polling/timeout.
- PII имени/телефона/ПВЗ до юрпакета — только тест.
- Ozon API новый/B2B; отдельный PBI после MVP.
- `orders.total` теперь включает доставку; проверить payments/refunds,
  старые заказы (delivery 0).
