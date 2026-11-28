# Handoff: Task S4-2b2 — delivery UI W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2b2` ·
> `change: No spec change: i18n refactor` ·
> links: [brief](brief.md) · [report](report.md) · [evidence](evidence/)

Durable-путь: `.scrum/sprints/4/tasks/S4-2b2/handoff.md`. Worktree, ветка и
чат — runtime; после merge они исчезают, этот файл остаётся.

## Сделано

- Файлы: `AdminDeliveryCard.tsx`, `DeliverySummaryCard.tsx`, их тесты,
  `packages/i18n/src/resources/ru.ts`, `scripts/i18n-baseline.json`.
- Коммит: `201d607` (`feat(i18n): migrate delivery copy to ru catalog`),
  база main `92f6675`, ветка `task/S4-2b2-delivery-catalog`.
- PR: не открыт — `git push` отклонён средой (`Permission denied:
  shell`). Нужен push ветки и PR из координатора.
- Evidence: [evidence/](evidence/) — baseline delta, value preservation,
  tests before/after, check:i18n, verify, e2e, axe, bundle, numstat.

## Осталось

- Следующий шаг: push `task/S4-2b2-delivery-catalog`, открыть PR с SHA
  `201d607`, ревью, merge; после merge — S4-3 W2.
- Что не делать: не менять `DELIVERY_STATUS_LABELS`-контракт
  (имя/тип/значения), не переносить shared labels/SMS/index в этом PR,
  не трогать `openspec/specs/`, state/board/README.
- Зависимости/блокеры: push/PR недоступны исполнителю; других нет.

## Грабли

- В свежем worktree нужен полный `pnpm install`: без него API typecheck
  падает на отсутствующих workspace-зависимостях, хотя web-тесты уже
  идут.
- e2e: API `:3100` с fake payments/delivery и
  `WEB_ORIGIN=http://localhost:5273`, web `:5273`; Vite proxy на `:3100`
  патчится временно и возвращается к `:3000` до коммита. `pnpm ... dev --
  --port` не переопределяет порт Vite; использовать `vite --port 5273`.
- `DELIVERY_STATUS_LABELS` сохранён как публичный контракт, но его
  значения читаются из `ru.ts` — иначе 7 findings не дают baseline 424.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | typecheck/lint/format/check:public; check:i18n 424; i18n 4, shared 161, web 252, API 224/170 skipped, scanner 8; build; OpenSpec 9/9 — [log](evidence/verify.txt) |
| `pnpm check:i18n` | 0 | 424 findings / 466 occurrences; deadKeys 0 — [log](evidence/check-i18n-after.txt) |
| `pnpm test:e2e` | 0 | 13 passed; axe 72/0 — [log](evidence/e2e.txt) |
| targeted vitest | 0 | 48/48 before и after — [before](evidence/tdd-characterization-before.txt), [after](evidence/tdd-characterization-after.txt) |

## Открытые треды

- `#task-4`: review/merge S4-2b2.
- `#spec`: namespace `delivery.*` (решение Architect в S4-2 brief).
- Review: ожидает после push/PR.

## Doc change

- `No doc change: i18n refactor`; ADR 0006 и sprint plan актуальны.

## Read-back получателя

«Понял: delivery UI в `ru.ts` без смены значений/поведения; SHA
`201d607`; baseline 424; verify/e2e/axe зелёные. Делаю: push + PR.
Не трогаю: shared labels/SMS/index, specs, state/board.»
