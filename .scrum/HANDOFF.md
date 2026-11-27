# Handoff: Sprint 1, cycle 4 — S1-4a admin auth/shop UI

Дата: 2026-11-27. Обновлено после merge S1-3.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `b728eda` (S1-3 products, PR #16).
- Sprint 1: **BUILDING**, cycle 4.
- S1-1 auth: **done**, PR #12; tasks 1.1–1.6.
- S1-2 shop: **done**, PR #14; tasks 2.1–2.4.
- S1-3 products: **done**, PR #16; tasks 3.1–3.4.
- S1-4 admin UI: **in_progress**, 4a owner `scrum-worker`; split:
  - 4a auth + admin shell + shop onboarding/settings — tasks 4.1–4.3 +
    применимые loading/empty/error, mobile/desktop и a11y из 4.5;
  - 4b products table/form — task 4.4 + остаток 4.5 (таблица/карточки,
    responsive, a11y).
- S1-5 security/evidence/archive — `ready`.

## Evidence

- S1-1: `.scrum/sprints/1/evidence/S1-1-verify.md` — API 58, shared 8,
  web 1, OpenSpec 2/2; merge `d3e42b7`.
- S1-2: `.scrum/sprints/1/evidence/S1-2-verify.md` — API 78, shared 18,
  web 1, OpenSpec 2/2; merge `11ca2c0`.
- S1-3: `.scrum/sprints/1/evidence/S1-3-verify.md` — API 97, shared 33,
  web 1, OpenSpec 2/2; merge `b728eda`.
- Backend-only PBI: preview smoke всего пути — S1-4/S1-5.

## Carry-over (не блокирует S1-4)

- Backlog: TRUST_PROXY/`DATABASE_URL` fail-fast, TTL/log-тесты, OTP
  cleanup/метрики, seed demo-user, TOCTOU blocked/publish, storefront
  id/SQL, imageUrl `""`, pagination/rate-limit, spec partial edit.
- S1-5 берёт по приоритету; состав S1-4a/4b не расширяется.

## Sprint 2 authorization (27.11.2026)

Владелец дал standing authorization, отдельная команда не нужна:

- авто-старт после закрытия Sprint 1: S1-4…S1-5 merged, change
  заархивирован, retro, `main` зелёный;
- sprint 2 — buyer-core: каталог/поиск/сортировка, карточка, магазин,
  корзина по магазинам, checkout/заказ; продавец видит заказ;
- buyer auth — телефон/OTP на checkout, заказ привязан к `users`;
  guest-checkout нет;
- ЮKassa/СДЭК/SMS — только интерфейсы/dev-адаптеры;
- preview локальный + скриншоты/видео и e2e на тестовых данных;
- merge после независимого ревью и зелёных checks, без подтверждения на
  каждый PR; branch protection не ослабляется;
- бюджет не блокер; жёсткого лимита нет; 4–6 циклов — ориентир по
  объёму, при перерасходе режется скоуп;
- стоп-триггеры: смена скоупа/продукта, реальные ПДн/деньги/прод,
  инцидент безопасности, красный `main`, 3 REJECT, дыра в спеке.
- План Sprint 2 пишет orchestrator и показывает перед стартом.

## Текущий шаг

1. `scrum-worker` реализует S1-4a в ветке `task/S1-4a-admin-auth`:
   API client с cookie, `/login`, guard `/admin`, onboarding/settings
   магазина, publish; применимые states/layout/a11y; web-тесты.
2. Orchestrator: verify → independent review → PR → squash-merge.
3. Затем S1-4b: products table/form (task 4.4 + остаток 4.5).

## Гигиена

- S1-1/S1-2/S1-3 task worktrees и ветки удалены после merge; lease S1-3
  снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовые БД: `localhand_s1_3_test`; для UI — API-тесты не нужны,
  web-тесты без БД.

## Ограничения

- Sprint 2 авто-стартует после закрытия Sprint 1 по standing
  authorization; без нового плана/скоупа не начинать.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
