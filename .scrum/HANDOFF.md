# Handoff: Sprint 2 закрыт — layout-system PBI

Дата: 27.11.2026. Sprint 2 закрыт, LCP-исключение зафиксировано.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `8b748b2` (S2-4 security/e2e, PR #33) + close PR #34.
- Sprint 1: **CLOSED**; Sprint 2: **CLOSED**, review ACCEPT.
- S2-1 catalog (#26), S2-2 cart (#28), S2-3 checkout/orders (#30/#31),
  S2-4 security/e2e (#33). Changes `03`/`04`/`05` заархивированы.
- S2-4 evidence: `.scrum/sprints/2/evidence/S2-4-verify.md`; review/retro:
  `.scrum/sprints/2/review.md`, `retro.md`.

## Owner decision (LCP/DoD)

Владелец 27.11.2026 принял: lab/preview LCP-гейт <2500 ms — DoD-прокси
v1; field p75/RUM — бэклог до публичного запуска. Sprint 2 закрыт с
этим явным исключением. Preview 508/688 ms, dev info 2720/2772.

## Следующий шаг

1. PBI `layout-system` (согласован владельцем): PageShell/Container,
   12 колонок, 8pt spacing, Stack/Grid/Sidebar/Card, единые высоты
   контролов, overlay и screenshot-тесты 320/768/1440; исправить
   рассинхрон admin form/status, header controls, контейнеры.
2. После PBI — Sprint 3 plan (только по команде владельца).
3. Field RUM/LCP, orders pagination, admin axe, Cache-Control spec,
   auth/me no-store — бэклог.

## Sprint 3

Не начат. Нужен план и отдельная команда владельца. Lean mode согласован:
1 feature-PR на PBI, 1 review + пакет фиксов, 1 close-PR, e2e/axe как
можно раньше.

## Гигиена

- S2 worktrees/ветки удалены; lease S2-4 снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/02-buyer-core.md` — Sprint 2 план (CLOSED).
- `openspec/specs/` — текущая правда.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- E2E: `pnpm test:e2e` при запущенном dev/preview; browser e2e — локальный
  гейт, CI — API e2e.

## Ограничения

- Реальные SMS/платежи/прод — только с владельцем.
- Sprint 3 без плана не начинать.
