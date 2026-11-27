# Design

## Decisions

### Query и ответ

- `q` — trim, 1–100; пустой = без поиска.
- `sort` — `newest` (default) | `price_asc` | `price_desc`.
- `page` ≥ 1, default 1; `pageSize` 1–48, default 12.
- Ответ `{ products, page, pageSize, total, hasMore }`; старые поля
  сохраняются. Это расширение контракта, не ломающее web.
- Невалидные query → 400 `invalid_request`.

### Выборка

- Базовый фильтр: `products.status='published' AND shops.status='published'`.
- Поиск: `ILIKE` по `products.name` и `shops.name`, wildcard `%`/`_`
  экранируются; параметры Drizzle.
- Сортировка: `newest` — `products.created_at desc, products.id desc`;
  цена — `price_kopecks asc/desc, id desc`.
- `total` — count с теми же условиями; `hasMore = page * pageSize < total`.
- Offset-пагинация; максимум 48. Индексы не добавляем: v1-объём мал,
  отдельный change при росте.

### Web

- `MarketplacePage`: строка поиска (submit/Enter), select сортировки,
  «Показать ещё» или page controls; URL query `q/sort/page` — shareable.
- Debounce поиска не нужен: submit. Сброс `page=1` при смене q/sort.
- Loading skeleton, empty «ничего не найдено», error + retry.
- 320/1440, touch ≥44, labels, focus.

### Тесты

- Contract parse/escape.
- DB route: поиск по товару и магазину, сортировки, page/pageSize,
  total/hasMore, скрытые товары, 400.
- Обновить exact-ожидания существующих storefront/e2e тестов под новый
  ответ (не ослаблять до toMatchObject).
- Web: controls, URL, empty/error.

## Risks / Trade-offs

- ILIKE без индекса — ок для v1; при росте отдельный change.
- Поиск только по названию, не по описанию — сознательно.
- Offset-пагинация может сдвигаться при новых товарах — допустимо v1.
