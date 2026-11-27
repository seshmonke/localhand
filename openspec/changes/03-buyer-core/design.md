# Design

## Context

Sprint 1 закрыт: есть `users`, `sellers`, `shops`, `products`, OTP-сессия,
seller admin и витрина. Покупатель не может искать/сортировать каталог,
собирать корзину и оставлять заказ. v1 — один API-процесс, PostgreSQL 18,
без Redis; оплата/доставка — вне этого change.

## Goals / Non-Goals

**Goals:**

- Поиск/сортировка/пагинация каталога на существующих полях.
- Клиентская корзина, группировка по магазинам, checkout.
- Заказы на магазин со snapshot цены/названия; buyer/seller authz.
- Buyer/seller UI, mobile + desktop, a11y.
- E2E buyer flow и evidence.

**Non-Goals:**

- Оплата, чеки, возвраты, СДЭК, адрес/трек.
- Цифровые товары, S3/фото, категории.
- Серверная корзина, stock/quantity, резервы.
- Модерация, AI, owner-admin.

## Decisions

### Каталог

- `GET /catalog/products` расширяется query:
  `q` (1–100, trim), `sort` = `newest|price_asc|price_desc`,
  `page` ≥ 1, `pageSize` 1–48 (default 12).
- Поиск — `ILIKE` по `products.name` и `shops.name`, параметризованно;
  спецсимволы `%`/`_` экранируются.
- Только `products.status='published'` и `shops.status='published'`.
- Ответ: `{ products, page, pageSize, total, hasMore }`; старые поля
  сохраняются, web парсит расширенный контракт.
- Сортировка: `newest` — `created_at desc, id desc`; цена — `price_kopecks
  asc/desc, id desc`. Стабильный tie-break.
- Без новых индексов: v1 объём мал; ILIKE по двум таблицам допустим.
  При росте — pg_trgm/индекс отдельным change.
- Пагинация offset; total считается вторым запросом; максимум 48.

### Корзина

- Только браузер: React context + `localStorage` ключ
  `localhand.cart.v1`; гидратация после mount, безопасный parse.
- Item: `{ productId, name, priceKopecks, imageUrl, shopSlug, shopName }`;
  количество всегда 1 — stock/quantity в v1 нет.
- Add по `productId` идемпотентен; remove/clear; итог по магазинам и
  общий; лимит 100 позиций.
- Цена в корзине — отображаемая; checkout пересчитывает сервер.
- Корзина доступна без авторизации; auth требуется на checkout.

### Buyer auth

- Переиспользуется phone OTP Sprint 1; новых auth-механик нет.
- Checkout требует валидную сессию; иначе `/login?next=/checkout`.
- Покупатель — любой `users`; продавец тоже может купить (нет запрета).
- Guest-checkout нет: заказ привязан к `users.id`.

### Заказы

- Новые таблицы:
  - `orders`: id, buyer_user_id FK users (restrict), shop_id FK shops
    (restrict), status `new`, total_kopecks int ≥0, buyer_phone text
    (snapshot), comment text ≤500 null, created_at, updated_at.
  - `order_items`: id, order_id FK orders cascade, product_id FK products
    (set null), name text, price_kopecks int ≥0, quantity int = 1.
- `POST /checkout` body `{ items: [{ productId }], comment? }`:
  - auth → 401;
  - пустой/дубли items/limit > 50 → 400;
  - загрузить published products + published shops; недоступный товар →
    409 `product_unavailable` (без частичного заказа);
  - сгруппировать по `shop_id`; в одной транзакции создать order на
    магазин + items snapshot;
  - total = сумма snapshot; `buyer_phone` = телефон сессии; `comment`
    trim/≤500;
  - ответ `{ orders: OrderSummary[] }` (201).
- `GET /orders/mine` — заказы покупателя, `created_at desc`; items
  включены.
- `GET /orders/:id` — только свой, иначе 404.
- `GET /seller/orders` — заказы магазина продавца, `created_at desc`.
- `GET /seller/orders/:id` — только своего магазина, иначе 404.
- Статус только `new`; смена статуса/оплата — следующие change.
- Заказ на магазин, а не один общий: как в product.md (каждый магазин —
  отдельный заказ/платёж).
- Snapshot названия/цены обязателен: товар могут изменить/снять.

### UI

- `/cart` — группировка по магазинам, итог, remove/clear, CTA checkout.
- `/checkout` — guard по `/auth/me`; форма comment (optional), сводка,
  submit; success → `/orders/:id` первого заказа или `/orders`.
- `/orders` — список своих заказов; `/orders/:id` — детали/статус `new`.
- `/admin/orders` — таблица desktop, карточки mobile; ссылка из sidebar.
- Header: badge корзины; ссылка «Заказы» для авторизованного покупателя
  (можно в footer/кабинете, без нового меню).
- Mobile-first 320, desktop 1440; loading/empty/error, a11y.

### Контракты

`packages/shared`: `catalog.ts` (query/response), `cart.ts` (item/totals),
`order.ts` (checkout/order schemas). Zod; ошибки `{error}` с
400/401/404/409/429.

### Тесты

- Unit: query parse/escape, cart reducer/storage, totals.
- API DB: search/sort/page, checkout validation/group/snapshot/authz,
  buyer/seller orders 404/401.
- Web: catalog controls, cart, checkout guard, orders lists.
- E2E: dev OTP → cart → checkout → orders → seller view.

## Risks / Trade-offs

- Нет оплаты/резерва: заказ — заявка; два покупателя могут заказать
  последний товар. Для v1 допустимо.
- PII: телефон покупателя в заказе; preview — только вымышленные данные;
  логи без телефона/кода; legal-пакет до публичного запуска.
- localStorage: корзина на устройстве, не синхронизируется.
- ILIKE без индекса: ок для v1, отдельный change при росте.
- Snapshot vs актуальность: заказ фиксирует цену на момент checkout.

## Migration Plan

1. `0003_buyer_orders`: enum `order_status` (`new`), `orders`,
   `order_items`, индексы `orders(buyer_user_id, created_at)`,
   `orders(shop_id, created_at)`, `order_items(order_id)`.
2. Применить, проверить seller/storefront не сломан.
3. Откат: revert + down SQL в runbook S2-5; миграция аддитивная.

## Open Questions

- Нужен ли contactName в заказе: v1 использует телефон сессии и
  комментарий; имя покупателя не собираем.
- Нужна ли buyer-роль/кабинет: v1 — любая сессия, заказы по user_id.
