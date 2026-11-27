# Design

## Decisions

- Состояние — React context + `localStorage` ключ `localhand.cart.v1`;
  hydrate после mount, безопасный parse/version.
- Item: `{ productId, name, priceKopecks, imageUrl, shopSlug, shopName }`;
  quantity всегда 1 — stock в v1 нет.
- Add по `productId` идемпотентен; remove/clear; максимум 50 позиций
  (единый лимит с checkout).
- Группировка по `shopSlug`; итог магазина = сумма priceKopecks; общий —
  сумма групп.
- Цена — отображаемая; checkout пересчитывает сервер.
- Корзина доступна без auth; auth — на checkout.
- `/cart`: группы, remove, clear, CTA checkout; empty state со ссылкой
  на каталог.
- Продуктовая карточка и страница товара получают «В корзину» (если
  published); header badge с count; ссылка на `/cart`.
- Mobile 320 / desktop 1440, touch ≥44, aria-live для add/remove,
  keyboard.
- Ошибка localStorage (quota/parse) — корзина пустая, console-free.
- Тесты: reducer/storage unit, UI add/remove/persistence/groups/limit.

## Risks / Trade-offs

- localStorage не синхронизируется между устройствами — v1.
- Stale цены/товары: checkout валидирует и фиксирует snapshot.
- Нет quantity/stock — сознательно до inventory change.
