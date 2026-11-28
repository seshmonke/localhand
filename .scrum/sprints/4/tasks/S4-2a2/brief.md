# Brief: S4-2a2 — payment/order to i18n catalog

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-2a2` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [S4-2 brief](../S4-2/brief.md) ·
> [report](report.md)

Split of S4-2: payment/order W1 strings → `packages/i18n/src/resources/ru.ts`;
values unchanged from PR #83. Key contract adds `payment.*`/`admin.payment.*`
per Architect decision in S4-2 brief. Baseline 685→583. A1 keys/allowlist
preserved. W2/shared labels/SMS not touched.
