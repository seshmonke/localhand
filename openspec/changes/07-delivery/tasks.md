# Tasks: delivery

## 1. Контракты и схема

- [ ] 1.1 Миграция `0006`: product dimensions, shops city, orders delivery_kopecks, `order_deliveries`, `delivery_events`, индексы/checks.
- [ ] 1.2 Shared contracts: city, point, quote, delivery snapshot, shipment create/manual, status; Zod + тесты.
- [ ] 1.3 Env `DELIVERY_PROVIDER`, `DELIVERY_ENV`, `CDEK_*`; guards test/live; `.env.example`.
- [ ] 1.4 Down SQL + runbook `delivery-rollback.md`.

## 2. Quote/ПВЗ

- [ ] 2.1 CDEK client: OAuth token cache, cities/points, calculator.
- [ ] 2.2 `GET /delivery/cities`, `GET /delivery/points`, `POST /delivery/quote`; rate-limit 30/min; grouping by shop.
- [ ] 2.3 Проверка dimensions/city; ошибки 409/502; no-store.
- [ ] 2.4 Fake CDEK adapter для тестов/e2e (без сети).

## 3. Checkout

- [ ] 3.1 Расширить checkout schema `delivery` (city/point/recipientName); серверный пересчёт; order delivery_kopecks/total.
- [ ] 3.2 UI checkout: город/ПВЗ/quote/срок/цена, ошибки, a11y.
- [ ] 3.3 Обновить orders API/UI snapshot; старые заказы delivery 0.
- [ ] 3.4 DB-тесты: multi-shop, цена клиента игнорируется, quote fail, dimensions/city, total/payment.

## 4. Отправление CDEK

- [ ] 4.1 `POST /seller/orders/:id/delivery`: paid only, idempotent, CDEK create `202`, store UUID/status.
- [ ] 4.2 Async poll `GET /v2/orders/{uuid}` 2–3 с/timeout 60; status mapping; reconcile 60 с.
- [ ] 4.3 Webhook `POST /delivery/cdek/webhook`: verify GET, idempotent events, rate-limit/no-store.
- [ ] 4.4 Manual `PATCH /seller/orders/:id/delivery` carrier/track; status manual; not overwrite CDEK.
- [ ] 4.5 Authz buyer/seller, PII/logs, 404/409/502.
- [ ] 4.6 DB-тесты: paid gate, repeat, 202, webhook replay, unknown status, manual, reconcile.

## 5. UI доставки

- [ ] 5.1 `/orders/:id`: delivery card (ПВЗ, цена, срок, carrier, track, status).
- [ ] 5.2 `/admin/orders/:id`: создать CDEK, manual carrier/track, статус/events.
- [ ] 5.3 `/admin/shop`: город отправки.
- [ ] 5.4 Состояния loading/error/empty/retry, a11y, no PII в URL.

## 6. Проверка

- [ ] 6.1 Unit: CDEK client/fixtures, status mapping, token cache.
- [ ] 6.2 API e2e: quote → checkout → paid → create → webhook → track; manual.
- [ ] 6.3 Browser e2e: PVZ checkout, order delivery, seller create/manual; axe light/dark 320/1440.
- [ ] 6.4 Preview LCP <2500, bundle delta; `pnpm verify`, `openspec validate 07-delivery --strict`.
- [ ] 6.5 Threat model/ADR `0005-delivery`; Ozon seam; evidence `.scrum/sprints/3/evidence/S3-2-*`.

## 7. Документы/закрытие

- [ ] 7.1 ADR 0005: platform CDEK contract, PVZ, manual, Ozon later.
- [ ] 7.2 Runbooks: CDEK webhook/reconcile, manual track, rollback.
- [ ] 7.3 Обновить `docs/stack/integrations/cdek.md` при изменении API.
- [ ] 7.4 Archive `07-delivery` после merge/smoke.
