# Tasks

## 1. Catalog discovery

- [ ] 1.1 Добавить контракты catalog query/response (`q`, `sort`, `page`, `pageSize`, `total`, `hasMore`) в `packages/shared`.
- [ ] 1.2 Реализовать поиск/сортировку/пагинацию `GET /catalog/products` с валидацией и только published.
- [ ] 1.3 Добавить в web поиск, сортировку, пагинацию и loading/empty/error на витрину.
- [ ] 1.4 Покрыть тестами: поиск, сортировка, пагинация, скрытые товары, границы.

## 2. Cart

- [ ] 2.1 Добавить модель/контекст корзины, localStorage `localhand.cart.v1`, лимит и безопасный parse.
- [ ] 2.2 Добавить add/remove/clear, badge и кнопки на карточке/странице товара.
- [ ] 2.3 Сделать `/cart` с группировкой по магазинам и итогами.
- [ ] 2.4 Покрыть тестами: add/remove, дубль, persistence, группы, лимит.

## 3. Checkout & orders API

- [ ] 3.1 Добавить `orders`, `order_items`, enum `order_status`, индексы и миграцию `0003`.
- [ ] 3.2 Добавить Zod-контракты checkout/order.
- [ ] 3.3 Реализовать `POST /checkout`: auth, валидация, группировка по магазинам, snapshot, транзакция.
- [ ] 3.4 Реализовать `GET /orders/mine` и `GET /orders/:id` с buyer-authz.
- [ ] 3.5 Реализовать `GET /seller/orders` и `GET /seller/orders/:id` с seller-authz.
- [ ] 3.6 Покрыть DB-тестами: успех, 401, пустой/невалидный список, недоступный товар, snapshot, чужие заказы.

## 4. Orders UI

- [ ] 4.1 Добавить `/checkout` с guard по сессии и возвратом после login.
- [ ] 4.2 Добавить `/orders` и `/orders/:id` для покупателя.
- [ ] 4.3 Добавить `/admin/orders` и `/admin/orders/:id` для продавца.
- [ ] 4.4 Сделать mobile/desktop, loading/empty/error, a11y и ссылки в навигации.
- [ ] 4.5 Покрыть web-тестами checkout, buyer/seller orders, guard и ошибки.

## 5. Security, evidence, docs

- [ ] 5.1 Добавить e2e: dev OTP → каталог → корзина → checkout → заказ → seller view.
- [ ] 5.2 Проверить authz, отсутствие телефона/кода/комментария в логах, PII.
- [ ] 5.3 Обновить legal/ADR по заказам, ПДн и отсутствию оплаты.
- [ ] 5.4 Прогнать `pnpm verify`, `openspec validate --all --strict`, preview; записать evidence.
- [ ] 5.5 Заархивировать change, review/retro, закрыть Sprint 2.
