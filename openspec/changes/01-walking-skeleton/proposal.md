# Proposal

## Why

Нужен первый сквозной вертикальный срез Local Hand: данные из PostgreSQL
через API до реального экрана покупателя. Без него нельзя проверить
контракты, миграции, preview и скорость изменений; auth, оплата и
доставка — следующие риски, а не первые.

## What Changes

- Засеять одного продавца, один магазин и 3–5 товаров.
- API: `GET /health`, `GET /catalog/products`, `GET /shops/:slug`,
  `GET /products/:id`.
- Web: витрина маркетплейса с товарами из API, страница магазина,
  карточка товара; loading/empty/error.
- Заменить захардкоженные карточки лендинга на данные API.
- Контракты — в `packages/shared`, валидация ответов — Zod.
- Тесты: health, каталог, магазин, пустой/неопубликованный магазин.

## Capabilities

### New Capabilities

- `storefront`: покупатель видит опубликованные товары на витрине
  маркетплейса и на странице магазина, открывает карточку товара;
  неопубликованные магазины и товары скрыты.

### Modified Capabilities

Нет.

## Impact

- `apps/api`: схема `sellers`, `shops`, `products`; seed; routes/services;
  тесты.
- `apps/web`: страницы marketplace/shop/product, компоненты карточек,
  состояния загрузки/пустоты/ошибки.
- `packages/shared`: Zod-контракты каталога и магазина.
- `packages/ui`: карточка товара, бейдж, empty state — только если нужны
  общие.
- Preview: локальный `pnpm preview`; remote preview — после домена/VM.

## Non-goals

- Auth, регистрация, роли.
- Корзина, чекаут, ЮKassa, СДЭК.
- Админка продавца/платформы.
- Цифровые товары, AI-агент, кастомизация витрины.
- Полный дизайн всех экранов.

## Success metric

На preview покупатель видит ≥ 3 товара одного магазина на витрине
маркетплейса и на странице магазина; `/health` отвечает 200; `pnpm
verify` зелёный. Baseline: 0.

## References

- `docs/concept/product.md`
- `docs/design/responsive.md`
- `docs/stack/adr/0001-stack.md`
- `docs/quality/dod.md`
