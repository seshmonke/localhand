# Tasks

## 3. Checkout & orders API

- [x] 3.1 Добавить enum `order_status`, `orders`, `order_items`, индексы и миграцию `0003` (nullable product_id, checks, unique buyer+clientCheckoutId+shopId).
- [x] 3.2 Добавить Zod-контракты checkout/order и типы в `packages/shared/src/contracts/`.
- [x] 3.3 Реализовать `POST /checkout`: auth, rate-limit, валидация items, транзакция published-товаров, группировка по магазинам, snapshot, идемпотентность.
- [x] 3.4 Реализовать `GET /orders/mine` и `GET /orders/:id` с buyer-authz и 401.
- [x] 3.5 Реализовать `GET /seller/orders` и `GET /seller/orders/:id` с seller-authz и 401.
- [x] 3.6 Покрыть DB-тестами: 401/400/409, snapshot, мультимагазинный checkout и повтор без дублей, buyer/seller 404, seller scope, rate-limit.
- [x] 3.7 Добавить down SQL/runbook и проверить откат миграции на тестовой БД.

## 4. Buyer/seller orders UI

- [x] 4.1 Добавить `/checkout`: guard, safeNext `/checkout|/orders|/orders/:id`, buyer-neutral login, сводка, comment, submit, double-submit disabled, clear cart; seller без магазина — ссылка на onboarding.
- [x] 4.2 Добавить `/orders` и `/orders/:id` для покупателя.
- [x] 4.3 Добавить `/admin/orders` и `/admin/orders/:id` для продавца; ссылка в sidebar.
- [x] 4.4 Сделать mobile/desktop, loading/empty/error, a11y (labels/focus/axe light/dark), header badge без orders link (заказы — после checkout и прямым URL); LCP/бандл-дельту записать в evidence.
- [x] 4.5 Покрыть web-тестами checkout, buyer/seller orders, guard, ошибки, open redirect/next allowlist.
