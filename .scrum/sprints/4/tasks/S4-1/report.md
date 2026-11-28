# Report: Task S4-1b — i18n gate

> **Context:** `status: ready-for-re-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-1b` ·
> `change: No spec change: i18n refactor` ·
> links: [brief](brief.md) · [handoff](handoff.md) ·
> [evidence B](evidence/b/) · [PR #88](https://github.com/seshmonke/localhand/pull/88) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md)

## Итог

- Ветка `task/S4-1b-i18n-gate`, PR #88; fix для REQUEST_CHANGES.
- Scanner/gate: roots web/api/shared/ui/i18n (каталог исключён),
  fail-closed при потере project config/root/sourceFile, exact allowlist
  `file+kind+text`, baseline 752/826, `--update-baseline` guard +
  `--init-baseline`.
- Code+tests: scanner 418 + tests 138 + fixtures 44 = **600**;
  baseline/allowlist — данные. Verify 0.
- Board/status PR #88 обновит SM; в этой ветке state/board не менялись.

## P2 — закрыто

| P2 | Исправление | Evidence |
|---|---|---|
| Fail-open | `existsSync` для всех `config.projects`; сверка загруженных projects; `sourceFile` null → throw; scanRoot без production files → throw | [fail-open probes](evidence/b/fail-open-probes.txt) |
| Coverage | failure-путь перенесён в B: `newViolations`, baseline init/update/prune/guard, missing/dead, missing baseline; **93.54 line / 84.02 branch / 84.38 funcs**, порог 80/80 в `pnpm test` | [coverage](evidence/b/coverage.txt) |
| B RED | новый 8-test suite: RED — module absent, затем GREEN 8/8 | [RED](evidence/b/red-scanner-test.txt), [GREEN](evidence/b/green-scanner-test.txt) |

## P2 transferred — закрыто

- `validateAllowlist` требует непустые `texts` и `kinds` для file-entry;
  `isAllowed` не разрешает file-wide; тест на отказ kind-only/text-only.
- `indexHtmlFindings` удаляет allowed texts только при `kinds` с
  `html-text`; тест в suite.
- Текущий allowlist — exact data; новых broad entries нет.

## P3 — закрыто/зафиксировано

- `--update-baseline` без baseline → exit 1; создание только
  `--init-baseline`; повторный init при существующем → exit 1.
- `localeCompare` заменён на code-point `compareText`; baseline hash
  стабилен `c2ea1730…a056` (порядок baseline изменился).
- `report`/`handoff` counts/status/PR синхронизированы; evidence без
  trailing whitespace (`git diff --check` чист).
- Known limitations (не блок B): type-only строки считаются runtime;
  `<Trans i18nKey>`/алиасы не покрыты; dynamic `t(key)` — warn. S4-2/S4-4
  зафиксируют контракт/тест.
- Unstable TS API: `typescript` запинен существующим lockfile; при
  обновлении TS перепроверить scanner.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | web 221, shared 161, API 224/170 skipped, i18n 4/4, scanner 8/8, coverage 93.54, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 125 production / 85 test files; 752/826, 35 allowlisted |
| fail-open probes | 1 | missing web/ui tsconfig → exit 1; baseline missing update → 1; init → 0/1 |
| `pnpm check:public` | 0 | 710 tracked files |
| `git diff --check` | 0 | без trailing whitespace |

Baseline hash `c2ea173092ad2ce4469b3113121f883280733d7904992e6447ee0d7ac525a056`;
reproducible update ([evidence](evidence/b/baseline-reproducible.txt)).

## Trace

- S4-1a merged `05ad63b`; S4-1b (эта ветка); S4-1c после B —
  regression/coverage/probes, tests only.
- W1/W2/specs/state/board не тронуты; baseline — текущие строки.

## Блокеры

- Нет.
