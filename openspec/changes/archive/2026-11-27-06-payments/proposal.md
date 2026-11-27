# Proposal: payments (ЮKassa sandbox)

## Why

Заказ в buyer-core — заявка без оплаты: продавец обрабатывает его вне
системы, покупатель не может заплатить на сайте. Направление №2 —
подключить продавца к деньгам. Первый шаг — оплата заказа напрямую
продавцу через ЮKassa, без денег на счёте платформы.

## What Changes

- Продавец подключает свой магазин к ЮKassa партнёрской схемой; платформа
  хранит ограниченный токен в зашифрованном виде, подписывает магазин на
  вебхуки и версионирует аккаунт при переподключении.
- Покупатель инициирует оплату своего заказа и получает страницу
  подтверждения ЮKassa.
- Вебхук ЮKassa проверяет платёж запросом к API, сверяет сумму/валюту/
  заказ и идемпотентно переводит заказ в `paid`; неизвестный платёж
  получает 503, pending добирает reconcile.
- Заказ получает статусы `payment_pending` и `paid`; `new` остаётся для
  неоплаченного заказа.
- UI: карточка подключения ЮKassa в админке магазина, кнопка «Оплатить»
  и статус оплаты в заказе покупателя, статус оплаты у продавца.
- В dev/test используется fake-провайдер; реальные ключи и деньги — вне
  спринта.

## Capabilities

### New Capabilities

- `payments`: подключение платёжного аккаунта продавца, создание платежа,
  вебхук, статусы и идемпотентность.

### Modified Capabilities

Поведение `checkout-orders` не меняется: checkout по-прежнему создаёт
заказ в `new`. Общий контракт `OrderStatus` расширяется значениями
`payment_pending`/`paid`, тест контракта обновляется в этом change;
оплата — отдельная capability `payments`.

## Impact

- `apps/api`: миграция `0004`, `seller_payment_accounts`, `payments`,
  enum `payment_status`, расширение `order_status`; routes
  `/seller/payments/*`, `/orders/:id/payments`, `/payments/yookassa/webhook`;
  провайдер-адаптер, шифрование токена, rate-limit, тесты.
- `apps/web`: карточка подключения в `/admin/shop`, кнопка и статус
  оплаты в `/orders/:id` и `/admin/orders/:id`, return/polling.
- `packages/shared`: контракты платежа, статусов, ошибок.
- Env: `PAYMENTS_PROVIDER=fake|yookassa`, `PAYMENTS_TOKEN_KEYS`
  (keyring), `PAYMENTS_TOKEN_KEY_VERSION`, `PAYMENTS_STATE_SECRET`,
  `PAYMENTS_ENV=live|sandbox|test`, `PAYMENTS_FAKE_ENABLED`,
  `YOOKASSA_REDIRECT_URI`, `YOOKASSA_*` (только sandbox/test; live
  запрещает fake и `isTest`).
- Preview: fake-провайдер с `PAYMENTS_FAKE_ENABLED=true`, вымышленные
  данные; live sandbox smoke — после тестовых ключей владельца.
- PBI делится на два PR/цикла: foundation (схема, контракты, крипто,
  адаптер) и flow (аккаунт, платёж, вебхук, UI), чтобы ревью оставалось
  управляемым.

## Non-goals

- Реальные деньги, прод-ключи, 54-ФЗ/ККТ, чеки, возвраты.
- СДЭК, адрес, трек, статусы доставки.
- Отмена оплаченного заказа и refunds.
- Цифровые товары, AI, Ozon.
- Хранение карточных данных: только hosted page провайдера.

## Success metric

Покупатель оплачивает свой заказ в fake/sandbox, вебхук идемпотентно
переводит его в `paid`; продавец видит оплату; повтор вебхука и
параллельные запросы не создают дублей и не меняют сумму; чужой заказ —
404; `pnpm verify`, DB-тесты и e2e зелёные.

## References

- `docs/tasks/03-money-path.md`
- `docs/concept/product.md` — оплата на сайте продавцу, партнёрская
  схема ЮKassa.
- `docs/stack/adr/0003-orders.md` — заказ, PII, no-store.
- `openspec/specs/checkout-orders/spec.md`.
- `https://yookassa.ru/developers/api` — платежи, вебхуки,
  идемпотентность.
