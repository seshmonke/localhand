# Handoff: Task S4-3a — storefront copy to i18n catalog

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-3a` ·
> `change: No spec change: i18n refactor` ·
> links: [report](report.md) · [evidence](evidence/)

Durable-путь: `.scrum/sprints/4/tasks/S4-3a/handoff.md`. Ветка
`task/S4-3a-storefront-catalog`, база `main@304e3d7`, code-коммит
`aa9e5a3`.

## Сделано

- Storefront-копия в typed `ru.ts`: `MarketplacePage` 64, `ShopPage` 12,
  `ProductPage` 11, `NotFoundPage` 3 findings → 0.
- Ключи `marketplace.*` (62), `shop.*` (9), `product.*` (7),
  `common.notFound.*` (3), `common.connectionError`, `common.backToCatalog`;
  `common.retry` переиспользован.
- TDD characterization: 10 новых/расширенных тестов зелёные до миграции;
  262/262 после.
- Baseline: **424 → 334** (−90, 0 added), deadKeys 0.
- Code+tests: **576** (baseline excluded), split не нужен.
- Evidence: [evidence/](evidence/).

## Осталось

- W2-остаток: `CartPage`, `AddToCartButton`, `CartContext`,
  `LoginPage`, `AdminShopPage`, `AdminProductsPage`,
  `AdminProductFormPage`, product forms/statuses, admin shell/guard —
  отдельным брифом.
- S4-4: shared labels/SMS/statuses и `index.html` meta — отдельным
  брифом; `index.html` — allowlist по ADR 0006.
- Следующий шаг: merge S4-3a, затем следующий storefront/W2 PR.

## Что не делать

- Не менять значения/поведение storefront: тексты перенесены 1:1.
- Не трогать `App.tsx`, cart/auth/admin/dev-страницы, shared
  labels/SMS, `index.html`.
- Не менять state/board/specs.

## Грабли

- `apps/web` typecheck читает `packages/i18n/dist`: перед точечным
  `pnpm --filter @localhand/web typecheck` нужен
  `pnpm --filter @localhand/i18n build`. Root `pnpm verify` собирает
  i18n сам.
- E2E: отдельная БД (`localhand_s43a`), API `:3100`, web dev `:5273`,
  `WEB_ORIGIN` и `PLAYWRIGHT_BASE_URL` совпадают; Vite proxy на `:3100`
  патчился временно и возвращён к `:3000` до коммита. Порты 3000/5173
  могут быть заняты другими worktree.
- Шаблонные значения: `marketplace.empty.queryDescription` и
  `marketplace.outOfRange.description` используют `{{query}}`/`{{total}}`;
  тесты проверяют исходный текст с подстановкой.
- `screen.getByText("Вещи")` не работает из-за `<br />` в постере:
  characterization сравнивает `textContent` параграфа.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | web 262, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 334 findings, deadKeys 0 |
| `pnpm test:e2e` | 0 | 13 passed; axe 72 scans / 0 |
| bundle | — | +4 777 B raw / +478 B gzip (+0.249%), ADR 0004 pass |

## Открытые треды

- `#task-4`: merge S4-3a → следующий storefront/W2 PR.
- PR/review — по возврату координатору (PR создаётся после push).

## Doc change

- `No doc change: i18n refactor`.

## Read-back получателя

Ожидается read-back: «Понял: storefront 90 findings → `ru.ts`, baseline
334, 576 code+tests. Делаю: merge и следующий W2/S4-4. Не трогаю:
shared/SMS/index/state.»
