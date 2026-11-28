# Sprint 4: i18n runtime copy

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 4` · `task: —` · `change: No spec change: i18n refactor` ·
> links: [plan](../../../docs/tasks/04-i18n.md) ·
> [ADR 0006](../../../docs/stack/adr/0006-i18n.md) ·
> [review](review.md) · [retro](retro.md)

## Goal

Все runtime-тексты сайта, SMS и shared-лейблы в одном typed
i18next-каталоге; 100% coverage gate в `pnpm verify`; W1/W2 copy прошли
Copywriter review.

## PBI и trace

| Task | Change | Owner | PR | Status |
|---|---|---|---|---|
| S4-1 i18n foundation | No spec change: i18n refactor | scrum-worker | — | in_progress |
| S4-2 W1 migration | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-3 W2 migration + copy | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-4 shared/SMS/meta + 100% | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-5 close | — | SM | — | pending |

## Циклы

1. Planning + S4-1 foundation.
2. S4-1 finish + baseline/gate.
3. S4-2 W1 migration.
4. S4-3 W2 migration (1).
5. S4-3 W2 (2) + copy.
6. S4-4 100% + close.

## Gates

- `No spec change: i18n refactor, ru-only, no behavior change`.
- `pnpm verify` + `pnpm check:i18n`; OpenSpec 9/9.
- ADR 0006; W1/W2 Copywriter + slop/motif.
- E2E 13, axe 320/1440, preview LCP — на close.
- 100%: 0 кириллицы вне `packages/i18n/resources/ru.ts` кроме allowlist.

## Non-goals

- `08`/`09`/Q1.1/Q1.2 — Sprint 5.
- Docs/legal/архивы, вторая локаль, switcher.
- Live YooKassa/CDEK, деплой/SMS — owner-гейты.
