# Task S2-1: Catalog discovery

## Цель

Покупатель находит товар в общем каталоге: поиск по названию
товара/магазина, сортировка по новизне/цене, пагинация.

## AC

- [x] `packages/shared/src/contracts/catalog.ts`: `CatalogQuery`
      (`q?`, `sort?`, `page?`, `pageSize?` с defaults 1/100),
      `CatalogResponse` (`products`, `page`, `pageSize`, `total`,
      `hasMore`); Zod coercion, q trim 1–100, sort
      `newest|price_asc|price_desc`, page ≥1, pageSize 1–100.
- [x] `GET /catalog/products`: ILIKE по `products.name`/`shops.name` с
      escape `%_`; только published product/shop; сортировки с tie-break
      id; total/hasMore; невалидные query → 400.
- [x] Ответ без query сохраняет текущую выдачу (page=1, pageSize=100),
      но добавляет meta; UI запрашивает pageSize=12.
- [x] Обновить exact-ожидания существующих storefront/e2e тестов под
      новый ответ, не ослаблять до `toMatchObject`.
- [x] Web MarketplacePage: поиск, сортировка, пагинация/«Показать ещё»,
      URL `q/sort/page`, сброс page при смене q/sort; loading/empty/
      error; 320/1440; labels/focus.
- [x] Тесты: API DB (поиск товар/магазин, сортировки, page/pageSize,
      total/hasMore, скрытые, 400), web (controls/URL/empty/error).
- [x] `pnpm verify` зелёный; axe/manual витрины (light) 0 critical.

## Change

`openspec/changes/03-catalog-discovery`, tasks 1.1–1.4.

## owns

- `packages/shared/src/contracts/catalog.ts` (+ тест), `index.ts`
- `apps/api/src/storefront/storefront.route.ts`, `storefront.service.ts`,
  тесты
- `apps/web/src/pages/MarketplacePage.tsx`, `lib/api.ts`, `queries.ts`,
  web-тесты
- `apps/api/src/e2e/seller-flow.db.test.ts` — только expected catalog
  response

Не трогать: seller-shop/product, auth, orders, `openspec/**`,
`.scrum/**`, `docs/tasks/01-*`. Новых зависимостей нет.

## Контракты

- Query: `q` string trim 1–100 optional; `sort` enum default newest;
  `page` int ≥1 default 1; `pageSize` int 1–100 default 100.
- Response: `{ products: ProductCard[], page, pageSize, total, hasMore }`.
- `hasMore = page * pageSize < total`.
- Ошибки: 400 `{error:"invalid_request"}`; 200 пустой список.
- Товар/магазин: только `published`.

## Решения

- Default 100 сохраняет прежний набор; homepage UI передаёт 12.
- Поиск по названию, не описанию; без новых индексов (v1).
- URL query — источник состояния web; back/forward работают.
- Пагинация offset; сортировка tie-break по id.

## Non-goals

- Категории, фильтры по цене/состоянию, рекомендации, поиск по описанию.
- Индексы/pg_trgm, cursor-пагинация.
- Изменение карточек/магазина.

## Evidence

- `pnpm verify` — exit code, хвост.
- API DB-тесты — список; web-тесты.
- Commit SHA; скриншоты 320/1440; axe.
- Orchestrator запишет `.scrum/sprints/2/evidence/S2-1-verify.md`.

## Границы

- Работать только в task worktree ветки `task/S2-1-catalog`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре — стоп, вопрос оркестратору.
