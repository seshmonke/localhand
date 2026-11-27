# Design

## Context

Sprint 1: users/sellers/shops/products, OTP-сессия, seller admin,
витрина. Sprint 2 добавил каталог и корзину. Заказ — заявка продавцу без
оплаты/доставки.

## Decisions

### Buyer-auth

- Переиспользуется phone OTP; новых auth-механик нет.
- Checkout и read-ручки заказов требуют валидную сессию; иначе 401.
- `safeNext` в web расширяется с `/admin` на `/checkout`, `/orders`,
  `/orders/:id` (только внутренние пути, open redirect/loop тесты).
- Login копирайт buyer-neutral: «Вход», не «Кабинет продавца»; ссылка
  «Открыть магазин» остаётся для продавца.
- Guest-checkout нет; `orders.buyer_user_id` обязателен.
- Покупатель — любой `users`; продавец тоже может купить.

### Схема и миграция `0003`

- enum `order_status`: `new` (расширяется в следующих change).
- `orders`: id, buyer_user_id FK users restrict, shop_id FK shops
  restrict, status default `new`, total_kopecks int not null check ≥0,
  buyer_phone text not null, comment text null ≤500,
  client_checkout_id uuid not null, created_at, updated_at;
  unique `(buyer_user_id, client_checkout_id, shop_id)` для
  идемпотентности мультимагазинного checkout.
- `order_items`: id, order_id FK orders cascade, product_id FK products
  set null (nullable после удаления), name text not null,
  price_kopecks int not null check ≥0, quantity int not null default 1.
- Индексы: `orders(buyer_user_id, created_at desc)`,
  `orders(shop_id, created_at desc)`, `order_items(order_id)`.
- Миграция аддитивная; down SQL и runbook — task 3.7 этого change.

### Checkout

- `POST /checkout` body `{ items: [{ productId }], comment?,
  clientCheckoutId }`; items 1–50 (корзина тоже 50), productId unique.
- Auth → 401. Rate-limit per user + IP (например 10/мин); 429.
- В одной транзакции: загрузить products+shops `FOR UPDATE`/условия
  published; если хотя бы один недоступен → 409 `product_unavailable`,
  без частичного заказа.
- Сгруппировать по shop_id; для каждого магазина создать order + items
  snapshot (name, price, quantity=1); total серверный.
- `buyer_phone` — телефон сессии; `comment` trim ≤500; `clientCheckoutId`
  UUID.
- Повтор с тем же `clientCheckoutId` возвращает существующие orders
  (идемпотентность); клиент также блокирует double-submit.
- Ответ 201 `{ orders: OrderSummary[] }`; web очищает заказанные
  позиции корзины.
- Недоступный товар → 409 без заказа; пустой/дубли/лимит → 400.

### Чтение

- `GET /orders/mine`: заказы buyer_user_id, created_at desc, items.
- `GET /orders/:id`: только свой, иначе 404.
- `GET /seller/orders`: заказы магазина seller.user_id, desc.
- `GET /seller/orders/:id`: только своего магазина, иначе 404.
- 401 без сессии на всех read-ручках; 404 не раскрывает чужое.

### PII и логи

- В заказе: телефон покупателя (snapshot), optional comment, snapshot
  товаров. Имя/адрес/email не собираем.
- Видят: buyer своего заказа; seller магазина заказа. Публичных ручек
  заказов нет.
- Логи: без phone/comment/кода; только id/status/error code.
- Preview: только вымышленные телефоны/комментарии; legal-пакет до
  публичного запуска.

### UI

- `/checkout`: guard `/auth/me`; если 401 → `/login?next=/checkout`;
  сводка по магазинам, comment, submit; success → `/orders` (при
  нескольких магазинах несколько заказов); double-submit disabled.
- `/orders` и `/orders/:id`: buyer список/детали, статус `new`, пусто/
  loading/error.
- `/admin/orders` и `/admin/orders/:id`: seller таблица desktop/карточки
  mobile, детали, ссылка в sidebar.
- Header: badge корзины; ссылка «Мои заказы» для авторизованного.
- 320/1440, a11y: labels, focus, aria-live, axe light/dark.

### Тесты

- Contract parse checkout/order.
- DB API: успех, 401, 400 (пусто/дубли/лимит), 409 unavailable,
  snapshot, идемпотентность, buyer/seller 404, seller scope, rate-limit.
- Web: checkout guard, submit/clear cart, orders lists, seller list.
- E2E: browser Playwright + API; бриф `docs/tasks/S2-4-security.md`.

## Risks / Trade-offs

- Нет оплаты/резерва: заказ — заявка; два покупателя могут заказать
  последний товар. v1.
- PII: телефон/комментарий; legal до прода.
- Идемпотентность только по clientCheckoutId; новый id при повторе —
  новый заказ (осознанно).
- Статус только `new`; отмена/оплата — следующие change.
- Транзакция и `FOR UPDATE` удерживают строки товаров; при 50 items ок.

## Migration Plan

1. `0003_buyer_orders`: enum, orders, order_items, индексы.
2. Применить, storefront/seller не сломан.
3. Down SQL/runbook — task 3.7 этого change; откат — revert + down на
   тестовой БД.

## Open Questions

- Нужен ли contactName: v1 нет, телефон сессии + comment.
- Нужна ли buyer-роль: v1 любая сессия, заказы по user_id.
