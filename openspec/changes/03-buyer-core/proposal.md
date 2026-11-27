# Proposal

## Why

Sprint 1 дал продавцу вход, магазин, товары и seller admin: предложение
есть, но покупатель не может найти товар, собрать корзину и оставить
заказ. Направление продукта — buyer-first; без покупательского ядра
оплата и доставка не к чему подключать, а метрика «10 оплаченных
заказов» недостижима.

## What Changes

- Каталог: поиск по товару/магазину, сортировка (новизна/цена),
  пагинация; только published-товары published-магазинов.
- Корзина в браузере: добавление/удаление, группировка по магазинам,
  итог, persistent localStorage; без серверной корзины.
- Checkout: обязательная buyer-сессия через существующий phone OTP;
  заказ создаётся на каждый магазин, цена/название фиксируются snapshot
  сервера; статус `new`, без оплаты/доставки.
- Заказы: покупатель видит только свои; продавец — только заказы своего
  магазина; чужой id → 404.
- UI: `/cart`, `/checkout`, `/orders`, `/orders/:id`,
  `/admin/orders`; mobile 320 и desktop 1440; loading/empty/error/a11y.
- Security/evidence: authz/PII/log-тесты, e2e buyer flow, preview,
  архив change.

## Capabilities

### New Capabilities

- `catalog-discovery`: поиск, сортировка и пагинация публичного каталога.
- `cart`: клиентская корзина с группировкой по магазинам.
- `checkout-orders`: buyer-auth на checkout, создание заказов и чтение
  своих заказов покупателем/продавцом.

### Modified Capabilities

Нет. Публичные ручки storefront сохраняют прежнее поведение по умолчанию;
новые query-параметры расширяют ответ.

## Impact

- `apps/api`: catalog query, orders/order_items schema + migration,
  checkout/orders/seller-orders routes/services; authz; тесты.
- `apps/web`: search/sort/pagination, cart context/page, checkout,
  buyer/seller orders, header badge.
- `packages/shared`: catalog query/response, cart/order contracts.
- Preview: buyer flow на dev-OTP; данные вымышленные.
- Секреты/ПДн: новых секретов нет; телефон — из сессии; логи без ПДн.

## Non-goals

- ЮKassa, чеки, возвраты, СДЭК, адрес/трек, реальные платежи.
- Цифровые товары, S3/фото, категории/фильтры по состоянию.
- Модерация, жалобы, owner-admin, AI-агент.
- Серверная корзина, резервирование остатков, quantity > 1.
- Реальная SMS-отправка и прод-ключи.

## Success metric

На preview покупатель находит товар поиском/сортировкой, добавляет в
корзину, входит по dev-OTP, оформляет заказ; продавец видит заказ;
второй покупатель/продавец не видит чужое. `pnpm verify` и OpenSpec
strict зелёные.

## References

- `docs/concept/product.md`
- `docs/legal/context.md`
- `docs/quality/dod.md`
- `docs/design/responsive.md`
- `docs/tasks/02-buyer-core.md`
- `openspec/specs/storefront/spec.md`
