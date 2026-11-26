# Tasks

## 1. Auth

- [ ] 1.1 Добавить `users`, `otp_codes`, `sellers.user_id` и миграцию.
- [ ] 1.2 Добавить Zod-контракты auth в `packages/shared`.
- [ ] 1.3 Реализовать `POST /auth/request-code` с rate-limit и dev/SMS-адаптером.
- [ ] 1.4 Реализовать `POST /auth/verify-code`, JWT httpOnly-cookie и создание user.
- [ ] 1.5 Реализовать `GET /auth/me` и `POST /auth/logout`.
- [ ] 1.6 Покрыть auth-тестами: валидный/неверный/просроченный код, лимит, нет cookie, dev в prod.

## 2. Shop

- [ ] 2.1 Добавить контракты shop и валидацию slug/резервов в `packages/shared`.
- [ ] 2.2 Реализовать `GET /seller/shop` и `POST /seller/shop` для своего магазина.
- [ ] 2.3 Реализовать `PATCH /seller/shop` и публикацию/снятие с публикации.
- [ ] 2.4 Покрыть shop-тестами: создание, дубль slug, чужой магазин 404, без сессии 401.

## 3. Products

- [ ] 3.1 Добавить контракты product-admin и валидацию цены/полей.
- [ ] 3.2 Реализовать `GET /seller/products` и `POST /seller/products` только для своего магазина.
- [ ] 3.3 Реализовать `PATCH /seller/products/:id`, publish/hide, проверку владельца.
- [ ] 3.4 Покрыть product-тестами: черновик, публикация, скрытие, чужая карточка 404, невалидная цена.

## 4. Seller admin UI

- [ ] 4.1 Добавить `/login` с запросом и вводом OTP; dev-код показывается только вне production.
- [ ] 4.2 Добавить guard `/admin` по `/auth/me` и редирект на login.
- [ ] 4.3 Добавить onboarding магазина: имя, slug, описание, публикация.
- [ ] 4.4 Добавить таблицу товаров и форму создания/редактирования; publish/hide.
- [ ] 4.5 Сделать mobile и desktop раскладки, loading/empty/error, a11y-фокус.

## 5. Security, evidence, docs

- [ ] 5.1 Добавить e2e/smoke: dev OTP → магазин → товар → публикация → витрина.
- [ ] 5.2 Проверить authz-тесты, rate-limit, отсутствие телефона/кода в логах.
- [ ] 5.3 Обновить ADR/`docs/legal/context.md` по auth и ПДн; зафиксировать SMS-провайдера.
- [ ] 5.4 Прогнать `pnpm verify`, `openspec validate --all --strict`, preview; записать evidence.
- [ ] 5.5 Заархивировать change после merge и обновить `specs/`.
