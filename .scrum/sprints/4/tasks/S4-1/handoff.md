# Handoff: Task S4-1b — i18n gate

> **Context:** `status: ready-for-re-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-1b` ·
> links: [report](report.md) · [evidence B](evidence/b/) ·
> [PR #88](https://github.com/seshmonke/localhand/pull/88)

## Сделано

- Scanner fail-closed: все `config.projects` существуют и загружены;
  sourceFile null и scanRoot без production files → throw; baseline не
  маскирует пропажу root.
- Exact allowlist `file+kind+text`; `validateAllowlist` требует непустые
  texts+kinds; `isAllowed` не file-wide; `indexHtmlFindings` учитывает
  kind `html-text`.
- Baseline init/update: `--update-baseline` без baseline fail;
  `--init-baseline` только при отсутствии; guard на new violation;
  code-point sort, hash стабилен.
- Failure-path tests перенесены в B; coverage 93.54/84.02/84.38, порог
  80/80 в `pnpm test`; RED 8-test suite в evidence.
- Code+tests 600; verify 0.

## Осталось / следующий шаг

- Merge PR #88; S4-1c от B — regression/probes/tests only.
- S4-2: W1 migration, `pnpm check:i18n:update` (baseline уменьшается).
- S4-4: shared labels/SMS; dynamic `t()`/`<Trans>`/aliases — зафиксировать
  контракт и тесты.
- SM обновляет `.scrum/board.json`/status/PR trace; worker их не трогал.

## Грабли

- TS 7 native sync API; scanner в `scripts/check-i18n.mjs`.
- Baseline/allowlist — данные; file-wide entries запрещены валидатором.
- `pnpm dev`/`dev:web`: Vite alias читает `ru.ts` из source; build — dist.
- `escapeValue:false` — React; API/SMS не вставляют untrusted в HTML.
