# Task S2-3b: Checkout & orders UI

## Цель

Покупатель оформляет заказ из корзины после OTP-входа и видит свои
заказы; продавец видит заказы своего магазина. Mobile 320/desktop 1440,
loading/empty/error/a11y.

## AC

- [ ] 4.1 `/checkout`: guard `/auth/me`; 401 → `/login?next=/checkout`;
      сводка по магазинам из корзины, comment, submit, double-submit
      disabled; success → `/orders`, очистить заказанные позиции; 409
      `product_unavailable` — сообщение и обновление.
- [ ] 4.2 `/orders` и `/orders/:id`: buyer list/detail, статус `new`,
      loading/empty/error, ссылка на товар/магазин, цена.
- [ ] 4.3 `/admin/orders` и `/admin/orders/:id`: seller таблица desktop/
      карточки mobile, детали, ссылка из sidebar; no shop — empty +
      onboarding.
- [ ] 4.4 Cart CTA enable → `/checkout`; login buyer-neutral; safeNext
      allowlist `/checkout`, `/orders`, `/orders/:id` + `/admin`; header
      badge без ссылки «Мои заказы» (заказы — после checkout и прямым
      URL); mobile/desktop, labels/focus, axe light/dark; LCP/бандл
      запишет S2-4.
- [ ] 4.5 Web-тесты: checkout guard/submit/clear/409, buyer orders,
      seller orders, safeNext open-redirect/loop, empty/error.
- [ ] `pnpm verify` зелёный.

## Change

`openspec/changes/05-checkout-orders`, tasks 4.1–4.5. API 3a уже
смержен: `POST /checkout`, `/orders/mine`, `/orders/:id`,
`/seller/orders`, `/seller/orders/:id`.

## owns

- `apps/web/src/pages/CheckoutPage.tsx`, `OrdersPage.tsx`, `OrderPage.tsx`,
  `AdminOrdersPage.tsx`, `AdminOrderPage.tsx`
- `apps/web/src/lib/api.ts`, `queries.ts`
- `apps/web/src/App.tsx`, `LoginPage.tsx` (safeNext/copy)
- `apps/web/src/pages/CartPage.tsx` (CTA enable)
- `apps/web/src/components/admin/AdminShell.tsx` (orders link)
- web-тесты

Не трогать: `apps/api/**`, `packages/**`, catalog/cart internals (кроме
CTA), `openspec/**`, `.scrum/**`, `docs/tasks/01-*`. Новых зависимостей
нет.

## Контракты

- `CheckoutSchema`, `CheckoutResponse`, `OrderSummary`, `OrderItem`,
  `OrderListResponse`, `OrderResponse` из shared.
- Checkout body: items из cart productId, comment, `clientCheckoutId`
  (crypto.randomUUID, стабильный до успеха); total/phone — сервер.
- 400/401/404/409/429; 409 product_unavailable.
- После 201 очистить корзину (все заказанные items) и navigate
  `/orders`.

## Решения

- Buyer auth — существующий OTP; login copy нейтрален, safeNext только
  внутренние пути.
- `clientCheckoutId` — `useRef(crypto.randomUUID())`; новый только после
  успешного checkout/нового состава корзины.
- `/checkout` при пустой корзине — empty со ссылкой в каталог.
- 401 на checkout/orders — SessionExpiredState (очистка me+seller), не
  тупик.
- Seller orders read-only; статус `new`.
- Cart CTA из disabled становится Link на `/checkout`.
- Header: без нового auth-запроса; «Мои заказы» доступны из checkout
  success и прямым URL.
- 320/1440, a11y.

## Non-goals

- Оплата/доставка, смена статусов, отмена.
- API changes; pagination.
- Реальные ПДн в preview.

## Evidence

- `pnpm verify` — exit code, хвост.
- Web-тесты; скриншоты 320/1440; axe.
- Commit SHA; orchestrator запишет
  `.scrum/sprints/2/evidence/S2-3-verify.md`.

## Границы

- Работать только в task worktree ветки `task/S2-3b-orders-ui`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре — стоп, вопрос оркестратору.
