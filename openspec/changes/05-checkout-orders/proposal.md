# Proposal

## Why

Корзина собрана, но покупатель не может оставить заказ, а продавец —
увидеть его. Это ядро buyer-first сценария; оплата/доставка — дальше.

## What Changes

- Buyer-auth: существующая phone OTP-сессия, login buyer-neutral;
  checkout требует сессию, возврат на checkout после входа.
- Заказы: `orders`/`order_items`, миграция `0003`; заказ на каждый
  магазин, snapshot названия/цены, статус `new`.
- API: `POST /checkout`, `GET /orders/mine`, `GET /orders/:id`,
  `GET /seller/orders`, `GET /seller/orders/:id`; authz 401/404.
- UI: `/checkout`, `/orders`, `/orders/:id`, `/admin/orders`,
  `/admin/orders/:id`; mobile/desktop, states, a11y.
- PII: телефон из сессии, optional comment; только buyer и seller
  магазина; логи без телефона/кода/комментария.

## Capabilities

### New Capabilities

- `checkout-orders`: buyer checkout, заказы и чтение заказов
  покупателем/продавцом.

### Modified Capabilities

- `phone-auth`: сессия используется покупателем, не только продавцом
  (механика OTP/JWT не меняется). Дельта фиксирует buyer-сценарий в
  `checkout-orders`, чтобы не дублировать требования.

## Impact

- `apps/api`: schema/migration, checkout/orders/seller-orders routes и
  services, authz, rate-limit, тесты.
- `apps/web`: checkout/orders pages, login next allowlist, header/orders
  links, admin orders.
- `packages/shared`: checkout/order контракты.
- Preview: buyer flow на dev-OTP; данные вымышленные.

## Non-goals

- ЮKassa, чеки/возвраты, СДЭК, адрес/трек, реальные платежи.
- Смена статусов заказа, отмена, чат.
- Цифровые товары, S3, AI, owner-admin.
- Реальная SMS/прод-ключи.

## Success metric

Покупатель проходит каталог → корзина → login → checkout → заказ;
видит свои заказы; продавец видит заказ магазина; чужой заказ 404;
`pnpm verify` и e2e зелёные.

## References

- `docs/tasks/02-buyer-core.md`
- `openspec/specs/phone-auth/spec.md`
- `docs/legal/context.md`
