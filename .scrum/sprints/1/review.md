# Review: Спринт 1

## Инкремент

- Preview: локальный (web 5173, API 3000); browser-smoke полного пути.
- Изменения (changes): `02-seller-onboarding` → архив
  `2026-11-27-02-seller-onboarding`; specs `phone-auth`, `seller-shop`,
  `product-management` созданы.
- PR: #12 auth, #14 shop, #16 products, #18 admin auth/shop,
  #20 products UI, #22 security/e2e/docs; docs-закрытия #13/#15/#17/#19/#21.

## Демо-сценарий

1. Продавец входит на `/login` по dev-OTP.
2. Создаёт магазин, публикует его.
3. Создаёт товар, публикует.
4. Товар виден на `/shops/:slug` и `/`; второй продавец не может его
   изменить.

## Вердикты

- QA: PASS — `pnpm verify` exit 0, API 102/102, shared 33/33, web 35/35,
  e2e 3/3, OpenSpec 4/4 strict.
- Security: PASS с P3 — authz 401/404/429, log-тест без phone/code,
  trustProxy explicit, blocked read-only; открытые P3 в бэклоге.
- Perf: PARTIAL — LCP/бандл не измерены, admin-код не code-split; P3.
- A11y: PASS — axe light/dark 0 на login/admin/products; focus/контраст
  исправлены.
- Design: PASS — mobile 320 и desktop 1440, ч/б брутализм, без overflow.
- User Proxy (hypothesis): не проверялся с реальными покупателями;
  Sprint 2 — buyer-core.

## Решение PO

ACCEPT

Причина: Sprint Goal достигнут — продавец проходит путь login → shop →
product → publish, товар виден на витрине, чужой ресурс недоступен;
CI, OpenSpec и evidence зелёные.

## Новые задачи

- [ ] P1. Buyer-core Sprint 2: каталог, корзина, checkout, заказы. Источник: review 1.
- [ ] P2. Carry-over S1-5: stateless logout, OTP cleanup, rate-limit store, SMS abuse, axe/e2e CI, perf. Источник: review 1.
