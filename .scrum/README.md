# Карта спринта

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 4` · `task: S4-1` · `change: No spec change: i18n refactor` ·
> links: [state](state.json) · [board](board.json) ·
> [sprint](sprints/4/sprint.md) · [INDEX](../docs/tasks/INDEX.md) ·
> [DoD](../docs/quality/dod.md)

## Сейчас

- Phase: BUILDING
- Sprint: 4
- Goal: все runtime JS/API/SMS и shared-тексты в одном typed
  i18next-каталоге; 100% gate в `verify`; static `index.html` meta —
  allowlist; W1/W2 copy review с evidence.
- Next gate: S4-1 foundation — `packages/i18n`, baseline scanner,
  `pnpm check:i18n`.
- WIP: 1 (потолок 6).
- Active tasks: S4-1.
- Blocked: нет; live-ключи/юрпакет/деплой — owner-гейты, не в спринте.

## Начни здесь (5–6 ссылок)

1. [state.json](state.json) — phase, sprint, cycle, stop.
2. [board.json](board.json) — задачи, owner, PR, статус.
3. [sprint.md](sprints/4/sprint.md) — Goal, PBI, trace, гейты.
4. [S4-1 brief](sprints/4/tasks/S4-1/brief.md) — foundation, AC, owns.
5. [ADR 0006](../docs/stack/adr/0006-i18n.md) — i18next, ru, 100% gate.
6. [DoD](../docs/quality/dod.md) — что считается Done.

## Вопрос → файл

| Вопрос | Файл |
|---|---|
| Где я и какая фаза? | [state.json](state.json) |
| Какая задача, owner, PR? | [board.json](board.json), [S4-1 brief](sprints/4/tasks/S4-1/brief.md) |
| Что меняется? | [sprint plan](../docs/tasks/04-i18n.md), [ADR 0006](../docs/stack/adr/0006-i18n.md) |
| Где evidence? | `sprints/4/tasks/S4-1/evidence/`, `report.md` |
| Что было раньше? | `sprints/3/`, `openspec/changes/archive/` |
| Что считается Done? | [DoD](../docs/quality/dod.md) |

## Что не читать

- `events.jsonl` как нарратив — только `tail`/`grep` по событию.
- Весь репозиторий «на всякий случай».
- `/tmp`, чат и логи сессий как источник истины.
- Чужие task-папки, старые спринты и закрытые changes без причины.
- Копии метрик/размеров/API — читай источник.

## Правила карты

- Пишет только SM/оркестратор на границах фаз.
- Только ссылки и снимок; факты — в host-файлах.
- Устаревшая фаза, несовпадение с `state.json`/`board.json` или битая
  ссылка — провал гейта.
- При конфликте источник (`state.json`, `board.json`, `sprint.md`) важнее
  карты; карта правится сразу.

## Свежесть

- `status: active` — карта текущего спринта.
- После `CLOSED` — `status: done`; карта указывает на итоговый `sprint.md`.
- `superseded` — только если карта заменена новой; дать ссылку.
- `updated` меняется при каждом обновлении на границе фазы.
