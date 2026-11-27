# Task S1-4b: Seller products admin UI

## Цель

Продавец в админке видит свои товары, создаёт, редактирует, публикует и
скрывает их. Таблица на десктопе, карточки на мобильном; loading/empty/
error и a11y.

## AC

- [x] API client/queries: `fetchSellerProducts`, `createProduct`,
      `updateProduct`; ключи под `sellerKeys.products` (namespace
      `sellerKeys.all` уже очищается при login/401/logout); invalidate
      списка после мутаций; `ApiError` 400/401/404/409.
- [x] `/admin/products`: список только своих товаров (все статусы),
      desktop — таблица (название, цена, статус, действия), mobile —
      карточки; sticky header/тач-зоны; кнопка «Новый товар»; пустое
      состояние со ссылкой на форму; loading/error.
- [x] `/admin/products/new`: форма name, description, цена в рублях
      (запятая/точка → копейки через `rublesToKopecks`), imageUrl; POST;
      `description` не отправлять при пустом значении (не `null`);
      `imageUrl` пустой → `null`; успех → список/карточка; 400/409 в
      сообщения.
- [x] `/admin/products/:id`: редактирование из list-кэша (GET detail
      нет); PATCH только изменённых полей; publish/hide/draft отдельными
      действиями; 404 → «товар не найден»; 409 `shop_not_published` с
      подсказкой опубликовать магазин; кнопки disabled по состоянию.
- [x] Статусы: draft/published/hidden бейджи, не только цветом; publish
      разрешён только при published-магазине (иначе disabled + ссылка на
      магазин); hide/draft всегда; already-published товар можно
      редактировать при draft-магазине, publish-кнопка disabled.
- [x] Responsive 320/1440: нет горизонтальной прокрутки; таблица не
      уезжает, на мобильном карточки; формы в одну колонку.
- [x] A11y: caption/headers таблицы, labels, aria-invalid/describedby,
      focus после ошибки, клавиатурные действия, тач-зоны ≥44.
- [x] Web unit-тесты: список+empty, create (рубли→копейки), edit/PATCH,
      publish/hide, 409 shop_not_published, 404, no shop → ссылка.
- [x] `pnpm verify` — зелёный.

## Change

`openspec/changes/02-seller-onboarding`, task 4.4 + остаток 4.5,
capability `product-management`; UI — `design.md`,
`docs/design/responsive.md`.

## owns

- `apps/web/src/pages/AdminProductsPage.tsx` (заменить заглушку)
- `apps/web/src/pages/AdminProductFormPage.tsx`
- `apps/web/src/components/admin/**` (product table/cards/form)
- `apps/web/src/lib/api.ts`, `queries.ts` (product-методы/ключи)
- `apps/web/src/App.tsx` (routes `/admin/products/new`, `/:id`)
- `apps/web/src/App.test.tsx` + новые web-тесты

Не трогать: `apps/api/**`, `packages/shared/**`, `packages/ui/**` (только
импорт), auth/shop UI S1-4a (только читать), `openspec/**`, `.scrum/**`,
`docs/**`.

## Контракты

- `SellerProduct`, `SellerProductListResponse`, `SellerProductResponse`,
  `CreateProduct`, `UpdateProduct` из `@localhand/shared`.
- Create: `description` omitted при пустом; `imageUrl` null при пустом;
  status не отправлять — всегда draft; envelope `{product}`.
- Update: только изменённые поля; price в копейках; publish/hide —
  отдельный PATCH `{status}`; `description`/`imageUrl` null для очистки.
- Ошибки: 400 invalid_request, 401, 404 not_found, 409
  shop_required/shop_not_published.
- Список уже отсортирован `updated_at desc`; timestamps в ответе нет.

## Решения

- Нет GET `/seller/products/:id`: форма берёт товар из list-кэша; при
  прямом заходе — список и поиск по id, иначе 404-состояние.
- Цена: поле в рублях с копейками (`1234,50`), хранение/отправка —
  integer копеек; 0 разрешён контрактом, UI предупреждает.
- Publish/hide — отдельные кнопки, не part of form submit, чтобы не
  ловить 409 при сохранении already-published товара.
- После publish/hide invalidate list; форма обновляет свой товар из
  ответа.
- Нет shop: список пуст, CTA ведёт на `/admin/shop`.
- Никаких новых зависимостей.

## Non-goals

- Загрузка фото/S3, категории/фильтры, bulk-actions, пагинация.
- E2E Playwright и preview smoke — S1-5.
- Изменение API/контрактов.

## Evidence

- `pnpm verify` — exit code, хвост.
- Web-тесты — сценарии.
- Скриншоты 320/1440 — S1-4b или S1-5.
- Commit SHA; evidence запишет orchestrator.

## Границы

- Работать только в task worktree ветки `task/S1-4b-admin-products`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- Не добавлять зависимости без ADR.
- При дыре в контракте — стоп, вопрос оркестратору.
