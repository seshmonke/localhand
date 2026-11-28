# Sprint 3 review — money-path

Дата: 28.11.2026.
Статус: **CLOSED**.
Вердикт: **ACCEPT** по инкременту S3-1 + S3-2. S3-3/S3-4
перенесены в Sprint 4 решением владельца 28.11.2026.

## Sprint Goal

Покупатель оплачивает заказ на сайте продавцу в тестовом контуре
ЮKassa, продавец видит оплату, оформляет отправление СДЭК и ведёт заказ
до трек-номера и статуса доставки. Реальные деньги, ключи и ПДн
покупателей в спринте не используются.

Цель достигнута для тестового контура. Живые ЮKassa/СДЭК, юрпакет и
production-деплой остаются внешними гейтами владельца.

## Что принято

### S3-1 Payments: ЮKassa sandbox

- Партнёрская схема, токен в keyring, webhook subscription/versioning,
  статус в админке.
- Платёж покупателя, `confirmationUrl`, 401/404/409, provider failure
  `failed`/`pending`/`manual_review`, reconcile.
- Webhook: проверка платежа, amount/currency/order, идемпотентность,
  гонка create/webhook.
- PII/карточные данные не сохраняются, `no-store`.
- Change `06-payments` заархивирован `2026-11-27-06-payments`.
- Live smoke — после ключей владельца (P3).

### S3-2 Delivery: СДЭК test contour

- Контракты, схема `0006`, quote/PVZ, checkout с доставкой, CDEK
  adapter + fake, shipment, ручной трек, webhook, reconcile,
  scheduler/subscription.
- Seller UI: тарифы, создание, manual, polling, события; buyer delivery
  card; legacy/error/a11y.
- Docs: ADR 0005, runbooks webhook/reconcile/manual/rollback, events
  spec, `.max(50)`, threat model D14–D16.
- E2E: API/DB quote→paid→create→webhook→track, manual fallback,
  идемпотентность; browser flow; axe 24×0; preview LCP 580/756/928 ms.
- Change `07-delivery` заархивирован `2026-11-28-07-delivery`.

## Evidence

- `pnpm verify` — exit 0; OpenSpec `--all --strict` — 9/9.
- API 394 tests, web 220, shared 161 (на close).
- Browser `pnpm test:e2e` — 13 passed; axe 24 скана 320/1440
  light/dark — 0 serious/critical; preview LCP <2500.
- PR: #63–#79; изменения `06-payments`/`07-delivery` в архиве.
- 3.1 закрыт с retrospective RED (`S3-2-tdd-c-precode-red`) и
  mutation/e2e-доказательствами; TDD-first долг зафиксирован в ретро.

## Не вошло / отложено

- S3-3 Order lifecycle (`08-order-lifecycle`) — Sprint 4.
- S3-4 Hardening (`09-orders-pagination`) — Sprint 4.
- Live YooKassa adapter/keys, live CDEK contract/PII gate, юрпакет,
  production deploy/SMS — owner-гейты.

## Риски

- Живые платежи/доставка не проверены: только fake/test.
- Адрес/ПДн до юрпакета не собираем.
- Подписка CDEK: один API-контейнер; distributed lock — backlog P2.
- Field RUM/LCP — owner-approved lab/preview proxy; field p75 до
  публичного запуска.
