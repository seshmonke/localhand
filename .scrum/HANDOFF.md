# Handoff: Sprint 2, cycle 3 — S2-3 checkout/orders

Дата: 2026-11-27. Sprint 1 закрыт и заархивирован.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `92b4b9d` (S2-2 cart, PR #28); close PR #29.
- Sprint 1: **CLOSED**, review ACCEPT, retro записан.
- S1-1…S1-5: **done**; change `02-seller-onboarding` →
  `2026-11-27-02-seller-onboarding`; specs `phone-auth`, `seller-shop`,
  `product-management` созданы.
- Sprint 2: **BUILDING**, cycle 3; `03`, `04` archived;
  `05-checkout-orders` active.
- S2-1 catalog: **done**, PR #26; `03` archived.
- S2-2 cart: **done**, PR #28; `04` archived.
- S2-3 checkout/orders: **ready**, не claimed. Перед dispatch: brief
  `docs/tasks/S2-3-checkout.md`, ветка `task/S2-3-checkout`, lease.

## Evidence S1

- `.scrum/sprints/1/evidence/S1-1-verify.md` … `S1-5-verify.md`;
  скриншоты 320/1440, axe raw.
- Review: `.scrum/sprints/1/review.md`; retro:
  `.scrum/sprints/1/retro.md`.
- Финальные counts: API 102, shared 33, web 35, OpenSpec 4/4 strict,
  e2e seller flow 3/3.

## Sprint 2 authorization

Владелец дал standing authorization:

- авто-старт после закрытия Sprint 1 — выполнен;
- buyer-core: каталог/поиск/сортировка, карточка, магазин, корзина по
  магазинам, checkout/заказ; продавец видит заказ;
- buyer auth — телефон/OTP на checkout; guest-checkout нет;
- ЮKassa/СДЭК/SMS — только интерфейсы/dev-адаптеры;
- локальный preview + скриншоты/видео/e2e на тестовых данных;
- merge после независимого ревью и зелёных checks; branch protection;
- бюджет не блокер; 4–6 циклов — ориентир, при перерасходе режем скоуп;
- стоп-триггеры: смена скоупа/продукта, реальные ПДн/деньги/прод,
  инцидент безопасности, красный `main`, 3 REJECT, дыра в спеке;
- план Sprint 2 пишет orchestrator и показывает перед стартом.

## Следующий шаг

1. Claim S2-3: brief `docs/tasks/S2-3-checkout.md`, ветка
   `task/S2-3-checkout`, worktree/lease; dispatch.
2. Orchestrator: verify → review → PR → merge/archive `05`.
3. S2-4 security/close.

## Гигиена

- S1 worktrees/ветки удалены; lease S1-5 снят.
- S2-1 lease снят; worktree/ветка `task/S2-1-catalog` удалены.
- S2-2 lease снят; worktree/ветка `task/S2-2-cart` удалены.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/INDEX.md` — вход.
- `openspec/specs/` — текущая правда.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовые БД: `localhand_s1_3_test`, `localhand_s2_test` (создана).

## Ограничения

- Не начинать Sprint 2 вне утверждённого плана/скоупа.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
