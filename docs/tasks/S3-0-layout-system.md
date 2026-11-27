# Task S3-0: Layout system

## Цель

Ввести единую layout-систему web: 12-колоночная сетка, общий контейнер,
8pt-ритм, единые высоты контролов и выравнивание границ. Убрать
рассинхрон header/admin form/status и зафиксировать правила дизайна,
чтобы новые страницы не «плыли».

## AC

- [x] `apps/web/src/components/layout/**`:
      `PageShell` (max 1440, px 16/24/40, full-height),
      `PageHeader` (eyebrow/title/description/actions),
      `Stack` (vertical gap scale),
      `Card` (border/padding),
      `Grid`/`Sidebar` (page-level 12-col: `lg:grid-cols-12`,
      `gap-x-4 lg:gap-x-6`), `LayoutGuides` (dev overlay 12 колонок при
      `?guides=1`).
- [x] Header: все контролы одной высоты 44 px (`h-11`/`size-11`),
      `shrink-0`; CTA не ломает 320 (скрыть/сжать по breakpoint);
      badge корзины не выходит за сетку; вертикальные центры совпадают.
- [x] Admin product edit: `Announcer` вынести над grid; form и status
      aside стартуют на одной линии; `items-start`/`gap` одинаковы.
- [x] Admin/Storefront/Checkout/Cart/Orders: один контейнер и padding
      на страницах; никаких локальных `max-w-[1100px]` вразнобой;
      заголовки/линии карточек совпадают по левому краю.
- [x] Spacing: только 8pt-шаги для layout (8/16/24/32/40/48), `gap`
      вместо `mt-*` между блоками; типографика может иметь свои
      line-height.
- [x] 320/768/1440: нет горизонтального overflow; сетка складывается
      4/8/12 колонок; таблицы → карточки; touch ≥44.
- [x] Playwright layout smoke: скриншоты 320/768/1440 для `/`, `/cart`,
      `/checkout`, `/orders`, `/admin/shop`, `/admin/products/:id`,
      `/admin/orders`; проверки: form/aside top equal, header controls
      center equal, no overflow; overlay `?guides=1`.
- [x] `docs/design/layout-system.md`: правила, токены, примеры,
      источники (Material 3 grid, NN/g, Tailwind grid, 8pt).
- [x] `pnpm verify` + `pnpm test:e2e` зелёные; axe light/dark 0.

## Change

`No spec change`: поведение и API не меняются, только layout/UI.
Дизайн-правила — `docs/design/layout-system.md`.

## owns

- `apps/web/src/components/layout/**`
- `apps/web/src/App.tsx` (Header/Footer/StorefrontLayout)
- `apps/web/src/components/admin/AdminShell.tsx`
- `apps/web/src/pages/{Marketplace,Shop,Product,Cart,Checkout,Orders,Order,Admin*}.tsx`
- `apps/web/src/index.css` (layout tokens/overlay, если нужно)
- `apps/web/e2e/layout.spec.ts`, `apps/web/e2e/helpers.ts` при необходимости
- `docs/design/layout-system.md`, `docs/tasks/S3-0-layout-system.md`

Не трогать: API/shared/order logic, бизнес-поведение, `openspec/**`
(нет behavior change), `.scrum/**` (кроме orchestrator claim).

## Решения

- Page-level — CSS Grid 12 колонок; component-level — flex/stack.
- Container max 1440; admin content max 1200 (одна ширина для всех
  admin-страниц), не 1100 в каждой.
- Sidebar admin 260 px; main grid `minmax(0,1fr)`.
- Controls: 44 px touch; header 64/80.
- 8pt spacing scale; не вводить второй spacing layer.
- Гайды только dev/`?guides=1`, не в production UI.
- Не менять визуальный язык: ч/б брутализм, 3px borders, display/mono.

## Non-goals

- Новый бренд/палитра/типографика.
- Изменение API/БД/бизнес-логики.
- Полный редизайн всех страниц; только layout/выравнивание.
- Sprint 3 planning/start.

## Evidence

- `pnpm verify` — exit code, хвост.
- `pnpm test:e2e` layout + screenshots 320/768/1440.
- `?guides=1` overlay screenshot.
- axe light/dark 0; bundle delta.
- Orchestrator запишет evidence.

## Границы

- Работать только в task worktree ветки `task/layout-system`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При конфликте с бизнес-логикой — стоп.
