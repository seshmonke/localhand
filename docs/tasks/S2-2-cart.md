# Task S2-2: Cart

## Цель

Покупатель собирает published-товары из разных магазинов в одну
localStorage-корзину, видит группы/итоги, может удалить/очистить; корзина
переживает reload.

## AC

- [ ] `packages/shared/src/contracts/cart.ts`: `CartItem` (productId,
      name, priceKopecks, imageUrl, shopSlug, shopName), `CartState`
      (version, items), Zod parse; лимит 50.
- [ ] `apps/web/src/cart/**`: storage key `localhand.cart.v1`, безопасный
      parse/version, hydrate после mount, add (идемпотентно), remove,
      clear, count, groups by shop, totals; ошибка localStorage — работа
      в памяти без падения.
- [ ] ProductCard/ProductPage: кнопка «В корзину» для published; клик
      не переходит по ссылке карточки; после add — aria-live сообщение.
- [ ] Header: badge count + ссылка `/cart`; доступно без auth.
- [ ] `/cart`: группы по магазинам, итог группы/общий, remove, clear,
      CTA checkout, empty state; 320/1440; labels/focus.
- [ ] Тесты: storage/reducer unit (add/remove/clear/дубль/лимит/parse
      error), UI persistence/groups/badge/empty, ссылка checkout.
- [ ] `pnpm verify` зелёный; axe/manual light 0 critical на `/cart`.

## Change

`openspec/changes/04-cart`, tasks 2.1–2.4.

## owns

- `packages/shared/src/contracts/cart.ts` (+ тест), `index.ts`
- `apps/web/src/cart/**`
- `apps/web/src/components/ProductCard.tsx`, `pages/ProductPage.tsx`
- `apps/web/src/App.tsx` (provider/header/routes), `pages/CartPage.tsx`
- web-тесты

Не трогать: `apps/api/**`, seller/auth/orders, checkout (S2-3),
`openspec/**`, `.scrum/**`, `docs/tasks/01-*`. Новых зависимостей нет.

## Контракты

- `CartItem`: `{ productId: number>0, name, priceKopecks int≥0,
  imageUrl: string|null, shopSlug, shopName }`.
- Storage JSON `{version:1, items: CartItem[]}`, max 50.
- Товары в корзине — snapshot отображаемых данных, не источник цены;
  checkout пересчитает.
- Все операции синхронные в контексте + persist в localStorage.
- `count` = число позиций (quantity всегда 1).

## Решения

- Корзина клиентская; серверной корзины/quantity/stock в v1 нет.
- Add по productId идемпотентен: повтор не меняет count.
- Группировка по shopSlug; порядок групп — первый добавленный товар.
- Лимит 50; при превышении — сообщение, без добавления.
- Кнопка «В корзину» внутри `<Link>`: `preventDefault` +
  `stopPropagation`.
- `/cart` доступна без login; checkout CTA ведёт на `/checkout`
  (страница появится в S2-3; до неё — disabled/ссылка на login?).
  В S2-2 CTA можно вести на `/checkout` (404 до S2-3) — лучше
  зафиксировать: CTA ведёт на `/checkout`, S2-3 добавит страницу.
- Header badge — ссылка с aria-label «Корзина, N товаров».

## Non-goals

- Серверная корзина, sync устройств, quantity >1, stock/резерв.
- Checkout/orders (S2-3), оплата/доставка.
- Скидки/купоны.

## Evidence

- `pnpm verify` — exit code, хвост.
- Web-тесты — список.
- Скриншоты 320/1440, axe light.
- Commit SHA; orchestrator запишет
  `.scrum/sprints/2/evidence/S2-2-verify.md`.

## Границы

- Работать только в task worktree ветки `task/S2-2-cart`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре — стоп, вопрос оркестратору.
