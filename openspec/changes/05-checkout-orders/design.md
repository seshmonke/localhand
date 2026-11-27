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
  restrict, status default `new`, total_kopecks bigint not null check ≥0,
  buyer_phone text not null, comment text null ≤500,
  client_checkout_id uuid not null, created_at, updated_at;
  unique `(buyer_user_id, client_checkout_id, shop_id)` для
  идемпотентности мультимагазинного checkout.
- `order_items`: id, order_id FK orders cascade, product_id FK products
  set null (nullable после удаления), name text not null,
  price_kopecks int not null check ≥0, quantity int not null default 1
  check = 1.
- Индексы: `orders(buyer_user_id, created_at desc)`,
  `orders(shop_id, created_at desc)`, `order_items(order_id)`.
- Миграция аддитивная; down SQL и runbook — task 3.7 этого change.

### Checkout

- `POST /checkout` body `{ items: [{ productId }], comment?,
  clientCheckoutId }`; items 1–50 (корзина тоже 50), productId unique.
- Auth → 401. Rate-limit per user: 10/мин на `user.id`; 429. IP не
  участвует в ключе, потому что checkout доступен только с сессией.
- В одной транзакции: загрузить products+shops с условиями published;
  `FOR UPDATE OF products` блокирует только строки товаров (shops
  читаются без lock), порядок блокировки — `products.id`, поэтому
  конкурентные checkout не образуют цикл. Если хотя бы один товар
  недоступен → 409 `product_unavailable`, без частичного заказа.
- Сгруппировать по shop_id; для каждого магазина создать order + items
  snapshot (name, price, quantity=1); total серверный.
- `buyer_phone` — телефон сессии; `comment` trim ≤500; `clientCheckoutId`
  UUID.
- Повтор с тем же `clientCheckoutId` возвращает существующие orders и не
  создаёт новые, даже если `items` в повторе другие: ключ идемпотентности
  — только `clientCheckoutId` в рамках покупателя. Чтобы изменить состав
  заказа, клиент обязан сгенерировать новый UUID; тот же UUID с другим
  составом — replay, а не правка. Клиент также блокирует double-submit.
- Запросы с одним ключом `(buyer_user_id, client_checkout_id)`
  сериализуются транзакционным advisory lock
  `pg_advisory_xact_lock(hashtextextended($1, 0))` с ключом
  `"${buyerUserId}:${clientCheckoutId}"`. Lock берётся первым действием
  транзакции, проверка существующих orders — после него и внутри той же
  транзакции. Поэтому конкурентные same-key запросы создают один набор
  заказов (первый), а второй возвращает его же; новый состав принимается
  только с новым UUID.
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
- Header: badge корзины, без нового auth-запроса. Отдельной ссылки
  «Мои заказы» нет: заказы доступны после успешного checkout и прямым
  URL `/orders`.
- 320/1440, a11y: labels, focus, aria-live, axe light/dark.

### Тесты

- Contract parse checkout/order.
- DB API: успех, 401, 400 (пусто/дубли/лимит), 409 unavailable,
  snapshot, идемпотентность (повтор с тем же и с другим составом items,
  товар из магазина, которого не было в первом checkout),
  конкурентные same-key запросы с товарами разных магазинов, buyer/seller
  404, seller scope, rate-limit.
- Web: checkout guard, submit/clear cart, orders lists, seller list.
- E2E: browser Playwright + API; бриф `docs/tasks/S2-4-security.md`.

## Risks / Trade-offs

- Нет оплаты/резерва: заказ — заявка; два покупателя могут заказать
  последний товар. v1.
- PII: телефон/комментарий; legal до прода.
- Идемпотентность только по clientCheckoutId; replay с тем же id и
  другим items возвращает исходные заказы, новый id — новый заказ
  (осознанно). Advisory lock сериализует same-key запросы: второй
  получает первый набор, а не смесь магазинов.
- Статус только `new`; отмена/оплата — следующие change.
- `FOR UPDATE OF products` удерживает только строки товаров в порядке
  `products.id`; shops читаются без блокировки, взаимная блокировка
  между checkout исключена. При 50 items ок.

## Migration Plan

1. `0003_buyer_orders`: enum, orders, order_items, индексы.
2. Применить, storefront/seller не сломан.
3. Down SQL/runbook — task 3.7 этого change; откат — revert + down на
   тестовой БД.

## Open Questions

- Нужен ли contactName: v1 нет, телефон сессии + comment.
- Нужна ли buyer-роль: v1 любая сессия, заказы по user_id.
