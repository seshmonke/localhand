# Review: PR #85 — Sprint 4 planning (i18n runtime copy)

> **Context:** `status: approved` · `updated: 2026-11-28` · `owner: reviewer (не автор)` ·
> `sprint: 4` · `task: S4-PLAN` · `change: No spec change: i18n refactor` ·
> `base: main@64f1e38` · `head: plan/sprint-4-i18n@7467d81` ·
> links: [PR #85](https://github.com/seshmonke/localhand/pull/85) ·
> [sprint](../sprints/4/sprint.md) · [S4-1 brief](../sprints/4/tasks/S4-1/brief.md) ·
> [ADR 0006](../../docs/stack/adr/0006-i18n.md) · [DoD](../../docs/quality/dod.md)
> Ссылки на sprint/brief/ADR указывают на head PR #85; в `main` они появятся после merge.

## Инкремент

- Task: `S4-PLAN` — планирование Sprint 4, не PBI-код.
- PR: #85, base `64f1e38`, head `7467d81` (2 commits: `be3bc64` план,
  `7467d81` фикс review-drift).
- Diff: 16 файлов, +439/−64; только `docs/` и `.scrum/` — кода, CI,
  зависимостей, lockfile нет.
- Change: `No spec change: i18n refactor, ru-only, no behavior change`;
  OpenSpec не менялся, 9/9.
- Tier: T0 (планирование/доки); TDD/ATDD/e2e для этого PR — N/A,
  ослабления тестов/CI нет.
- Preview: N/A (код не менялся).

## Вердикт

**APPROVE.** Первый раунд на `be3bc64` — REQUEST_CHANGES с 3 P2; в
`7467d81` все три закрыты. P0/P1/P2 не найдены. Остались P3 follow-up,
не блокирующие старт Sprint 4.

## Проверки (команды и exit)

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` (worktree `<worktree>`, HEAD `7467d81`) | 0 | typecheck, lint, format, check:public, tests, build, OpenSpec 9/9 |
| `pnpm check:public` (в составе verify и отдельно) | 0 | 679 tracked files, no secrets/PII patterns |
| `pnpm --filter @localhand/web test` | 0 | 25 files, 220/220 tests |
| `pnpm exec openspec validate --all --strict` (в составе verify) | 0 | 9 passed, 0 failed |
| `git diff --check 64f1e38..7467d81` | 0 | clean |
| `slop-check` по plan-файлам (`sprint`, `S4-1/brief`, `04-i18n`, `ADR 0006`, `README`) | 0 | `OK: slop not found` |
| `slop-check docs/tasks/INDEX.md` | **1** | канцелярит (строка 7) и HTML-комментарий (строка 19) — были до PR; не регрессия |
| `slop-check docs/tasks/backlog.md` | **1** | слоп-фраза (строка 107) — было до PR; не регрессия |
| link-check изменённых docs (локальные ссылки) | — | 1 false positive: закомментированный шаблон `01-….md` (`INDEX.md:19`); активных битых 0 |
| `git diff --name-only 64f1e38..7467d81 \| grep -E '^(apps\|packages\|scripts\|\.github\|infra)/'` | grep 1 (нет совпадений) | кода/CI/deps нет |
| `gh pr checks 85` | verify pass; review-gate fail | нет label `reviewed`; ожидаемо до ревью |
| `gh pr view 85` | — | OPEN, 16 файлов, +439/−64, 2 commits |

## Закрытие P2 первого раунда

1. **`index.html` scope — закрыт.** Static meta/title — allowlist, не
   миграция. Синхронизированы:
   - Goal `docs/tasks/04-i18n.md:15-17` и `.scrum/sprints/4/sprint.md:11-13`;
   - S4-1 AC/owns `.scrum/sprints/4/tasks/S4-1/brief.md:21,39`;
   - S4-3 `docs/tasks/04-i18n.md:46-47`; S4-4 `:61`;
   - ADR `docs/stack/adr/0006-i18n.md:26-28`;
   - gate `.scrum/sprints/4/sprint.md:42-43`; 100% AC однозначен.
2. **Drift Q1.1/Q1.2, S3-3/S3-4, TDD exception — закрыт по current-докам.**
   Q1.1/Q1.2 — Sprint 5, Q1.3/Q1.4 — Sprint 6, Q1.5/Q1.6 — Sprint 7:
   `docs/tasks/quality-wave-1.md:4-5,43-48`, `docs/tasks/backlog.md:44-59`,
   `docs/tasks/INDEX.md:39,48-49`, `docs/tasks/milestones.md:82-84`.
   S3-3/S3-4 — Sprint 5: `.scrum/board.json:69,78`,
   `docs/tasks/INDEX.md:34-35`, `.scrum/HANDOFF.md:26-29`.
   TDD exception: deadline Q1.1/Sprint 5 —
   `docs/tasks/backlog.md:111-116`, `.scrum/events.jsonl:128`; решение о
   переносе `08/09/Q1` — `.scrum/events.jsonl:127`.
3. **W2 scope/copy review — закрыт.** 215 runtime + 3 `index.html`
   allowlist (218 в аудите): `docs/tasks/04-i18n.md:46-47`,
   `.scrum/reviews/text-site-audit.md:27`. Copywriter review W2 — явный
   шаг с owner/evidence, не «уже сделан»: `docs/tasks/04-i18n.md:48`.
   Behavior/owner/legal вынесены в P2 backlog:
   `docs/tasks/backlog.md:120-123`; W1 review связан:
   `docs/tasks/04-i18n.md:37-38`, `.scrum/reviews/83-text-review-w1.md`.

## P3 follow-up (не блокируют)

1. **Битая markdown-таблица PBI.** `.scrum/sprints/4/sprint.md:22-25`:
   строка Tier вставлена между S4-3 и S4-4; S4-4/S4-5 выпали из таблицы.
   Действие: вынести Tier после таблицы или добавить колонку Tier.
2. **Волны методологии не сдвинуты.** `docs/quality/methodologies.md:168,178-180`
   всё ещё «Волна 1 — Sprint 3–6», «Волна 2 — Sprint 5–6»; Q1.5/Q1.6 —
   Sprint 7 (`docs/tasks/quality-wave-1.md:4-5,47-48`). Событие
   `.scrum/events.jsonl:127` не упоминает Q1.3–Q1.6. Действие: обновить
   окна волн и добавить Q1.3–Q1.6 в owner-decision (или отдельным событием).
3. **Исторический Sprint 3 переписан в current-доках.** `docs/tasks/INDEX.md:34-35`
   и `docs/tasks/milestones.md:74-75` теперь говорят «Sprint 5» для
   закрытия Sprint 3; `docs/tasks/03-money-path.md:7,120`,
   `.scrum/sprints/3/review.md:57-58`, `.scrum/sprints/3/retro.md:37`,
   `.scrum/sprints/3/sprint.md:21-22` — «Sprint 4». Действие: оставить
   исторический факт Sprint 4 и добавить датированный re-deferral в
   Sprint 4 milestone (или пометить исторические файлы ссылкой).
4. **README-снимок отстал от Goal.** `.scrum/README.md:13-14` — старый
   Goal без static `index.html` allowlist и без copy review evidence;
   источник — `.scrum/sprints/4/sprint.md:11-13`,
   `docs/tasks/04-i18n.md:15-17`. Действие: обновить snapshot.
5. **State/board freshness.** `.scrum/state.json:7,10` — `updated_at`
   16:30 и notes без Q1.3–Q1.6; `.scrum/board.json:3` — 16:30, хотя
   S3-3/S3-4 notes изменены; events — 16:35. Действие: обновить
   timestamp/notes.
6. **405 vs 402.** `docs/tasks/04-i18n.md:96` — «Миграция 405
   фрагментов»; после allowlist `index.html` мигрируется 402
   (187 W1 + 215 W2). Действие: «405 проанализировано, 402 мигрировано,
   3 allowlist» или убрать 405 из риска.
7. **S4-1 evidence про «new test string».** `.scrum/sprints/4/tasks/S4-1/brief.md:74`
   vs scanner ignore tests `:51-52`; fixture — `scripts/fixtures/i18n/**`
   `:37-38`. Действие: «new production-like fixture file fails» + команда.
8. **S4-3 gate без Copywriter review.** `docs/tasks/04-i18n.md:53` —
   gate «verify, e2e, axe, slop/motif»; шаг Copywriter review есть в
   `:48`, но не в gate. Действие: добавить Copywriter review в gate/evidence.
9. **`axe 72/0` без определения.** `docs/tasks/04-i18n.md:40,53,69`,
   `.scrum/sprints/4/sprint.md:41`; текущее evidence — axe 24 скана
   (`.scrum/sprints/3/review.md:49`). Действие: определить 72
   (страницы/вьюпорты/темы) и команду.
10. **ADR rollback coarse.** `docs/stack/adr/0006-i18n.md:46` — revert
    migration PR + ADR; в sprint plan rollback шире
    (`.scrum/sprints/4/sprint.md:45-48`, включает S4-1 deps).
    Действие: синхронизировать.
11. **S4-1 owns `apps/api/package.json`, а API `t` — S4-4.**
    `.scrum/sprints/4/tasks/S4-1/brief.md:35-36` vs
    `docs/tasks/04-i18n.md:31`. Действие: уточнить, нужна ли зависимость
    API в S4-1, или перенести в S4-4.

## Drift-проверка

- **Current Sprint 4/5 drift:** закрыт. 08/09/Q1.1/Q1.2 — Sprint 5,
  Q1.3–Q1.6 — 6/7; board/state/HANDOFF/INDEX/quality-wave/backlog/milestones
  согласованы; TDD exception deadline — Q1.1/Sprint 5.
- **Historical drift:** P3, см. follow-up 3 — Sprint 3 workspace и
  `03-money-path.md` хранят Sprint 4; current-доки переписали close на
  Sprint 5. Нужен датированный re-deferral, а не подмена истории.
- **Future as current:** W2 «уже в каталоге» убрано; теперь «review в
  S4-3» с owner/evidence (`04-i18n.md:48`). W1 review связан.
- **Promise without link:** S4-1 «new test string fails» — P3 follow-up 7;
  axe 72/0 — P3 follow-up 9.
- **`No spec change`:** причина есть (`ADR 0006:4`, `04-i18n.md:29`),
  для i18n-рефактора достаточно; W2 behavior/owner/legal вынесены из T0.
- **Trace/status:** BUILDING, sprint 4, cycle 1, S4-1 in_progress, WIP 1,
  lock/events; S4-1..S4-5 в плане/board, Tier записан. Планировочный PR
  не PBI, поэтому report/evidence у S4-1 ещё нет — ожидаемо.
- **Links:** sprint/brief/README/ADR/board/INDEX/quality-wave/backlog
  резолвятся; единственный link-check hit — закомментированный шаблон
  `INDEX.md:19`, не активная ссылка.

## Риск-итог

- **Технический: низкий.** Диф — только docs/state; `pnpm verify` 0;
  OpenSpec 9/9; check:public 0; код/CI/deps не тронуты; секретов/ПДн нет.
- **План: средний.** 402 фрагмента (187 W1 + 215 W2) и тесты/ревью в
  6 циклах; W2 215 в двух циклах; carry-over W2 → Sprint 5 и split по
  поверхностям описаны.
- **Процесс: низкий/средний.** TDD exception deadline и owner decisions
  зафиксированы; остались P3 historical/methodology/state freshness.
- **Perf: средний.** i18next/react-i18next bundle delta; S4-5 gate —
  бюджет ADR 0004 (≤ +10% / ≤ +20 KiB gzip), но нужен явный замер.
- **A11y/состояния: низкий.** UI не меняется; axe 72/0 требует
  определения (P3 9); error/empty/loading покрываются text-review/e2e.
- **Итог:** APPROVE. P3 follow-up 1–11 закрыть до Sprint 5/close;
  старт S4-1 не блокируется.
