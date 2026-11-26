# Tasks

- [ ] 1.1 Добавить pgEnum и таблицы `sellers`, `shops`, `products` в `apps/api/src/db/schema.ts`; сгенерировать миграцию.
- [ ] 1.2 Добавить Zod-контракты storefront в `packages/shared` и экспортировать их.
- [ ] 1.3 Реализовать `GET /catalog/products`, `GET /shops/:slug`, `GET /products/:id` с фильтром published и 404.
- [ ] 1.4 Покрыть API-тестами: каталог, магазин, товар, скрытые черновики, 404.
- [ ] 1.5 Сделать идемпотентный seed: один seller, shop `local-hand-demo`, 3–5 товаров.
- [ ] 1.6 Подключить react-router и страницы marketplace/shop/product к API через TanStack Query.
- [ ] 1.7 Добавить `ProductCard`, состояния loading/empty/error и адаптивную сетку 2/4.
- [ ] 1.8 Добавить компонентные тесты состояний и карточки; обновить `pnpm verify`.
- [ ] 1.9 Прогнать preview: каталог, магазин, товар, 404; записать evidence в задачу.
- [ ] 1.10 Обновить `docs/concept/product.md`/`docs/design/responsive.md`, если реализация выявила расхождение.
