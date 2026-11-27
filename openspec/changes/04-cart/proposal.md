# Proposal

## Why

Каталог даёт выбор, но покупателю нужно собрать несколько товаров до
checkout. Без корзины нет buyer-flow.

## What Changes

- Клиентская корзина в localStorage, без серверного состояния.
- Add/remove/clear, badge в header.
- Группировка по магазинам, итоги по группе и общий.
- `/cart` с переходом к checkout.

## Capabilities

### New Capabilities

- `cart`: клиентская корзина и группировка по магазинам.

### Modified Capabilities

Нет.

## Impact

- `apps/web`: CartProvider, components, `/cart`, header badge, ProductCard/ProductPage.
- `packages/shared`: cart-контракты/типы.
- API не меняется; PII/секреты нет.

## Non-goals

- Серверная корзина, синхронизация устройств, quantity > 1, stock/резерв.
- Оплата, checkout (S2-3).
- Купоны/скидки.

## Success metric

Корзина переживает reload, группирует два магазина, считает итоги,
позволяет удалить/очистить; `pnpm verify` зелёный.

## References

- `docs/tasks/02-buyer-core.md`
- `openspec/changes/05-checkout-orders`
