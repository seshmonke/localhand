# Report: Task S4-1a — i18n package/init

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-1a` · `change: No spec change: i18n refactor` ·
> links: [brief](brief.md) ·
> [handoff](handoff.md) · [evidence](evidence/a/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md)

## Итог

- Ветка `task/S4-1a-i18n-package` от `main@1feb949`.
- `@localhand/i18n`: typed flat `ru`, `t`, plural, init `ru`;
  `i18next@27.2.10`.
- Web: `react-i18next@18.0.3`, init в `main.tsx`/`test setup`; API не
  подключён (S4-4).
- Code+tests ≈ **115** строк; scanner/baseline/verify-gate в этом PR нет.
- `pnpm verify` exit 0: i18n 4/4, web 221/221, shared 161/161,
  API 224/170 skipped, OpenSpec 9/9.

## AC

| AC | Проверка | Ссылка |
|---|---|---|
| typed `ru`, `t`, plural 1/2/5, init `ru` | i18n unit | [green](evidence/a/green-i18n-test.txt) |
| unknown key отклоняется типом | package typecheck | `packages/i18n/src/i18n.test.ts` |
| web init через react-i18next | web unit | `apps/web/src/i18n.test.ts` |
| RED/GREEN | 4/4 | [red](evidence/a/red-i18n-test.txt), [green](evidence/a/green-i18n-test.txt) |
| verify | exit 0 | [verify](evidence/a/verify.txt) |

## Trace S4-1 split

- S4-1a (эта ветка): package/init, ≈115.
- S4-1b от A: scanner/gate/baseline/allowlist/fixtures, ≈485.
- S4-1c от B: regression suite/coverage/probes, ≈249.
- W1/W2/specs/state/board не тронуты; `ru.ts` — 6 foundation-ключей.

## Блокеры

- Нет.
