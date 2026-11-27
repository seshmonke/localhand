# Proposal

## Why

Витрина показывает последние published-товары без поиска, сортировки и
страниц. Покупатель не может быстро найти нужное; Sprint 2 начинается с
buyer-first discovery.

## What Changes

- `GET /catalog/products` получает `q`, `sort`, `page`, `pageSize`.
- Поиск по названию товара/магазина, сортировка newest/price asc/desc,
  пагинация с total/hasMore.
- Web: поиск, сортировка, пагинация и состояния на витрине.
- Только published-товары published-магазинов.

## Capabilities

### New Capabilities

- `catalog-discovery`: поиск, сортировка и пагинация каталога.

### Modified Capabilities

Нет. Без query сохраняется текущий набор (page=1, pageSize=100);
ответ дополняется page/pageSize/total/hasMore, UI запрашивает 12.

## Impact

- `apps/api`: storefront route/service/query, тесты.
- `apps/web`: MarketplacePage, query-контракты, состояния.
- `packages/shared`: каталог-контракты.
- PII/секреты: нет.

## Non-goals

- Категории, фильтры по состоянию/цене, рекомендации, поиск по описанию.
- Новые индексы/pg_trgm; ILIKE на v1-объёме.
- Изменение карточки товара/магазина.

## Success metric

Покупатель находит товар по части названия, сортирует по цене/новизне,
листает страницы; скрытые товары не видны; `pnpm verify` зелёный.

## References

- `docs/tasks/02-buyer-core.md`
- `openspec/specs/storefront/spec.md`
- `docs/concept/product.md`
