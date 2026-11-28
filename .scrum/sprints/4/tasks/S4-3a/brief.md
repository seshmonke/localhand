# Brief: S4-3a — storefront copy to i18n catalog

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-3a` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [S4-2 brief](../S4-2/brief.md) ·
> [text review](../../../../../docs/tasks/text-review.md)

## 1. Objective

W2 storefront-строки (витрина, магазин, карточка товара, 404) переезжают в
`packages/i18n/src/resources/ru.ts`. Значения не меняются; поведение не
меняется; baseline 424 → 334.

## 2. AC

- [ ] `MarketplacePage` 64, `ShopPage` 12, `ProductPage` 11,
  `NotFoundPage` 3 findings → `ru.ts`; в этих файлах нет кириллицы.
- [ ] Ключи `marketplace.*`, `shop.*`, `product.*`, `common.notFound.*`;
  typed/t; можно переиспользовать `common.*`.
- [ ] Значения ровно как в main; тексты/статусы/ошибки не переписаны.
- [ ] Тесты/e2e проходят; e2e 13, axe 72/0; `pnpm verify` 0;
  `check:i18n` 0; baseline −90/0 added, deadKeys 0.
- [ ] W2 остаток (cart/auth/admin/dev), S4-4 shared/SMS/index не тронуты.

## 3. Tier и change

- Tier T1 (refactor, no behavior). `No spec change: i18n refactor`.
- ADR 0006.

## 4. owns

- `apps/web/src/pages/MarketplacePage.tsx` (+ test)
- `apps/web/src/pages/ShopPage.tsx` (+ test)
- `apps/web/src/pages/ProductPage.tsx` (+ test)
- `apps/web/src/pages/NotFoundPage.tsx` (+ test)
- `packages/i18n/src/resources/ru.ts`
- `scripts/i18n-baseline.json` (prune 90)
- `apps/web/src/components/**` только если storefront-строки живут там
  (перечислить в report)
- e2e-локаторы, если значения/ключи меняют селекторы
- report/handoff/evidence S4-3a

Не трогать: cart/auth/admin/dev-страницы, `App.tsx`, shared labels/SMS,
`index.html`, specs/state/board.

## 5. Контракты

- Плоские typed-ключи; значения — текущие.
- `marketplace.*` — витрина/фильтры/карточки; `shop.*` — страница
  магазина; `product.*` — карточка товара; `common.notFound.*` — 404.
- Plural — `t("key", { count })`; даты/деньги — `Intl`.
- Raw/dynamic `t()` запрещены.

## 6. Non-goals

- Copywriter review W2 — отдельный шаг после миграции (по каталогу).
- Поведение, категории, stats, demo-ссылка, «Без комиссии» — PBI владельца.
- Cart/auth/admin/dev, shared/SMS/index.

## 7. Output format

- `report.md`, `handoff.md`, `evidence/`; PR <600 code+tests.
- Если >600 — NEEDS_SPLIT (например, Marketplace отдельно).

## 8. Tools/sources

- `pnpm verify`, `pnpm check:i18n`, `pnpm test:e2e`.
- Read: ADR 0006, S4-2 brief §5, `.scrum/reviews/text-site-audit.md`,
  `docs/design/content.md`.

## 9. Evidence contract

- Characterization before/after (existing tests); key/plural tests, если
  появился plural; baseline diff 90 removed/0 added; `check:i18n` 0.
- E2E 13/axe 72/0; bundle delta по ADR 0004.
- T1 refactor: tests before migration; no test-after; no weakened tests.

## 10. Stop conditions

- Нужно менять значение/поведение/статус.
- Затронуты cart/auth/admin/dev/shared/SMS/index.
- Baseline не уменьшился на 90 или появились new violations.
- >600 code+tests без split.

## 11. Границы

- Только owns; не мержить; не менять state/board/specs.
- Live/PDn/Ozon — нет.
