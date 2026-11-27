# S3-2 PR B — quote/checkout/UI

Дата: 27.11.2026. Tier T2. Стек: #58 quote API → #59 checkout → #60 UI.

## RED

- `POST /delivery/quote`, `/delivery/cities`, `/delivery/points` → 404 до
  реализации: `.scrum/sprints/3/evidence/S3-2-tdd-b-red.log`.
- Checkout без доставки при настроенном провайдере создавал заказ:
  regression-тест `delivery_required` (P1 ревью).

## GREEN

- `pnpm verify` на #60: shared 156, web 155, api 327, OpenSpec 9/9,
  public 504; см. `S3-2-verify-b.txt`.
- Quote: города/ПВЗ, per-shop цена, point-city, габариты/город/ПВЗ
  сдачи, 429, no-store, signed token.
- Checkout: `total = items + delivery` property, `delivery_required`,
  replay до проверки токена, per-shop разные цены + `delivery_kopecks`
  в БД, tampered token, multi-shop.
- UI: выбор города/ПВЗ/имени, цена и срок в итоге, отправка token;
  e2e/a11y/perf — PR C.

## Ограничения

- Quote работает на fake; CDEK adapter и shipment — feature C.
- Legacy checkout без доставки остаётся только при выключенном
  `DELIVERY_PROVIDER`; при настроенном провайдере — 409.
