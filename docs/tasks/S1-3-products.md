# Task S1-3: Seller products backend

## Цель

Продавец ведёт товары своего магазина: список, создание, редактирование,
публикация и скрытие. Чужие товары недоступны; витрина показывает только
published-товары опубликованного магазина.

## AC

- [x] `packages/shared`: контракты `product-admin.ts` — `SellerProduct`,
      `SellerProductListResponse` (`{ products }`), `CreateProduct`,
      `UpdateProduct`; name 1–120, description ≤2000, priceKopecks integer
      0…2 147 483 647, imageUrl ≤2000 или null, статусы
      `draft|published|hidden`; экспорт из `index.ts`.
- [x] `GET /seller/products`: 200 `{ products }` только своего магазина,
      все статусы, сортировка `updated_at desc`; нет магазина — 200
      `{ products: [] }`; без сессии — 401.
- [x] `POST /seller/products`: создаёт товар в `draft` в своём магазине;
      нет магазина — 409 `shop_required`; невалидные поля — 400; без
      сессии — 401.
- [x] `PATCH /seller/products/:id`: частично меняет name/description/
      priceKopecks/imageUrl/status; чужой или несуществующий товар — 404;
      перевод в published разрешён только при published-магазине, иначе
      409 `shop_not_published`; уже published товар можно редактировать
      при draft-магазине (остаётся скрыт); hide/draft разрешены всегда;
      400 на невалидную цену; 401 без сессии.
- [x] Витрина: published-товар в published-магазине виден на `/`,
      `/shops/:slug` и `/products/:id`; hidden/draft исчезает; draft-
      магазин скрывает все свои товары.
- [x] Authz: второй продавец не видит и не меняет чужой товар; товары
      привязаны только к своему shop.
- [x] DB-backed тесты: список, создание, невалидная цена, publish/hide,
      чужой 404, без сессии 401, нет магазина 409, витрина.
- [x] `pnpm verify` в worktree — зелёный.

## Change

`openspec/changes/02-seller-onboarding`, capability
`product-management`, tasks 3.1–3.4. Спека —
`specs/product-management/spec.md`; дизайн — `design.md` (раздел
«Товары»).

## owns

- `packages/shared/src/contracts/product-admin.ts` (+ тест), `index.ts`
- `apps/api/src/seller-product/**` (route, service, тесты)
- `apps/api/src/app.ts` — только регистрация route
- `apps/api/src/auth/session-guard.ts` — использовать как есть

Не трогать: `apps/web/**`, `packages/ui/**`, `apps/api/src/seller-shop/**`
(только читать), `openspec/**`, `.scrum/**`, `docs/tasks/01-*`.

## Контракты

- `SellerProduct`: `{ id, name, description: string | null,
  priceKopecks: number, imageUrl: string | null, status: "draft" |
  "published" | "hidden" }`; без timestamps в API.
- `SellerProductListResponse`: `{ products: SellerProduct[] }`.
- `CreateProduct`: `{ name, description?, priceKopecks, imageUrl? }`;
  всегда создаётся `draft`, status в create не принимается.
- `UpdateProduct`: partial от Create + `{ description?: string | null,
  imageUrl?: string | null, status?: "draft" | "published" | "hidden" }`,
  минимум одно поле.
- Ошибки: `{ error: string }`; 400 invalid_request, 401 unauthorized,
  404 not_found, 409 shop_required/shop_not_published.
- Сессия — `createSessionGuard`/`getSessionUser` из S1-2.

## Решения

- Нет `GET /seller/products/:id`: список отдаёт все поля, нужные форме
  редактирования.
- Публикация товара требует `shops.status = published`; иначе 409
  `shop_not_published`. Скрытие/черновик доступны всегда.
- Чужой/несуществующий id → 404 через join по `shop.seller.user_id`, не
  403.
- Storefront уже фильтрует `products.status = published` и
  `shops.status = published`; новых публичных ручек не добавлять.
- Цена — целые копейки; верхняя граница — integer PostgreSQL, чтобы не
  ловить 500 на overflow.
- Без soft-delete и без категорий: их нет в схеме S1.

## Non-goals

- UI (S1-4), S3/фото, категории/фильтры, модерация, buyer-flow.
- Изменение схемы и миграции: `products` уже есть.
- Новые зависимости.

## Evidence

- `pnpm verify` — команда, exit code, хвост.
- DB-backed тесты — список сценариев.
- Commit SHA; orchestrator запишет
  `.scrum/sprints/1/evidence/S1-3-verify.md`.

## Границы

- Работать только в task worktree ветки `task/S1-3-products`.
- Коммитить в свою ветку; не пушить, не мержить, не менять main.
- Не добавлять зависимость без записи в отчёт.
- При дыре в спеке — стоп, вопрос оркестратору.
