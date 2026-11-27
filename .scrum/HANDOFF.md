# Handoff: Sprint 1, cycle 6 — S1-5 security/evidence/archive

Дата: 2026-11-27. Обновлено после merge S1-4b.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `3753a1b` (S1-4b products UI, PR #20).
- Sprint 1: **BUILDING**, cycle 6.
- S1-1 auth: **done**, PR #12; tasks 1.1–1.6.
- S1-2 shop: **done**, PR #14; tasks 2.1–2.4.
- S1-3 products: **done**, PR #16; tasks 3.1–3.4.
- S1-4a admin auth/shop UI: **done**, PR #18; tasks 4.1–4.3.
- S1-4b products UI: **done**, PR #20; tasks 4.4–4.5.
- S1-5 security/evidence/docs/archive: **ready**, не claimed. Перед
  dispatch: brief `docs/tasks/S1-5-security-archive.md`, ветка
  `task/S1-5-security-archive`, lease `.scrum/locks/S1-5.json`.

## Evidence

- S1-1: API 58, shared 8, web 1; merge `d3e42b7`.
- S1-2: API 78, shared 18, web 1; merge `11ca2c0`.
- S1-3: API 97, shared 33, web 1; merge `b728eda`.
- S1-4a: API 97, shared 33, web 15; axe light/dark 0; merge `f991c93`.
- S1-4b: API 97, shared 33, web 34; axe light/dark 0; merge `3753a1b`.
- Все: `.scrum/sprints/1/evidence/S1-*-verify.md` + screenshots/axe raw.

## Carry-over (не блокирует S1-5)

- Backlog: TRUST_PROXY/`DATABASE_URL`, TTL/log-тесты, OTP cleanup,
  seed demo-user, TOCTOU blocked/publish, storefront id/SQL,
  `imageUrl: ""`/scheme, pagination/rate-limit, spec partial edit,
  packages/ui focus ring, axe CI gate, perf/observability,
  inverse-aside border, cache-тесты guard/logout, 401 на мутациях,
  формат цены, focus-ring ошибок, save race.
- S1-5 берёт: e2e/smoke, authz/rate-limit/logs, legal/ADR, evidence,
  archive. Остальное — backlog.

## Sprint 2 authorization (27.11.2026)

Владелец дал standing authorization, отдельная команда не нужна:

- авто-старт после закрытия Sprint 1: S1-5 merged, change
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
  инцидент безопасности, красный `main`, 3 REJECT, дыра в спеке;
- план Sprint 2 пишет orchestrator и показывает перед стартом.

## Текущий шаг

1. Создать ветку `task/S1-5-security-archive` от main, бриф
   `docs/tasks/S1-5-security-archive.md`, worktree и lease.
2. Dispatch `scrum-worker`: API e2e dev OTP → shop → product →
   storefront; authz/rate-limit/log-проверки; legal/ADR SMS; evidence.
3. Orchestrator: verify → independent review → PR → squash-merge.
4. Затем archive change, sprint close/retro; авто-старт Sprint 2 по
   standing authorization.

## Гигиена

- S1-1…S1-4b task worktrees и ветки удалены после merge; lease 4b снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовые БД: `localhand_s1_3_test`.

## Ограничения

- Sprint 2 авто-стартует после закрытия Sprint 1 по standing
  authorization; без нового плана/скоупа не начинать.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
