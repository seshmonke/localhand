# Brief: S4-2b1 — orders buyer/seller to i18n catalog

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-2b1` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [S4-2 brief](../S4-2/brief.md) ·
> [text review](../../../../../docs/tasks/text-review.md)

## Objective

Orders buyer/seller W1-строки → `packages/i18n/src/resources/ru.ts`:
`OrdersPage` 19, `AdminOrderPage` 33, `AdminOrdersPage` 29 findings.
Значения не меняются; поведение/authz/статусы не меняются; baseline
583 → 502.

## AC

- [ ] Все B1 production-строки в `ru.ts`; в B1-файлах нет кириллицы.
- [ ] Ключи `orders.*`, `admin.order.*`; переиспользуй `order.*`,
  `payment.*`, `common.*`; typed/t.
- [ ] Значения ровно как в main (copy PR #83); тесты/e2e 13/axe.
- [ ] `pnpm verify` 0; `check:i18n` 0; baseline −81, deadKeys 0.
- [ ] W2/shared labels/SMS не тронуты.

## Tier/change

T1, `No spec change: i18n refactor`; ADR 0006.

## owns

- `apps/web/src/pages/OrdersPage.tsx` (+ test)
- `apps/web/src/pages/AdminOrderPage.tsx` (+ test)
- `apps/web/src/pages/AdminOrdersPage.tsx` (+ test)
- e2e locators только если значения/keys меняют селекторы
- `packages/i18n/src/resources/ru.ts`
- `scripts/i18n-baseline.json` (prune B1)
- report/handoff/evidence S4-2b1

## Контракты

- `orders.*`, `admin.order.*`; `delivery.*`/`admin.delivery.*` — B2.
- `t("key", { count })`; значения — текущие.
- Не менять `ORDER_STATUS_LABELS` (shared, S4-4).

## Non-goals

- Delivery/AdminDeliveryCard/DeliverySummaryCard (B2).
- W2/shared/SMS/index.

## Evidence

- Existing tests green before/after; baseline diff 81 removed/0 added;
  `check:i18n` 0; e2e 13/axe; verify.
- TDD characterization: no test-after; add key test if gap.
- PR <600; if not, NEEDS_SPLIT.
- Не трогать state/board/specs; не мержить; push или SHA.
