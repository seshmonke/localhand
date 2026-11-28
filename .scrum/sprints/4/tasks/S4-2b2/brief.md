# Brief: S4-2b2 — delivery UI to i18n catalog

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-2b2` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [S4-2 brief](../S4-2/brief.md) ·
> [text review](../../../../../docs/tasks/text-review.md)

## Objective

Delivery UI W1-строки → `packages/i18n/src/resources/ru.ts`:
`AdminDeliveryCard` 55, `DeliverySummaryCard` 23 findings. Значения не
меняются; поведение/статусы/authz не меняются; baseline 502 → 424.

## AC

- [ ] Все B2 production-строки в `ru.ts`; в B2-файлах нет кириллицы.
- [ ] Ключи `admin.delivery.*`, `delivery.*`; `DeliverySummaryCard` —
  общий `delivery.*` namespace (Architect decision в S4-2 brief).
  Переиспользуй `common.*`/`order.*`, где уместно.
- [ ] Значения ровно как в main (copy PR #83); тесты/e2e 13/axe 72/0.
- [ ] `pnpm verify` 0; `check:i18n` 0; baseline −78/0 added, deadKeys 0.
- [ ] No shared labels/SMS/index/W2; no behavior changes.

## Tier/change

T1, `No spec change: i18n refactor`; ADR 0006.

## owns

- `apps/web/src/components/admin/AdminDeliveryCard.tsx` (+ test)
- `apps/web/src/components/orders/DeliverySummaryCard.tsx` (+ test)
- e2e locators, если keys/values меняют селекторы
- `packages/i18n/src/resources/ru.ts`
- `scripts/i18n-baseline.json` (prune B2)
- report/handoff/evidence S4-2b2

## Контракты

- `admin.delivery.*` — seller controls/events.
- `delivery.*` — shared buyer/seller snapshot card.
- `t("key", { count })`; значения — текущие.
- Не менять `DELIVERY_STATUS_LABELS`/shared labels (S4-4).

## Non-goals

- W2/shared/SMS/index; B1 orders (already merged).
- Copy changes/behavior.

## Evidence

- Existing tests before/after; baseline 78 removed/0 added; check:i18n 0;
  e2e 13/axe; verify; bundle delta.
- PR <600; if not NEEDS_SPLIT.
- Не трогать state/board/specs; не мержить; push или SHA.
