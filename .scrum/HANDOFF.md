# Handoff: Sprint 2 planning (buyer-core)

Дата: 2026-11-27. Sprint 1 закрыт и заархивирован.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `f4783c0` (Sprint 1 archive/close, PR #23).
- Sprint 1: **CLOSED**, review ACCEPT, retro записан.
- S1-1…S1-5: **done**; change `02-seller-onboarding` →
  `2026-11-27-02-seller-onboarding`; specs `phone-auth`, `seller-shop`,
  `product-management` созданы.
- Sprint 2: **READY**, change `03-buyer-core` (valid strict), 5 PBI,
  4–6 циклов; standing authorization владельца.

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

1. Merge PR плана Sprint 2: `docs/tasks/02-buyer-core.md`,
   `openspec/changes/03-buyer-core`, board/state READY.
2. Claim S2-1: brief `docs/tasks/S2-1-catalog.md`, ветка
   `task/S2-1-catalog`, worktree и lease; затем dispatch.
3. S2-2 cart → S2-3 checkout API → S2-4 orders UI → S2-5 security/
   evidence/archive. Claim каждого — после merge предыдущего.

## Гигиена

- S1 worktrees/ветки удалены; lease S1-5 снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/INDEX.md` — вход.
- `openspec/specs/` — текущая правда.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовые БД: `localhand_s1_3_test`; для Sprint 2 — отдельная
  `localhand_s2_test`.

## Ограничения

- Не начинать Sprint 2 вне утверждённого плана/скоупа.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
