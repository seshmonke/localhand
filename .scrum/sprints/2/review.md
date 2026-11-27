# Review: Спринт 2

## Инкремент

- Preview: локальный (web 5173, API 3000); browser e2e buyer→seller.
- Изменения: `03-catalog-discovery`, `04-cart`, `05-checkout-orders` —
  заархивированы; specs `catalog-discovery`, `cart`, `checkout-orders`
  созданы.
- PR: #26 catalog, #28 cart, #30 orders API, #31 orders UI, #33
  security/e2e; closes #27/#29/#32; plan #25.

## Демо-сценарий

1. Покупатель ищет товар, сортирует, листает каталог.
2. Добавляет товар в корзину, перезагружает — корзина сохраняется.
3. Оформляет заказ → login по dev-OTP → checkout.
4. Видит заказ в `/orders`; продавец видит его в `/admin/orders`;
   второй покупатель/продавец получает 404/пусто.

## Вердикты

- QA: PASS — verify API 156/156, shared 103/103, web 114/114, e2e API
  7/7, browser 3/3 dev+preview, OpenSpec 7/7.
- Security: PASS — authz 401/404, no-store, логи без phone/comment/code,
  SMS-preflight dev.
- Perf: **PARTIAL / owner-approved proxy** — preview lab LCP 508/688 ms
  (<2500, gate enforced); field p75/RUM не измерен, вынесен в бэклог
  решением владельца 27.11.2026.
- A11y: PASS — axe 16 сканов light/dark 320/1440, 0.
- Design: PARTIAL — mobile/desktop и состояния работают, но выявлена
  несистемная сетка/отступы; PBI layout-system согласован владельцем.
- User Proxy: buyer-flow проверен на preview; реальные покупатели — нет.

## Решение PO

ACCEPT

Причина: buyer-core работает end-to-end, authz/PII/e2e зелёные.
LCP принят как lab/preview DoD-прокси с явным исключением; field RUM и
layout-system — следующие PBI.

## Новые задачи

- [ ] P1. Layout system: PageShell/Container/Grid/Stack/Sidebar/Card,
  12 колонок, 8pt, overlay/screenshot. Источник: review 2.
- [ ] P2. Field RUM/LCP p75. Источник: review 2/DoD exception.
- [ ] P2. Orders pagination, Cache-Control spec, admin axe, auth/me no-store.
