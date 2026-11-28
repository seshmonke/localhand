# Handoff: Task S4-1a — i18n package/init

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-1a` ·
> links: [report](report.md) · [evidence](evidence/a/)

## Сделано

- `packages/i18n` (`@localhand/i18n`): package/tsconfig, `resources/ru.ts`,
  `types.ts` (`CustomTypeOptions`), `index.ts` (`t`, `initI18n`,
  `createI18nInstance`, plural `_one/_few/_many/_other`).
- Web: `apps/web/src/i18n.ts`, импорт в `main.tsx`/`test setup`;
  Vite dev-alias на source каталога.
- Root: i18n собирается перед typecheck/test/dev; версии
  `i18next`/`react-i18next` в `docs/stack/versions.md`.

## Проверки

- `pnpm verify` exit 0 ([evidence](evidence/a/verify.txt)); i18n 4/4,
  web 221/221.

## Следующий шаг

- S4-1b от этой ветки: scanner/gate/baseline/allowlist/fixtures, root
  `check:i18n` в `verify`.
- S4-1c после B: regression suite/coverage ≥80, probes.
