# Proposal

## Why

Walking skeleton показывает витрину на seed-данных; настоящий продавец не
может войти, создать магазин и опубликовать товар. Без этого нет реального
предложения, метрика «30 магазинов» недостижима, а оплата/доставка не к
чему подключать.

## What Changes

- Телефонная авторизация: запрос OTP, проверка, JWT в httpOnly-cookie,
  `/auth/me`, logout, rate-limit.
- Продавец создаёт и редактирует свой магазин: имя, slug, описание,
  статус публикации; чужой магазин недоступен.
- Продавец создаёт, редактирует, публикует и скрывает свои товары.
- Seller admin UI на сайте: вход, онбординг магазина, настройки, таблица
  и форма товаров; mobile + desktop.
- Authz: продавец видит и меняет только свой магазин и свои товары.
- Security/evidence: authz-тесты, rate-limit, secret/PII scan, e2e
  happy path, preview evidence.

## Capabilities

### New Capabilities

- `phone-auth`: вход по российскому номеру через OTP и сессия.
- `seller-shop`: продавец создаёт и ведёт свой магазин.
- `product-management`: продавец ведёт и публикует свои товары.

### Modified Capabilities

Нет.

## Impact

- `apps/api`: `users`, OTP-хранилище, `sellers.user_id`; auth/shop/product
  routes/services; authz; тесты.
- `apps/web`: login, onboarding, admin shop/products, защищённые
  маршруты, формы, состояния.
- `packages/shared`: контракты auth/shop/product, валидация slug/цены.
- Preview: полный путь продавца на dev-OTP.
- Секреты: `SMS_PROVIDER`, ключ SMS-провайдера — только env/секреты.

## Non-goals

- Buyer-auth, корзина, чекаут, ЮKassa, СДЭК.
- Цифровые товары, AI-агент, owner-admin.
- Загрузка фото в S3; в спринте — `imageUrl`/плейсхолдер.
- Реальный SMS-провайдер в preview; dev-адаптер, прод-ключ перед релизом.
- Полная модерация и жалобы.

## Success metric

На preview продавец входит по dev-OTP, создаёт магазин и публикует товар;
товар появляется на витрине маркетплейса. Второй продавец не может
изменить чужой магазин/товар. `pnpm verify` зелёный.

## References

- `docs/concept/product.md`
- `docs/legal/context.md`
- `docs/quality/dod.md`
- `docs/design/responsive.md`
- `docs/tasks/01-seller-onboarding.md`
