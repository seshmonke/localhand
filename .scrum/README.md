# Карта спринта

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 3 (closed)` · `task: —` · `change: 07-delivery (archived)` ·
> links: [state](state.json) · [board](board.json) ·
> [sprint](sprints/3/sprint.md) · [INDEX](../docs/tasks/INDEX.md) ·
> [DoD](../docs/quality/dod.md)

## Сейчас

- Phase: CLOSED
- Sprint: 3, закрыт 28.11.2026; активного спринта нет.
- Goal: покупатель оплачивает заказ продавцу в тестовом контуре ЮKassa,
  продавец оформляет СДЭК и ведёт заказ до трека/статуса.
- Next gate: планирование Sprint 4 только по команде владельца;
  upgrade `scrum-crew` v0.6.0 выполнен.
- WIP: 0 (потолок 6).
- Active tasks: нет.
- Blocked: live YooKassa/CDEK, юрпакет, production deploy/SMS, field RUM —
  внешние owner-гейты.

## Начни здесь (5–6 ссылок)

1. [state.json](state.json) — phase, sprint, cycle, stop.
2. [board.json](board.json) — задачи, owner, PR, статус.
3. [sprint.md](sprints/3/sprint.md) — Goal, PBI, trace, гейты.
4. [S3-2 brief](sprints/3/tasks/S3-2/brief.md) и
   [report](sprints/3/tasks/S3-2/report.md) — delivery test contour.
5. [07-delivery archive](../openspec/changes/archive/2026-11-28-07-delivery/proposal.md) —
   заархивированный change; specs — `openspec/specs/delivery/`.
6. [DoD](../docs/quality/dod.md) — что считается Done.

## Вопрос → файл

| Вопрос | Файл |
|---|---|
| Где я и какая фаза? | [state.json](state.json) |
| Какая задача, owner, PR? | [board.json](board.json), [brief](sprints/3/tasks/S3-2/brief.md) |
| Что меняется? | [archive change](../openspec/changes/archive/2026-11-28-07-delivery/proposal.md) |
| Где evidence? | `sprints/3/tasks/S3-2/evidence/` и `sprints/3/evidence/` |
| Что было раньше? | `sprints/`, `openspec/changes/archive/` |
| Что считается Done? | [DoD](../docs/quality/dod.md) |
| Почему так решили? | `docs/stack/adr/`, `openspec/specs/` |
| Где Text Review W1 вне спринта? | [report](tasks/TEXT-W1/report.md), [audit](reviews/text-site-audit.md) |

Задачи вне спринта живут в `.scrum/tasks/<ID>/`; board/state их не
знают, пока задача не взята в спринт.

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

- `status: done` — Sprint 3 закрыт; карта указывает на итоговый
  `sprint.md`.
- `active` — карта текущего спринта.
- `superseded` — только если карта заменена новой; дать ссылку.
- `updated` меняется при каждом обновлении на границе фазы.
