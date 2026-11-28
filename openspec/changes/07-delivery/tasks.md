# Tasks: delivery

Tier T2. TDD RED→GREEN→REFACTOR для каждого AC. Три PR/цикла:
A foundation, B checkout/UI, C shipment/status/e2e.

## 0. До кода

- [x] 0.1 Threat model delivery в `docs/quality/threat-model.md`: PII, quote token, CDEK webhook spoof, manual duplicate, live-PII gate.
- [x] 0.2 Contract/property-план: CDEK fixtures, quote total/volumetric, HMAC/TTL, event idempotency.
- [x] 0.3 SLO/бюджет: API p95<500ms без сети, error<1%, availability 99.5%; CDEK timeout 10s/200 RPS.
- [x] 0.4 TDD-трассировка AC→RED-тест в `S3-2-tdd.md`; owner exceptions mutation/SAST до Q1.3/Q1.4.

## 1. PR A: schema/contracts/provider

- [x] 1.1 RED: schema/contract tests падают (dimensions, shop city/point, delivery, quote token).
- [x] 1.2 Миграция `0006`: products dimensions, shops `cdek_city_code/name/shipment_point`, orders `delivery_kopecks`, `order_deliveries` (`quoted|created|in_transit|delivered|canceled|manual|failed`), `delivery_events` unique `(delivery_id,status_code,occurred_at)`.
- [x] 1.3 Shared contracts: city/point/quote/quoteToken (per-shop payload), delivery snapshot, seller tariffs, shipment create/manual, status; PII length/format; tests.
- [x] 1.4 Env: `DELIVERY_PROVIDER=cdek|fake|manual`, `DELIVERY_ENV=test|live`, `DELIVERY_QUOTE_SECRET`, `DELIVERY_LIVE_PII=false`, `CDEK_*`; fail-closed live-PII guard, tests/`.env.example`.
- [x] 1.5 `DeliveryProvider` + fake CDEK (cities/points/quote/tariffs/create/get) без сети; outbound limiter skeleton.
- [x] 1.6 Down SQL/runbook `delivery-rollback.md` (paid orders/total, webhook cleanup).
- [x] 1.7 `pnpm verify`; PR A evidence.

## 2. PR B: quote/checkout/seller data/UI

- [x] 2.1 RED: quote/checkout/UI tests падают.
- [ ] 2.2 CDEK client OAuth/cache/cities/points/calculator; point-city validation; volumetric weight; fake fixtures.
- [x] 2.3 `GET /delivery/cities`, `/points`, `POST /delivery/quote`; signed quoteToken TTL 10 мин/hash; 30/min; no-store.
- [x] 2.4 Checkout schema `delivery {cityCode,pointCode,recipientName,quoteToken}`; per-shop verify; `delivery_kopecks`/total; 409 stale/invalid/shop tamper; DB tests multi-shop/dimensions/city/point/total.
- [x] 2.5 Product dimensions API/contracts + admin product form; shop city/PVZ API + `/admin/shop`; `shop_shipment_point_missing` test.
- [ ] 2.6 Checkout UI: city/PVZ/quote/price/period/recipient name; errors/retry; axe.
- [x] 2.7 Orders API/UI delivery snapshot; old orders 0; `pnpm verify`; PR B evidence.

## 3. PR C: shipment/status/manual/e2e

- [ ] 3.1 RED: shipment/webhook/manual/e2e tests падают.
- [x] 3.2 `GET /seller/orders/:id/delivery/tariffs` (paid, CDEK from shop city/point to buyer PVZ).
- [x] 3.3 `POST /seller/orders/:id/delivery {tariffCode}`: paid-only, tariff must equal paid quote/price, 409 `delivery_tariff_mismatch`, idempotent `number=order-{id}`, `shipment_point`; CDEK `202` обрабатывается внутренне, локальный ответ `201`, provider id/number, `created`; reconcile before retry.
- [x] 3.4 `PATCH /seller/orders/:id/delivery` manual carrier/track: only paid + no CDEK order; 409 if exists.
- [x] 3.5 `GET /seller/orders/:id/delivery`, buyer `GET /orders/:id/delivery`; authz 404; no-store.
- [x] 3.6 Webhook `/delivery/cdek/webhook`: verify GET (unknown 404, invalid 400, verify fail 502), idempotent events, mapping, 60/min, no-store; `ensureWebhook` one ORDER_STATUS.
- [x] 3.7 Reconcile 60s: created/in_transit >2 мин; delivered; unknown raw; `quoted` не авто-`failed`; timeout/duplicate safety.
- [x] 3.8 Seller UI: tariffs/create/manual/events; buyer delivery card; states/a11y.
- [ ] 3.9 API/DB e2e: quote→checkout→paid→create→webhook→track; manual after definitive fail; no duplicate; PII logs.
- [ ] 3.10 Browser e2e PVZ→checkout→delivery/manual; axe 320/1440 light/dark; preview LCP<2500; bundle.
- [x] 3.11 ADR 0005, runbooks webhook/reconcile/manual/rollback; `openspec validate --all --strict`; evidence `S3-2-3.11-*`.

## 4. Close

- [ ] 4.1 Archive `07-delivery`; board/state/daily; owner live/CDEK contract remains external.
- [ ] 4.2 Ozon backlog PBI (provider seam, contract/B2B; after MVP).
