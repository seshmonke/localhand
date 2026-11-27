# Task S2-3: Checkout & orders

## Цель

Авторизованный покупатель оформляет заказ на каждый магазин из корзины
(цена/название — snapshot сервера), видит свои заказы; продавец видит
заказы своего магазина. Без оплаты/доставки.

PBI делится на два PR: **3a API** (tasks 3.x) и **3b UI** (tasks 4.x);
change `05-checkout-orders` архивируется после merge обоих.

## AC — API (3a)

- [ ] 3.1 Миграция `0003`: enum `order_status` (`new`), `orders`
      (buyer_user_id, shop_id, status, total_kopecks ≥0, buyer_phone,
      comment ≤500, client_checkout_id uuid, timestamps; unique
      `(buyer_user_id, client_checkout_id, shop_id)`; индексы buyer/shop),
      `order_items` (order_id cascade, product_id nullable set null, name,
      price_kopecks ≥0, quantity=1; индекс order_id).
- [ ] 3.2 Zod-контракты `order.ts`: Checkout (items 1–50 unique
      productId, comment?, clientCheckoutId uuid), OrderSummary/Item,
      checkout/list responses; экспорт.
- [ ] 3.3 `POST /checkout`: sessionGuard → 401; rate-limit 10/мин;
      валидация; в транзакции загрузить published products+shops,
      недоступный → 409 `product_unavailable` без частичного заказа;
      group by shop; snapshot; total; buyer_phone из сессии; идемпотентный
      повтор по clientCheckoutId; 201 `{orders}`.
- [ ] 3.4 `GET /orders/mine`, `GET /orders/:id`: только свои, иначе 404;
      401 без сессии; items/createdAt.
- [ ] 3.5 `GET /seller/orders`, `GET /seller/orders/:id`: только магазин
      продавца; без магазина — пустой список; чужой 404; 401.
- [ ] 3.6 DB-тесты: успех multi-shop (2 заказа), snapshot цены, повтор
      без дублей, 401/400/409, buyer/seller 404, seller scope, rate-limit,
      пустой/дубли/>50.
- [ ] 3.7 Down SQL/runbook `docs/stack/runbooks/orders-rollback.md`;
      проверить откат на тестовой БД.

## AC — UI (3b)

- [ ] 4.1 `/checkout`: guard `/auth/me`, 401 → `/login?next=/checkout`;
      сводка по магазинам, comment, submit, double-submit disabled;
      success → `/orders`, очистить заказанные позиции.
- [ ] 4.2 `/orders`, `/orders/:id`: buyer list/detail, статус `new`,
      loading/empty/error.
- [ ] 4.3 `/admin/orders`, `/admin/orders/:id`: seller таблица/cards,
      детали, ссылка в sidebar.
- [ ] 4.4 Cart CTA enable → `/checkout`; header orders link; mobile 320/
      desktop 1440; a11y labels/focus/axe light/dark; LCP/бандл-evidence.
- [ ] 4.5 safeNext allowlist `/checkout|/orders|/orders/:id` + тесты
      open redirect/loop; login buyer-neutral; web-тесты checkout/orders/
      seller/errors.

## Change

`openspec/changes/05-checkout-orders`, tasks 3.1–3.7 (3a), 4.1–4.5 (3b).

## owns

3a:
- `apps/api/src/db/schema.ts`, `apps/api/drizzle/0003_*`
- `apps/api/src/orders/**` (routes/services/tests)
- `apps/api/src/app.ts` (register)
- `packages/shared/src/contracts/order.ts` (+ test), `index.ts`
- `docs/stack/runbooks/orders-rollback.md`

3b:
- `apps/web/src/pages/CartPage.tsx` (CTA), `CheckoutPage.tsx`,
  `OrdersPage.tsx`, `OrderPage.tsx`, `AdminOrdersPage.tsx`,
  `AdminOrderPage.tsx`
- `apps/web/src/lib/api.ts`, `queries.ts`
- `apps/web/src/App.tsx`, `LoginPage.tsx` (safeNext/copy)
- `apps/web/src/components/admin/AdminShell.tsx` (orders link)
- web-тесты

Не трогать: catalog/cart internals (кроме CTA), seller shop/product,
`openspec/**`, `.scrum/**`, `docs/tasks/01-*`; бриф не менять. Новых
зависимостей нет.

## Контракты

- Checkout: `{ items: [{productId: int>0}] 1–50 unique, comment?: string
  ≤500, clientCheckoutId: uuid }`.
- OrderSummary: `{ id, shop: {slug,name}, status: "new", totalKopecks,
  buyerPhone, comment: string|null, createdAt: ISO, items: OrderItem[] }`.
- OrderItem: `{ productId: number|null, name, priceKopecks, quantity:1 }`.
- Responses: `{orders: OrderSummary[]}` (201 checkout),
  `{orders}` (list), `{order}` (detail).
- Ошибки: 400 invalid_request, 401 unauthorized, 404 not_found, 409
  product_unavailable, 429 rate_limited.
- Order id — int4 max.

## Решения

- Один checkout → один order на shop; unique triple для идемпотентности.
- Snapshot name/price; total серверный; client prices игнорируются.
- Buyer phone — из сессии; comment optional; имя/адрес/email не собираем.
- Видят buyer (свои) и seller магазина; публичных ручек нет; логи без
  phone/comment/code.
- Rate-limit checkout 10/мин (route config), 429.
- Транзакция: published-валидация и insert вместе; недоступный → 409.
- Статус `new`; смена/оплата — следующие change.
- UI CTA cart enable; login next allowlist; seller без магазина — пустой
  список/ссылка onboarding.

## Non-goals

- ЮKassa/чеки/возвраты, СДЭК/адрес/трек, реальные платежи.
- Смена статусов, отмена, чат, цифровые товары, S3, AI, owner-admin.
- Guest checkout, серверная корзина, stock/резерв.

## Evidence

- `pnpm verify` — exit code, хвост.
- DB/route/web тесты — список.
- Down SQL проверен.
- Commit SHA; скриншоты 320/1440, axe; orchestrator запишет
  `.scrum/sprints/2/evidence/S2-3-verify.md`.

## Границы

- 3a: работать в `task/S2-3a-checkout-api`; 3b — в
  `task/S2-3b-orders-ui`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре — стоп, вопрос оркестратору.
