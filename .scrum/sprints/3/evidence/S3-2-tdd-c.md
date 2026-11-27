# S3-2 PR C — CDEK adapter, shipment, webhook

Дата: 27.11.2026. Tier T2. Стек: #61 adapter → #62 shipment API.

## RED/GREEN

- RED: pre-code прогон на main — shipment endpoint 404 вместо 401;
  `S3-2-tdd-c-red.txt`.
- GREEN: `pnpm verify` shared 156, web 157, api 347, OpenSpec 9/9,
  public 515; см. `S3-2-verify-c.txt`.
- Mutation-check webhook idempotency: без unique-constraint повтор
  события создаёт дубль — `S3-2-tdd-c-red.txt`.

## Покрыто

- CDEK: OAuth cache, города/ПВЗ, PVZ-фильтр тарифов,
  calculator→копейки, async 202+poll, status/track, webhook ≤2.
- Shipment: tariffs, paid-гейт, tariff=оплаченный, concurrent create,
  adopt remote после timeout, manual, legacy manual (cityCode 0),
  webhook verify/number/replay/out-of-order, authz/no-store.
- Property/DB: `(delivery,status,occurred_at)` unique, cascade,
  partial unique, `orderTotalKopecks`.

## Ограничения

- Reconcile scheduler, startup webhook subscription, seller/buyer
  delivery UI, e2e/axe/LCP — следующий PR.
- Live CDEK не вызывался: нет собственного тестового аккаунта.
