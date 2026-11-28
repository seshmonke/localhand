# Sprint 4: i18n runtime copy

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 4` · `task: —` · `change: No spec change: i18n refactor` ·
> links: [plan](../../../docs/tasks/04-i18n.md) ·
> [ADR 0006](../../../docs/stack/adr/0006-i18n.md) ·
> [review](review.md) · [retro](retro.md)

## Goal

Все runtime JS/API/SMS-тексты и shared-лейблы в одном typed
i18next-каталоге; 100% gate в `pnpm verify`; static `index.html` meta —
allowlist; W1/W2 copy review с evidence.

## PBI и trace

| Task | Change | Owner | PR | Status |
|---|---|---|---|---|
| S4-1 i18n foundation | No spec change: i18n refactor | scrum-worker | — | in_progress |
| S4-2 W1 migration | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-3 W2 migration + copy | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-4 shared/SMS/meta + 100% | No spec change: i18n refactor | scrum-worker | — | pending |
| S4-5 close | — | SM | — | pending |

Tier: S4-1 T1, S4-2 T1, S4-3 T1+T0 copy, S4-4 T1, S4-5 T0.

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
- E2E 13, axe 0 serious/critical 320/1440 light/dark, preview LCP <2500, bundle delta в бюджете.
- 100%: 0 кириллицы вне `packages/i18n/resources/ru.ts`; allowlist —
  `index.html` meta, tests, seed/provider payload.

## Rollback

Revert PR S4-1…S4-5; зависимости/каталог уходят, строки возвращаются
из git. Baseline/ADR — часть revert.

## Non-goals

- `08`/`09`/Q1.1/Q1.2 — Sprint 5.
- Docs/legal/архивы, вторая локаль, switcher.
- Live YooKassa/CDEK, production deploy/live SMS — owner-гейты.
