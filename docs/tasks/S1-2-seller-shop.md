# Task S1-2: Seller shop backend

## Цель

Авторизованный продавец читает, создаёт и меняет свой магазин, публикует
и снимает его с публикации; slug уникален; чужой магазин недоступен.

## AC

- [ ] `packages/shared`: контракты `seller.ts` — `SellerShop`,
      `SellerShopResponse` (`shop: SellerShop | null`), `CreateShop`,
      `UpdateShop`; slug 3–40 `[a-z0-9-]`, без ведущего/хвостового
      дефиса, резервные slug отклоняются; экспорт из `index.ts`.
- [ ] `GET /seller/shop`: 200 `{ shop }` или `{ shop: null }` по сессии;
      без/с протухшей cookie — 401.
- [ ] `POST /seller/shop`: создаёт магазин в `draft`; если у user нет
      seller — создаёт seller (`displayName` = имя магазина) в одной
      транзакции; существующий магазин — 409; занятый slug — 409;
      невалидный/резервный slug — 400; без сессии — 401.
- [ ] `PATCH /seller/shop`: частично меняет name/slug/description/status;
      `status` только `draft|published` (`blocked` — 400); занятый slug —
      409; нет магазина — 404; без сессии — 401.
- [ ] Публикация: published-магазин отдаётся на `GET /shops/:slug`;
      draft — 404; снятие с публикации возвращает 404 на витрине, данные
      сохраняются.
- [ ] Authz: второй продавец не может изменить магазин первого; каждый
      видит только свой; проверка через две сессии/два user.
- [ ] Тесты: create, duplicate slug, invalid/reserved slug, publish/
      unpublish storefront, no session 401, no shop 404, чужая изоляция.
- [ ] `pnpm verify` в worktree — зелёный.

## Change

`openspec/changes/02-seller-onboarding`, capability `seller-shop`,
tasks 2.1–2.4. Спека — `specs/seller-shop/spec.md`; дизайн — `design.md`
(раздел «Магазин»).

## owns

- `packages/shared/src/contracts/seller.ts` (+ тест), `index.ts`
- `apps/api/src/seller-shop/**` (route, service, тесты)
- `apps/api/src/auth/session-guard.ts` (+ тест) — общий guard сессии
- `apps/api/src/app.ts` — только регистрация route

Не трогать: `apps/web/**`, `packages/ui/**`, product-код (S1-3),
`openspec/**`, `.scrum/**`, `docs/tasks/01-seller-onboarding.md`.

## Контракты

- `SellerShop`: `{ id: number, slug: string, name: string,
  description: string | null, status: "draft" | "published" |
  "blocked" }`; без timestamps в API.
- `SellerShopResponse`: `{ shop: SellerShop | null }`.
- `CreateShop`: `{ name: 1–80, slug, description?: ≤2000 }`.
- `UpdateShop`: partial от Create + `{ description?: string | null,
  status?: "draft" | "published" }`, минимум одно поле.
- Ошибки: `{ error: string }`; 400 invalid_request, 401 unauthorized,
  404 not_found, 409 slug_taken/shop_exists.
- Cookie/сессия — как в S1-1 (`lh_session`, JWT `sub` = users.id).

## Решения

- Seller создаётся лениво при `POST /seller/shop`; `displayName` = имя
  магазина. Пользователь без seller — валидный «продавец без магазина».
- Один seller = один shop; unique-конфликты ловятся по коду `23505` и
  имени constraint, наружу — 409 без деталей.
- Резервные slug: `admin`, `api`, `auth`, `login`, `shops`, `products`,
  `catalog`, `static`, `assets`.
- Изоляция по сессии: в пути нет чужого id; второй продавец физически
  не может адресовать чужой shop. Тест фиксирует, что PATCH B не меняет
  shop A.
- Storefront уже фильтрует `shops.status = published`; новых публичных
  ручек не добавлять.

## Non-goals

- Products CRUD (S1-3), UI (S1-4), blocked-модерация, owner-admin.
- Загрузка фото/S3, смена demo-seed, buyer-auth.
- Новые зависимости.

## Evidence

- `pnpm verify` — команда, exit code, хвост (58+ API тестов).
- DB-backed тесты — список сценариев.
- Commit SHA; orchestrator запишет
  `.scrum/sprints/1/evidence/S1-2-verify.md`.

## Границы

- Работать только в task worktree ветки `task/S1-2-shop`.
- Коммитить в свою ветку; не пушить, не мержить, не менять main.
- Не добавлять зависимость без записи в отчёт.
- При дыре в спеке — стоп, вопрос оркестратору.
