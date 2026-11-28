# Handoff: Task S4-1b — i18n gate

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-1b` ·
> links: [report](report.md) · [evidence B](evidence/b/)

## Сделано

- `scripts/check-i18n.mjs`: TypeScript 7 native AST; roots
  `apps/web/src`, `apps/api/src`, `packages/shared/src`,
  `packages/ui/src`, `packages/i18n/src`; каталог исключён;
  missing/dead keys; `--update-baseline` guard.
- `scripts/i18n-allowlist.json`: exact file+kind+text (seed/fake-provider/
  CDEK/index), file-wide запрещён.
- `scripts/i18n-baseline.json`: 752 findings / 826 occurrences.
- Root: `check:i18n`, `check:i18n:update`; `check:i18n` в `verify`.
- Core tests: 6/6 (scanFile, ui/i18n roots, allowlist, index, key gate).

## Проверки

- `pnpm verify` exit 0 ([evidence](evidence/b/verify.txt)); scanner 6/6,
  baseline hash воспроизводим.

## Следующий шаг

- S4-1c от этой ветки: regression suite/coverage ≥80, probes
  new violation / fake-provider / baseline guard, evidence C.
