# Review: PR #84 — upgrade scrum-crew v0.6.1

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: reviewer` ·
> `sprint: — (Sprint 3 closed, state.sprint=null)` ·
> `task: UPGRADE-v0.6.1` ·
> `change: No spec change: инструментальный upgrade` ·
> links: [PR #84](https://github.com/seshmonke/localhand/pull/84) ·
> [.scrum/README.md](../README.md) ·
> [upgrade.md](../../.opencode/skills/scrum-crew/references/upgrade.md)

## Инкремент

- Task: UPGRADE-v0.6.1 — инструментальный upgrade, не PBI.
- PR: #84, base `041cfa0`, head `fa1dd2b`; один squash-коммит
  `chore: upgrade scrum-crew to v0.6.1`.
- Change: `No spec change: инструментальный upgrade`; поведение не
  меняется.
- Brief/report/evidence задачи: N/A для upgrade; evidence — PR body,
  CI и проверки ниже.
- Preview: N/A (код не менялся).
- Tier: T0 (docs/instrumentation); TDD/ATDD/contract/T2-гейты N/A,
  ослабления тестов/CI нет.

## Проверки

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `test "$(tr -d '\r' < .opencode/skills/scrum-crew/VERSION)" = 0.6.1` | 0 | pass; `VERSION=0.6.1` |
| `test ! -d .opencode/skills/sprint-crew` | 0 | pass; один skill-id |
| `find .opencode -maxdepth 3 -type d -iname '*crew*'` | 0 | только `scrum-crew` |
| `diff -rq <tmp> .opencode/skills/scrum-crew` | 0 | 28/28 файлов совпадают с upstream v0.6.1 |
| `diff -rq <tmp> .opencode/agents` | 1 | отличается только `scrum-reviewer.md` (проектная кастомизация) |
| reviewer customization diff vs upstream v0.6.0/v0.6.1 | — | T2-вставка (`Q1.0–Q1.6`, test-after → REQUEST_CHANGES) идентична |
| `diff -rq <tmp> <tmp>` | 0 | в 0.6.0 кастомизаций skill не было; потерь нет |
| `gh release view v0.6.1 --repo seshmonke/scrum-crew` | 0 | released, не draft/prerelease, published 2026-11-28T15:37:02Z |
| skill internal links (`references/assets/...`) | 0 | 21 уникальная ссылка, 0 missing |
| `bash scripts/motif-check.sh docs/design/motifs.md docs/design/content.md` | 0 | `OK: motif not found` |
| `bash scripts/slop-check.sh docs/design/motifs.md docs/design/content.md` | 0 | `OK: slop not found` |
| `bash scripts/motif-check.sh` без аргументов / missing file | 2 / 2 | контракт usage/missing соблюдён |
| `bash scripts/motif-check.sh docs/design/content.md docs/design/motifs.md` | **1** | `REPEAT: text 6`, `REPEAT: review 6`; обратное направление, см. P3 |
| `git diff --check 041cfa0..fa1dd2b` | 0 | clean |
| `pnpm verify` (worktree `<worktree>`, HEAD `fa1dd2b`) | 0 | shared 161, web 220, API 224 passed / 170 skipped (394); build; OpenSpec 9/9 |
| `pnpm exec openspec validate --all --strict` | 0 | 9 passed, 0 failed |
| `pnpm check:public` | 0 | 657 tracked files, no secrets/PII patterns found |
| link-check изменённых docs (`README`, `content`, `motifs`) | 0 | 14 ссылок, 0 broken |
| `git diff --name-only 041cfa0..fa1dd2b` | 0 | 10 файлов: только `.opencode/` + `docs/design/`; кода/CI/deps нет |
| CI `verify` на `fa1dd2b` | success | GitHub Actions |
| CI `review-gate` на `fa1dd2b` | failure | нет label `reviewed`; ожидаемо, не дефект PR |

## Blocking

Нет. P0/P1/P2 не найдены.

## Non-blocking

### P3 — активные `.scrum` host-файлы всё ещё называют v0.6.0

- Файлы: `.scrum/README.md:16`, `.scrum/HANDOFF.md:11,26`,
  `.scrum/state.json:10`.
- Доказательство: `VERSION=0.6.1`, но в трёх host-файлах написано
  «v0.6.0 installed/выполнен/обновлён». После merge #84 новый агент,
  читающий HANDOFF/state, увидит 0.6.0. PR #83 (main `7a6c592`) это
  тоже не поправил.
- Действие: owner SM обновить на v0.6.1 / PR #84 перед Sprint 4 или
  отдельным P3-долгом. Не блокирует: записи исторические, не выдают
  0.6.0 за следующий шаг, а PR scope — `.opencode/` + `docs/design/`.

### P3 — проектный text gate не синхронизирован с motif-check

- Файлы: `docs/quality/dod.md:10,53-54`;
  `docs/tasks/text-review.md:59,67-69`;
  `.github/pull_request_template.md:16-17`.
- Доказательство: все перечисляют только `slop-check`; `motif-check`
  есть только в skill (`assets/review.md:31-32`,
  `references/roles.md:471`). `grep -rn motif docs/quality docs/tasks
  .github` → 0 совпадений.
- Действие: до W2/W3 text review добавить motif-check в DoD/plan/
  PR-шаблон или зафиксировать owner-approved follow-up. Не блокирует:
  оперативный чек-лист ревью — `assets/review.md`, а
  `docs/tasks/text-review.md` имеет `status: plan`.

### P3 — baseline журнала мотивов пустой, evidence motif-check слабое

- Файл: `docs/design/motifs.md:13` — строка
  `2026-11-28 | baseline site copy | — | — | —`: нет ссылки на текст,
  все поля пустые; baseline по `docs/tasks/text-review.md:59,120` —
  это `docs/design/content.md`.
- Доказательство: PR body проверяет
  `motif-check.sh docs/design/motifs.md docs/design/content.md`, т.е.
  журнал как новый текст; обратное направление
  (`content.md` как новый текст) даёт exit 1 с `REPEAT: text/review`.
  Это не мотив, а общие слова заголовков, но baseline-аудит не
  выполнен.
- Действие: связать baseline-строку с реальным текстом (`content.md`)
  и прогнать проверку в штатном направлении с пометкой исключения;
  не блокирует.

## Drift check

- [x] Старых имён/путей skill нет: только исторические упоминания
  `sprint-crew` в `references/upgrade.md`, legacy-триггере `SKILL.md`
  и `.scrum`-истории; второй skill-dir отсутствует.
- [x] Skill-файлы побайтно совпадают с upstream v0.6.1; потерянных
  кастомизаций нет; reviewer T2-вставка сохранена; остальные agents —
  target.
- [x] Доки не выдают будущее за текущее: `text-review.md` —
  `status: plan`; `motifs.md` — живой журнал `status: active`;
  обещаний тестов без ссылки нет.
- [x] Спека и код не разошлись: skill v0.6.1 = upstream v0.6.1;
  `docs/design/*` ссылки резолвятся; битых ссылок 0.
- [x] Copywriter/slop: `slop-check` на `motifs.md`/`content.md` — 0;
  Copywriter review не-автора для шаблонного процессного дока не
  запрошен; если owner считает его публичным текстом — это P3, не
  блокер.
- [x] Метрики/размеры/API не копировались; кода/CI/зависимостей нет.
- [x] Host-doc обновлён (`docs/design/motifs.md`, ссылки из
  `README.md`/`content.md`); `No doc change` не требуется.
- [ ] Trace status: task/change/PR/review/evidence есть, но
  `.scrum`-версия всё ещё 0.6.0 — см. P3-1.

## Merge prerequisites

- Main ушёл вперёд: `041cfa0` → `7a6c592` (`#83` text review W1).
  Перед merge — rebase на main и повторный `pnpm verify` /
  `openspec validate --all --strict` (merge train).
- После APPROVE добавить label `reviewed`; без него `review-gate`
  остаётся красным.
- Squash-merge; откат — revert squash-коммита. Не использовать
  `git clean -fdx`.

## Вердикт

**APPROVE** — P0/P1/P2 нет; три P3 не блокируют. Upgrade соответствует
upstream v0.6.1, кастомизация reviewer сохранена, ссылки и проверки
зелёные; scope — только `.opencode/` + `docs/design/`.

## Риск-итог

Функциональный риск низкий: docs/instrumentation-only, +186/−16,
кода/CI/зависимостей нет; `pnpm verify` 0 (shared 161, web 220,
API 224+170 skipped; OpenSpec 9/9), `check:public` 657/0,
`git diff --check` 0, секретов/PII нет. Остаточный риск —
навигационный: версия 0.6.0 в активных `.scrum`-файлах и несшитый
motif-check в проектном text gate; устраняется P3-долгами.

---

## Re-review 2c2a181 (2026-11-28)

- Head: `2c2a181`; base после merge main: `7a6c592` (merge-коммит
  `477b939`); diff `7a6c592..2c2a181` — 17 файлов: `.opencode/`,
  `docs/design`, `docs/quality`, `docs/tasks`, `.scrum/README|HANDOFF|
  state`, `AGENTS.md`, `.github/pull_request_template.md`; кода/CI/deps
  нет.
- `VERSION=0.6.1`; skill 28/28 файлов = upstream v0.6.1; agents:
  только `scrum-reviewer` (T2-вставка идентична); skill links 0 missing.
- `pnpm verify` — 0 (shared 161, web 220, API 224 passed / 170 skipped;
  build; OpenSpec 9/9; check:public 671 tracked, 0 secrets/PII).
- `git diff --check 7a6c592..2c2a181` — 0; docs links (14 файлов) — 0
  реальных broken; 3 placeholder-ссылки `NN`/`<id>`/`…` в
  `assets/review.md` — шаблон, не новые.
- `motif-check.sh docs/design/motifs.md docs/design/content.md` — 0;
  `slop-check.sh` — 0; обратное направление
  (`content.md` как новый текст) — 1 (`REPEAT: text/review`), это
  зафиксировано как baseline-исключение в `docs/design/motifs.md:13,23-25`.
- CI `verify` на `2c2a181` — success; `review-gate` — failure, нет
  label `reviewed` (ожидаемо).

### P3-1 — закрыт

`.scrum/README.md:16`, `.scrum/HANDOFF.md:11,26`,
`.scrum/state.json:10` — v0.6.1 / PR #84; `updated_at` сдвинут.
Остаётся историческая ссылка `docs/tasks/text-review.md:11`
(«scrum-crew v0.6.0» как источник плана) — это provenance, не текущий
статус; при желании пометить исторической.

### P3-2 — закрыт частично (P3 остаётся)

Обновлены T0-строка `docs/quality/dod.md:10`, PR-шаблон,
`AGENTS.md:113`, `docs/design/content.md:56`, gate/AC/метрики
`docs/tasks/text-review.md:68,87,105-106`. Не обновлены дубли:
`docs/quality/dod.md:54-55` (increment DoD — только `slop-check`),
`docs/tasks/text-review.md:18,59,122`, `docs/tasks/backlog.md:41`.
Итог: T0 требует motif-check, а общий increment-DoD/T1–T2 — нет;
это противоречие в каноническом DoD. Действие: добавить
`motif-check` в строку 54-55 и в дубли/ссылку на единый gate; P3 не
блокирует merge, т.к. оперативный чек-лист `assets/review.md` уже
содержит motif-check.

### P3-3 — закрыт, остаётся wording nit

Baseline-строка `docs/design/motifs.md:13` связана с
`docs/design/content.md`; исключение зафиксировано в
`docs/design/motifs.md:23-25`; `motif-check` на content/motifs — 0.
Nit: в note `content.md` назван «codex», хотя codex — это
`references/copywriting.md`; заменить на «voice/glossary doc», чтобы
исключение не читалось как исключение для codex.

### Финальный вердикт re-review

**APPROVE** — P0/P1/P2 нет. P3-1 и P3-3 закрыты; P3-2 закрыт не
полностью (остался P3 в `docs/quality/dod.md:54-55` и дублях), но
P3 не блокирует. Merge prerequisites: добавить label `reviewed`,
squash-merge; после merge — повторный `verify` по AGENTS. Review-
артефакт обновлён; в PR diff его нет — добавить при merge, если
trace требует durable artifact в репозитории.
