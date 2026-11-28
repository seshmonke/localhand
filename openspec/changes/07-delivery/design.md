# Design: delivery

## Context

- CDEK v2 OpenAPI 3.0.1: test `api.edu.cdek.ru`, prod `api.cdek.ru`;
  OAuth query token, calculator, async order `202`, `ORDER_STATUS`
  webhook, ≤2 subscriptions, 200 RPS. Сверено 27.11.2026,
  `docs/stack/integrations/cdek.md`.
- Owner decision 27.11.2026: **один договор CDEK на платформе**;
  продавцы сдают посылку в выбранный ПВЗ платформенного аккаунта;
  Ozon — второй адаптер после MVP.
- S3-2 — PVZ-only; door delivery позже. Статусы заказа
  `shipped/delivered` — S3-3.
- Юрпакет/ПДн не закрыт: реальные имена/телефоны/адреса запрещены;
  `DELIVERY_LIVE_PII=false` по умолчанию.

## T2 DoR

- Threat model: `docs/quality/threat-model.md` раздел delivery (PII,
  webhook, quote token, provider spoof, manual duplicate).
- Contract tests: CDEK create/quote fixtures; shared schemas.
- Property tests: quote total, volumetric weight, signed token TTL,
  provider event idempotency.
- SLO: API p95 < 500 ms без сети провайдера, error rate < 1%,
  availability 99,5%; CDEK timeout 10 s; outbound 200 RPS.
- TDD: AC → RED-тест (unit/API/e2e) → GREEN → REFACTOR.
- Mutation/SAST: owner exception до Q1.3/Q1.4; property/contract/threat
  model в этом PBI.

## Decisions

### Provider seam

`DeliveryProvider`:

- `listCities(query)`, `listPoints(cityCode)`.
- `quote(input): QuoteResult` — from shop city/shipment point to buyer
  city/point; packages.
- `listTariffs(input): Tariff[]` — seller choice.
- `createShipment(input): { providerOrderId, number, status }`.
- `getShipment(providerOrderId): { statusCode, statusName, track? }`.
- `ensureWebhook(): void`, `parseWebhook` — CDEK-specific at adapter.
- `manual` — только seller-side fallback, не quote/checkout.

### Схема `0006`

- `products`: `weight_g int null check >0`, `length_cm/width_cm/
  height_cm int null check >0`.
- `shops`: `cdek_city_code int null`, `cdek_city_name text null`,
  `cdek_shipment_point text null` — город/ПВЗ сдачи продавца.
- `orders`: `delivery_kopecks bigint not null default 0 check >=0`;
  `total_kopecks = items + delivery` (инвариант, check в сервисе).
- `order_deliveries`: `order_id` unique FK orders cascade, `provider`
  (`cdek|manual|fake`), `status`
  (`quoted|created|in_transit|delivered|canceled|manual|failed`),
  `city_code`, `city_name`, `point_code`, `point_address`,
  `recipient_name`, `recipient_phone`, `provider_tariff_code`,
  `tariff_name`, `price_kopecks`, `period_min/max`,
  `provider_order_id`, `provider_number`, `carrier`, `track_number`,
  `last_status_code`, `last_status_at`, `created_at`, `updated_at`.
- `delivery_events`: id, delivery_id FK cascade, status_code,
  status_name, occurred_at, payload_hash, created_at; unique
  `(delivery_id, status_code, occurred_at)` (CDEK не даёт event id;
  нормализуем `status_date_time`).
- `orders.delivery_kopecks` — snapshot для оплаты; `order_deliveries.
  price_kopecks` — источник цены доставки; инвариант проверяется
  тестом/сервисом, manual цену не меняет (0/уже оплачено).
- Down SQL/runbook: откат `0006`, очистка webhook-подписки, что делать
  с оплаченными заказами (delivery snapshot остаётся в выгрузке;
  `orders.total` не пересчитывать).

### Quote и checkout

- `GET /delivery/cities?query=` — CDEK suggest, public, 30/min.
- `GET /delivery/points?cityCode=` — PVZ, public, 30/min; точка
  проверяется на принадлежность городу.
- `POST /delivery/quote` body `{items: [{productId}], cityCode,
  pointCode}`; auth не обязателен, 30/min; сервер:
  - группирует items по shop; проверяет published, dimensions,
    shop city/shipment point;
  - точки: `point.city_code == cityCode`;
  - packages: одна упаковка на заказ; вес = сумма, габариты = max;
    объёмный вес CDEK `L*W*H/5000` **кг**, поэтому в граммах
    `volumetric_g = ceil(L*W*H/5)`; billing weight
    `max(weight_g, volumetric_g)`; fixture 20×15×10 → 600 г,
    21×14×11 → ceil(646.8) = 647 г;
  - CDEK `calculator/tarifflist`, самый дешёвый тариф с доставкой до
    ПВЗ; `delivery_sum` рублей → `Math.round(delivery_sum * 100)`
    копеек (одно правило на quote и seller-сверку), `period_min/max`;
  - возвращает `{ quoteToken, expiresAt, shops:[...] }`; `quoteToken` —
    HMAC (`DELIVERY_QUOTE_SECRET`) над canonical JSON:
    `{v:1, productHash, cityCode, pointCode, exp,
    shops:[{shopId, tariffCode, priceKopecks, periodMin, periodMax}]}`;
    один и тот же набор shopId, что в корзине; TTL 10 мин.
- Checkout body: `delivery: { cityCode, pointCode, recipientName,
  quoteToken }`; phone — snapshot `orders.buyer_phone` на checkout, не
  сессия в момент создания отправления.
  - verify HMAC/TTL/hash/city/point и наличие ровно одного shop-entry
    на каждую группу корзины; цены берутся per-shop из подписанного
    quote, не от клиента; подмена любого shopId/цены ломает HMAC;
  - если products изменились/цена устарела — 409
    `delivery_quote_stale`, новый quote;
  - создаёт order с `delivery_kopecks`, `total=items+delivery`,
    `order_deliveries` `quoted` snapshot с `provider_tariff_code` и
    `price_kopecks` из токена;
  - нет quote/размеров/города/ПВЗ сдачи — 409/502, без частичного
    заказа.
- `DELIVERY_PROVIDER=fake` — deterministic quote для test/e2e, без
  сети; `manual` не используется в checkout.

### Seller: тариф и отправление

- `GET /seller/orders/:id/delivery/tariffs` — для paid-заказа:
  CDEK `tarifflist` from shop city/shipment point to buyer PVZ;
  показывает доступные тарифы и помечает оплаченный
  (`provider_tariff_code`, `price_kopecks`). Seller не может изменить
  цену доставки: оплаченный тариф — единственный допустимый.
  Для paid-заказа без `order_deliveries` (создан до 0006) CDEK create
  возвращает 409 `delivery_snapshot_missing`; доступен только manual
  carrier/track, потому что ПВЗ/получатель не сохранены.
- `POST /seller/orders/:id/delivery` body `{tariffCode}`; paid-only;
  idempotent by order; если delivery уже `created+` — 409/return;
  `tariffCode` обязан совпасть с оплаченным `provider_tariff_code`,
  а текущая цена CDEK — с `price_kopecks`; иначе 409
  `delivery_tariff_mismatch` без создания отправления и без изменения
  `orders.total`. Разница тарифов — ручной разбор/ops, не автомат;
  `number = order-{id}`, `im_number` только search; packages из
  order items; `shipment_point = shop.cdek_shipment_point`,
  recipient buyer name/phone, delivery_point buyer point.
  CDEK `POST /v2/orders` → 202; store provider order id/request uuid;
  status `created`; poll.
- Property/DB-тест: чужой/подешевевший/подорожавший тариф → 409,
  `price_kopecks` и `total` не меняются; оплаченный тариф → create.
- `GET /seller/orders/:id/delivery` — snapshot/events.
- Manual `PATCH /seller/orders/:id/delivery` `{carrier, trackNumber}`:
  - только paid;
  - при `DELIVERY_PROVIDER=manual` API-проверка не нужна;
  - при CDEK — только если нет `provider_order_id` и поиск
    `GET /v2/orders?im_number=number` подтвердил отсутствие заказа;
    5xx/timeout → 502, ручной трек блокируется до reconcile (D6);
  - status `manual`, track; не перезаписывает CDEK;
  - повтор/изменение — 409 `delivery_already_exists`.
- `DELIVERY_PROVIDER=manual` — только seller fallback, checkout всё
  равно требует quote (fake/test в preview).

### CDEK adapter

- Env: `CDEK_CLIENT_ID/SECRET`, `CDEK_API_URL`,
  `CDEK_WEBHOOK_URL=https://.../delivery/cdek/webhook`,
  `DELIVERY_ENV=test|live`, `DELIVERY_LIVE_PII=false`.
- Fail-closed:
  - `DELIVERY_ENV=live` требует `DELIVERY_LIVE_PII=true`, иначе
    startup error; `true` — только после юрпакета и решения владельца.
  - `NODE_ENV=production` (preview) допускает только
    `DELIVERY_PROVIDER=fake`, пока `DELIVERY_LIVE_PII=false`; реальный
    CDEK в preview не стартует.
  - `DELIVERY_ENV=test` требует тестовый хост CDEK
    (`api.edu.cdek.ru`); prod-хост в test — startup error.
  - `DELIVERY_PROVIDER=fake` в live запрещён.
- OAuth `POST /v2/oauth/token?grant_type=client_credentials...`; cache
  token до `expires_in` (3599); Bearer; 401 → refresh once.
- Outbound limiter 200 RPS (token bucket), timeout 10 s, retry only
  GET/5xx/429 with backoff.
- `ensureWebhook`: `GET /v2/webhooks`; if no matching `ORDER_STATUS` +
  URL and <2 subscriptions — `POST /v2/webhooks`; if 2 and no match —
  log/ops, не создавать третий. Общая тестовая учётная запись уже имеет
  четыре подписки: её подписки не трогать; `ensureWebhook` даёт conflict,
  только если среди них нет совпадения с текущим URL (при совпадении —
  no-op); для webhook-тестов нужен отдельный аккаунт. Runbook.
- Webhook `POST /delivery/cdek/webhook`:
  - no signature; lookup `uuid`/`cdek_number`/`number`; verify via
    `GET /v2/orders/{uuid}`; неизвестный локальный заказ → 404,
    невалидное тело → 400, ошибка/таймаут верификации → 502 (провайдер
    повторит); валидный replay → 200 no-op; log code.
  - idempotent event by `(delivery_id,status_code,occurred_at)`;
  - status mapping: `DELIVERED`→delivered; `NOT_DELIVERED`/`RETURNED`
    →canceled; `CREATED/ACCEPTED`→created; known → in_transit;
    unknown → in_transit + raw code;
  - no-store, 60/min IP.
- Reconcile 60 s: `created|in_transit` older 2 min → `GET`; update;
  `quoted` без отправления не меняет статус автоматически (ждёт
  действия продавца); UI показывает «Ожидает отправки», статус не
  становится `failed`; shipment не создаётся автоматически, создание —
  отдельное действие продавца. Отдельное 24-часовое напоминание —
  backlog, не реализовано в этом change.
- URL docs sync `/delivery/cdek/webhook` (not `/payments/...`).

### Manual duplicate safety

- If CDEK create returns 5xx/timeout, do **not** mark manual
  immediately: reconcile by `number` via `GET /v2/orders?im_number=`.
  If CDEK order exists → keep `created`; if definitively absent and
  provider returns 4xx/no order → manual allowed. Test both.
- `delivery_events` unique; manual sets one event.

### PII/legal

- `recipient_name`/`recipient_phone`/PVZ address — PII; logs only
  ids/provider/status; no-store; authz buyer/seller; fake data in
  preview.
- `DELIVERY_LIVE_PII=false` default: `live` не стартует без `true`;
  `test`/`fake`/preview работают только с вымышленными данными, live-ПВЗ
  и реальные получатели недоступны. Test: env guard + redaction.
- Retention/deletion: order PII deletion runbook (anonymize name/phone
  on request); no real PII in repo.

### UI

- Checkout: city/PVZ/quote/price/period; errors; a11y.
- `/orders/:id`: delivery card, track, status; no PII beyond own.
- `/admin/orders/:id`: tariff list, create, manual, events.
- `/admin/shop`: city/shipment point; `/admin/products`: dimensions.
- Loading/error/retry states; axe light/dark 320/1440.

### Errors

`delivery_dimensions_missing`, `shop_city_missing`,
`shop_shipment_point_missing`, `delivery_point_invalid`,
`delivery_quote_stale`, `delivery_required`, `delivery_unavailable`,
`delivery_not_paid`, `delivery_snapshot_missing`, `delivery_tariff_mismatch`,
`delivery_provider_error`, `delivery_already_exists`. Повтор `POST` create
возвращает `201` с существующим snapshot; manual-дубль — `409
delivery_already_exists`.

## Alternatives

- Door delivery — later (PII/legal).
- Seller-level CDEK — later; platform account owner decision.
- Ozon now — contract/B2B, new API; after MVP.
- Manual checkout — rejected (no price/quote).
- Client price — rejected; signed server quote.

## Risks

- CDEK contract not signed: test/fake now, live later; manual fallback.
- Async 202/timeout duplicate: reconcile before manual/retry.
- PII/legal: live PII gate off; fake only.
- Ozon new/B2B: separate PBI.
- Delivery price in order total affects payments; invariant tests.
