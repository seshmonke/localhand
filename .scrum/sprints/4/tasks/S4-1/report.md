# Report: Task S4-1b — i18n gate

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-1b` · `change: No spec change: i18n refactor` ·
> links: [brief](brief.md) · [handoff](handoff.md) ·
> [evidence A](evidence/a/) · [evidence B](evidence/b/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md)

## Итог

- Ветка `task/S4-1b-i18n-gate` от S4-1a (`5528a8f`).
- AST-сканер (`packages/ui`, `packages/i18n` без каталога), exact
  allowlist `file+kind+text`, baseline 752/826, guard на
  `--update-baseline`, `pnpm check:i18n` в `verify`.
- Path drift: `packages/i18n/src/resources/ru.ts` в scanner/ADR/
  `sprint.md`; старый путь отсутствует.
- Code+tests ≈ **574**; `pnpm verify` exit 0; baseline hash
  воспроизводим.

## AC

| AC | Проверка | Ссылка |
|---|---|---|
| scanner roots ui/i18n, каталог исключён | probe exit 1 | [roots](evidence/b/scanner-roots-probe.txt) |
| baseline + allowlist + guard | check pass; update hash | [baseline](evidence/b/baseline-reproducible.txt) |
| scanner core/allowlist/index tests | 6/6 | [green](evidence/b/green-scanner-test.txt) |
| `pnpm check:i18n` / verify | exit 0 | [verify](evidence/b/verify.txt) |

## Trace

- S4-1a `5528a8f` (package/init, 115).
- S4-1b (эта ветка): scanner/gate, ≈574.
- S4-1c от B: regression suite/coverage/probes, tests only.
- W1/W2/specs/state/board не тронуты; baseline — текущие строки.

## Блокеры

- Нет.
