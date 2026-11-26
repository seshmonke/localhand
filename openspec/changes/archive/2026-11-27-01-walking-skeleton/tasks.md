# Tasks

- [x] 1.1 Добавить pgEnum и таблицы `sellers`, `shops`, `products` в `apps/api/src/db/schema.ts`; сгенерировать миграцию.
- [x] 1.2 Добавить Zod-контракты storefront в `packages/shared` и экспортировать их.
- [x] 1.3 Реализовать `GET /catalog/products`, `GET /shops/:slug`, `GET /products/:id` с фильтром published и 404.
- [x] 1.4 Покрыть API-тестами каталог, магазин, товар, 404; фильтр published проверен на seed/preview.
- [x] 1.5 Сделать идемпотентный seed: один seller, shop `local-hand-demo`, 3–5 товаров.
- [x] 1.6 Подключить react-router и страницы marketplace/shop/product к API через TanStack Query.
- [x] 1.7 Добавить `ProductCard`, состояния loading/empty/error и адаптивную сетку 2/4.
- [x] 1.8 Добавить компонентные тесты состояний и карточки; обновить `pnpm verify`.
- [x] 1.9 Прогнать preview: каталог 4 товара, магазин, товар, 404; preview + `/api` proxy работают.
- [x] 1.10 Обновить `docs/concept/product.md`/`docs/design/responsive.md`, если реализация выявила расхождение. Расхождений нет.
