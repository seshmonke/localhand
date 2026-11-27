# Handoff: Sprint 2 закрыт, layout system смержен

Дата: 27.11.2026. Sprint 2 закрыт, LAYOUT-1 смержен.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `5d91cc5` — layout system (PR #35) поверх close PR #34.
- Sprint 1: **CLOSED**; Sprint 2: **CLOSED**, review ACCEPT.
- S2-1 catalog (#26), S2-2 cart (#28), S2-3 checkout/orders (#30/#31),
  S2-4 security/e2e (#33). Changes `03`/`04`/`05` заархивированы.
- LAYOUT-1 (post-sprint, owner-approved): PR #35, merge `5d91cc5`.
- S2-4 evidence: `.scrum/sprints/2/evidence/S2-4-verify.md`; review/retro:
  `.scrum/sprints/2/review.md`, `retro.md`.
- LAYOUT-1 evidence: `.scrum/evidence/LAYOUT-1/` (verify, e2e, 22 PNG,
  axe, layout JSON).

## Owner decision (LCP/DoD)

Владелец 27.11.2026 принял: lab/preview LCP-гейт <2500 ms — DoD-прокси
v1; field p75/RUM — бэклог до публичного запуска. Sprint 2 закрыт с
этим явным исключением. Preview 508/688 ms (S2-4), 532/720 ms (LAYOUT-1);
dev — info-only.

## Что сделано в LAYOUT-1

- `PageShell`/`PageHeader`/`Stack`/`Card`/`Grid`/`Sidebar`/`LayoutGuides`;
  storefront 1440, admin 1200, padding 16/24/40, 8pt spacing.
- Page-grid 4/8/12; общие контейнеры на storefront/cart/checkout/orders/
  admin; admin form и status стартуют на одной линии.
- Header: controls и nav 44 px, центры ±1; CTA с `lg`; badge внутри.
- `?guides=1` — dev-only overlay 4/8/12.
- Playwright layout smoke: 7 страниц × 320/768/1440, 21 скриншот,
  overflow/edges/top/guides asserts; axe admin 12×0.
- Документ: `docs/design/layout-system.md`.

## Следующий шаг

1. Sprint 3 plan — только по отдельной команде владельца; lean mode:
   1 feature-PR на PBI, 1 review + пакет фиксов, 1 close-PR, e2e/axe
   раньше.
2. Бэклог: field RUM/LCP, seller header entry на <lg, badge content-box
   assert, code splitting, orders pagination, Cache-Control spec,
   auth/me no-store, admin axe расширение.
3. Sprint 3 не начат.

## Гигиена

- S2 и layout worktrees/ветки удалены; lease LAYOUT-1 снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/02-buyer-core.md` — Sprint 2 план (CLOSED).
- `docs/tasks/S3-0-layout-system.md` — бриф LAYOUT-1 (DONE).
- `docs/design/layout-system.md` — правила сетки и отступов.
- `openspec/specs/` — текущая правда.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- E2E: `pnpm test:e2e` при запущенном dev/preview; browser e2e — локальный
  гейт, CI — API e2e.

## Ограничения

- Реальные SMS/платежи/прод — только с владельцем.
- Sprint 3 без плана не начинать.
