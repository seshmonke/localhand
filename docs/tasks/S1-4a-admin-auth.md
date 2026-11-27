# Task S1-4a: Seller auth UI + shop onboarding

## Цель

Продавец входит по телефону через dev-OTP, попадает в защищённую админку,
создаёт/редактирует и публикует магазин. Mobile 320 и desktop 1440.

## AC

- [x] API client в `apps/web`: `requestJson` с `credentials: "include"`,
      JSON-телом, парсингом `{ error }` и типизированной `ApiError`
      (status/code); методы `fetchMe`, `requestCode`, `verifyCode`,
      `logout`, `fetchSellerShop`, `createShop`, `updateShop`.
- [x] `/login`: форма телефона → request-code → форма 6-значного кода →
      verify; dev-код показывается только если API его вернул; успех —
      invalidate `/auth/me`, редирект на `next` или `/admin`; 400/401/429
      дают понятные сообщения; loading/disabled; labels и фокус.
- [x] Guard `/admin/*`: `/auth/me`; 401 → `/login?next=...`; loading-
      состояние; logout очищает сессию и ведёт на `/login`.
- [x] Admin shell: desktop sidebar, mobile компактная навигация; активный
      пункт; ссылки на магазин и товары; контент в `<main>`; клавиатура.
- [x] `/admin/shop`: нет магазина → onboarding (name, slug, description)
      → POST; есть магазин → settings (name/slug/description) → PATCH;
      publish/unpublish;
      статус-бейдж; 409 `slug_taken`/`shop_exists`/`shop_blocked` и 400
      маппятся в сообщения; loading/empty/error; success aria-live.
- [x] Responsive: 320 без горизонтальной прокрутки, формы в одну колонку;
      1024+ sidebar и две колонки; тач-зоны ≥44, поля ≥16 px.
- [x] A11y: labels, aria-describedby/aria-invalid, видимый focus, ошибки
      не только цветом; клавиатурный проход login → shop → publish.
- [x] Web unit-тесты: login success/401/429, guard redirect, shop create
      duplicate slug, shop publish; fetch замокан.
- [x] `pnpm verify` — зелёный.

## Change

`openspec/changes/02-seller-onboarding`, tasks 4.1–4.3 + применимые
loading/empty/error, mobile/desktop и a11y из 4.5. UI-спек нет;
поведение — по `design.md` (UI) и `docs/design/responsive.md`.

## owns

- `apps/web/src/lib/api.ts`, `queries.ts`, `query-client.ts`
- `apps/web/src/pages/LoginPage.tsx`, `Admin*Page.tsx`
- `apps/web/src/components/admin/**`
- `apps/web/src/App.tsx` (routes/shell), `apps/web/src/App.test.tsx`
- при необходимости — `apps/web/src/components/FormField.tsx`

Не трогать: `apps/api/**`, `packages/shared/**`, `packages/ui/**` (только
импорт), product UI (S1-4b), `openspec/**`, `.scrum/**`, `docs/**`.

## Контракты

- Auth: `RequestCodeSchema/Response`, `VerifyCode*`, `MeResponse`,
  `AuthUser` из `@localhand/shared`.
- Shop: `SellerShopResponse`, `CreateShop`, `UpdateShop` из S1-2.
- Ошибки: `{ error }`; 400 invalid_request, 401 unauthorized, 404
  not_found, 409 slug_taken/shop_exists/shop_blocked.
- Cookie `lh_session` — httpOnly, frontend её не читает; все запросы с
  `credentials: "include"`.
- Dev-код: только если `devCode` есть в ответе; не показывать в
  production (API его не отдаёт).

## Решения

- Не добавлять глобальный redirect на 401: guard решает для `/admin`,
  login остаётся публичным.
- `/admin` ведёт на `/admin/shop` (v1: один магазин).
- `/admin/products` в S1-4a — пункт навигации и заглушка «скоро» либо
  редирект на shop; полноценно — S1-4b.
- Формы: контролируемые поля, ошибки сервера в alert-блоке, успех —
  aria-live.
- Никаких новых зависимостей; react-query уже есть.

## Non-goals

- Products list/form (S1-4b), buyer UI, e2e Playwright (S1-5), S3/фото.
- Смена API/контрактов; реальный SMS.

## Evidence

- `pnpm verify` — exit code, хвост.
- Web-тесты — список сценариев.
- Скриншоты 320/1440 — если успеваем; иначе S1-4b/S1-5.
- Commit SHA; evidence запишет orchestrator.

## Границы

- Работать только в task worktree ветки `task/S1-4a-admin-auth`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- Не добавлять зависимости без ADR.
- При дыре в контракте — стоп, вопрос оркестратору.
