# Review: PR #81 — upgrade scrum-crew v0.6.0

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: reviewer` ·
> `sprint: — (Sprint 3 closed, state.sprint=null)` ·
> `task: UPGRADE-v0.6.0` ·
> `change: No spec change: инструментальный upgrade` ·
> links: [PR #81](https://github.com/seshmonke/localhand/pull/81) ·
> [.scrum/README.md](../README.md) ·
> [upgrade.md](../../.opencode/skills/scrum-crew/references/upgrade.md)

## Инкремент

- Task: UPGRADE-v0.6.0 — инструментальный upgrade, не PBI.
- PR: #81, base `2f4ed4a`, head `924d04c`.
- Change: `No spec change: инструментальный upgrade` (поведение не меняется).
- Brief/report/evidence задачи: N/A для upgrade; миграционные артефакты —
  `.scrum/README.md`, `.scrum/sprints/3/sprint.md`,
  `.scrum/sprints/3/tasks/S3-2/`.
- Preview: N/A (код не менялся).

## Проверки round 1 (924d04c)

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | shared 161, web 220, API 394; OpenSpec 9/9 |
| `pnpm exec openspec validate --all --strict` | 0 | 9 passed, 0 failed |
| `git diff --check 2f4ed4a..HEAD` | **2** | 21 hit trailing whitespace в `S3-2-close-verify.txt` |
| `test "$(tr -d '\r' < .opencode/skills/scrum-crew/VERSION)" = 0.6.0` | 0 | pass |
| `test ! -d .opencode/skills/sprint-crew` | 0 | pass; один skill-id |
| skill internal links (`references|assets/*.md`) | 0 | 0 missing |
| link-check изменённых `.scrum`/`docs/tasks` документов | 0 | 0 broken; битые пути ниже — вне markdown-ссылок |
| `bash scripts/slop-check.sh` на slop/clean/без аргументов | 1/0/2 | соответствует контракту |
| CI `verify` / `review-gate` | pass / fail | review-gate ждёт label `reviewed`, это не дефект PR |

## Blocking round 1 (закрыто в aa7452d)

### P2 — `git diff --check` красный, хотя PR заявляет clean

- Файл: `.scrum/sprints/3/tasks/S3-2/evidence/S3-2-close-verify.txt:23`
  и ещё 20 строк (25, 26, 28, 31, 33, 35, 40, 43, 47, 49, 50, 52, 53,
  58, 62, 64, 69, 72, 96, 97).
- Доказательство: `git diff --check 2f4ed4a..HEAD` → exit 2; 42 строки
  вывода. В PR body: «`git diff --check` clean» — это неверно для
  диапазона PR.
- Действие: убрать trailing whitespace из скопированного лога (или
  заменить копию ссылкой на канонический
  `.scrum/sprints/3/evidence/S3-2-verify-after-76.txt`); повторить
  `git diff --check 2f4ed4a..HEAD`, exit code — в PR.

### P2 — drift: v0.5.0 как «следующий шаг» при выполненном v0.6.0

- Файлы: `.scrum/HANDOFF.md:22` — «Upgrade ... до released `v0.5.0`»;
  `.scrum/state.json:10` — «Next: upgrade ... to v0.5.0»; при этом
  `.scrum/HANDOFF.md:7` уже говорит «обновлён до v0.6.0».
- Доказательство: прямое противоречие внутри изменённого файла и
  расхождение с `.scrum/README.md:15-16` («upgrade v0.6.0 выполнен»).
  Новый агент может запустить повторный upgrade.
- Действие: обновить HANDOFF и `state.json.notes` на v0.6.0 (done, PR
  #81) и следующий шаг Sprint 4; `.scrum/sprints/3/retro.md:35` —
  исторический артефакт, не переписывать.

### P2 — битые ссылки на evidence в report S3-2

- Файл: `.scrum/sprints/3/tasks/S3-2/report.md:29`.
- Доказательство: указаны `evidence/S3-2-axe-results.json` и
  `evidence/S3-2-lcp-preview.json`; `test -f` — оба missing. Реальные
  файлы: `S3-2-3.10-axe-results.json`, `S3-2-3.10-lcp-preview.json`
  (sha256 совпадают с каноном `.scrum/sprints/3/evidence/`).
- Действие: исправить имена в таблице AC или сослаться на
  `evidence/README.md`; проверить `test -f` для каждой ссылки.

## Non-blocking round 1

### P2 — старые пути в активных docs/quality

- `docs/quality/methodologies.md:6` — `.opencode/skills/sprint-crew/references/roles.md`;
- `docs/quality/audits/README.md:24` — `.opencode/skills/sprint-crew/assets/audit.md`.
- Оба пути удалены этим PR. `references/upgrade.md` §5.4 прямо говорит:
  ссылки в `docs/` — отдельная задача/PR, не менять в upgrade. Действие:
  завести follow-up (owner SM) и обновить на `scrum-crew` до следующего
  аудита/Sprint 4; либо исправить двумя строками, если owner расширит
  скоуп.

### P3 — подпись ссылки в evidence README не совпадает с href

- `.scrum/sprints/3/tasks/S3-2/evidence/README.md:7`:
  `[../../evidence/](../../../evidence/)`. Href резолвится, подпись
  вводит в заблуждение.
- Действие: подписать `../../../evidence/` или `evidence/` канона.

### P3 — trace не содержит ссылок на brief/review-артефакты

- `.scrum/sprints/3/sprint.md:17-20`: колонки Review/Evidence содержат
  значения, но нет ссылки на review-артефакт; `.scrum/reviews/` для
  S3-1/S3-2 не создан. Шаблон `assets/sprint.md` ожидает
  `[brief]`/`[review](../../reviews/NN-NN.1.md)`.
- Для закрытого спринта допустимо сослаться на
  `.scrum/sprints/3/review.md` как на sprint-level review; для будущих
  задач review-артефакт обязателен.

### P3 — устаревшее окно активации в reconstructed brief

- `.scrum/sprints/3/tasks/S3-2/brief.md:75`: «owner-исключения до
  Q1.3/Q1.4»; матрица проекта — Q1.0–Q1.6
  (`docs/quality/methodologies.md:168-176`), reviewer insert — Q1.0–Q1.6.
- Действие: привести к Q1.0–Q1.6 или пометить brief как исторический
  snapshot.

### P3 — контекстные шапки у изменённых доков

- `.scrum/HANDOFF.md` изменён, но без `> **Context:**`;
  `docs/tasks/03-money-path.md` тоже изменён без шапки. Migration 9.1
  п.7 просит шапки новым/изменяемым докам; исторические docs/tasks можно
  оставить, но HANDOFF — текущая точка входа.
- Действие: добавить шапку или `No doc change`-эквивалент для
  исторического дока.

## Drift check round 1 (924d04c)

- [x] Старый skill-id `sprint-crew` удалён; `VERSION=0.6.0`; один
  skill-id; agents ссылаются на `scrum-crew`; `AGENTS.md` обновлён.
- [x] `assets/task.md` — deprecated stub; `brief/report/context`
  обязательные файлы есть; Copywriter/copywriting/slop-check на месте.
- [x] Reviewer T2-вставка сохранена (owner-исключения Q1.0–Q1.6,
  test-after → REQUEST_CHANGES); остальные agents совпадают с upstream
  v0.6.0; backup `.opencode` вне репо (`mktemp`, не в git).
- [x] `docs/tasks` не перемещены; `openspec` архивы не переписаны;
  только `.opencode/`, `.scrum/`, `AGENTS.md`, ссылки `docs/tasks`.
- [x] Секреты/PII/absolute paths в добавленных файлах не найдены;
  `check:public` — 651 tracked files, 0 patterns.
- [x] Старые пути в `docs/quality` и v0.5.0 в HANDOFF/state — закрыто в `aa7452d` (v0.5.0 остался только в историческом retro и upgrade.md).
- [x] `git diff --check` — exit 0 в `aa7452d`.

## Вердикт round 1

**REQUEST_CHANGES** — 3 блокирующих P2: false-green `git diff --check`,
stale v0.5.0 в HANDOFF/state, битые evidence-ссылки в report S3-2.
После их исправления повторный `verify`/`diff-check` и review.

## Риск-итог

Функциональный риск низкий: PR docs-only, без кода/CI/зависимостей;
skill-файлы побайтно совпадают с upstream v0.6.0; один skill-id; секретов
и PII нет; откат — revert squash-коммита. Остаточный риск — навигационный
drift (state/HANDOFF, docs/quality) и доверие к evidence-таблице; он
устраняется тремя точечными правками и follow-up по `docs/quality`.

---

## Re-review aa7452d (2026-11-28)

- Head: `aa7452d`; base: `2f4ed4a`.
- P2/P3 round 1 закрыты: `git diff --check` exit 0; в HANDOFF/state
  активного v0.5.0 нет (v0.5.0 остался только в историческом retro и
  references/upgrade.md); report S3-2 ссылается на существующие
  `S3-2-3.10-axe-results.json` / `S3-2-3.10-lcp-preview.json`;
  docs/quality пути ведут на `scrum-crew`; label evidence README, trace
  links, brief Q1.0–Q1.6 и context headers HANDOFF/03 исправлены.
- Проверки: `git diff --check 2f4ed4a..HEAD` — 0; `pnpm verify` — 0
  (shared 161, web 220, API 394; OpenSpec 9/9); `openspec validate --all
  --strict` — 0 (9/9); `VERSION=0.6.0` — 0; старой `sprint-crew` нет —
  0; skill internal links — 0 missing.
- Новое: P3 — в `.scrum/state.json` notes дважды повторена фраза
  «Live YooKassa/CDEK, ... owner gates»; `updated_at` не сдвинут при
  изменении state. P3 — PR body перечисляет только `docs/tasks`, но diff
  включает 2 строки `docs/quality` (закрытие P2 round 1). Оба P3 не
  блокируют: JSON валиден, code/CI/deps не менялись.
- **Финальный вердикт: APPROVE.** P0/P1/P2 нет; два P3.
