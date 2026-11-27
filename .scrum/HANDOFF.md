# Handoff: Sprint 1, cycle 3 — S1-3 products

Дата: 2026-11-27. Обновлено после merge S1-2.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `f7f26ba` (S1-2 close + docs); S1-2 code — `11ca2c0`, PR #14.
- Sprint 1: **BUILDING**, cycle 3.
- S1-1 phone auth: **done**, PR #12; tasks 1.1–1.6 отмечены.
- S1-2 shop: **done**, PR #14; tasks 2.1–2.4 отмечены.
- S1-3 products: **in_progress**, owner `scrum-worker`; бриф
  `docs/tasks/S1-3-products.md`, ветка `task/S1-3-products`, lease
  `.scrum/locks/S1-3.json` до 04:30Z.
- S1-4 admin UI, S1-5 security — `ready`.

## Evidence

- S1-1: `.scrum/sprints/1/evidence/S1-1-verify.md`; API 58/58,
  shared 8/8, web 1/1, OpenSpec 2/2; review APPROVE; merge `d3e42b7`.
- S1-2: `.scrum/sprints/1/evidence/S1-2-verify.md`; API 78/78,
  shared 18/18, web 1/1, OpenSpec 2/2; review APPROVE; merge `11ca2c0`.
- S1-1/S1-2 backend-only: login UI — S1-4; preview-исключение
  зафиксировано в evidence.

## Carry-over (не блокирует S1-3)

- Backlog: `TRUST_PROXY=false`/`/0` в production, TTL/log-тесты,
  `DATABASE_URL` fail-fast, OTP cleanup/rollback/метрики, seed demo-user,
  TOCTOU blocked-guard (S1-5 moderation).
- Из tasks 5.2 — authz/rate-limit/логи; остальное — по приоритету.
  Состав S1-3 не расширяется.

## Sprint 2 authorization (27.11.2026)

Владелец дал standing authorization, отдельная команда на старт не нужна:

- автоматический переход после закрытия Sprint 1: S1-2…S1-5 merged,
  change заархивирован, retro, `main` зелёный;
- Sprint 2 — buyer-core: каталог/поиск/сортировка, карточка, страница
  магазина, корзина по магазинам, checkout и заказ; продавец видит заказ;
- покупатель входит по телефону через OTP на checkout, заказ привязан к
  `users`; guest-checkout нет;
- ЮKassa/СДЭК/SMS не подключаем: только интерфейсы и dev-адаптеры;
- preview локальный + скриншоты/видео и e2e на тестовых данных;
- merge после независимого ревью и зелёных checks, без подтверждения на
  каждый PR; branch protection не ослабляется;
- бюджет не блокер: жёсткого лимита нет, 4–6 циклов — ориентир по
  объёму, при перерасходе режется скоуп;
- стоп-триггеры: смена скоупа/продукта, реальные ПДн/деньги/прод,
  инцидент безопасности, красный `main`, 3 REJECT, дыра в спеке.
- План Sprint 2 пишет orchestrator и показывает перед стартом.

## Текущий шаг

1. `scrum-worker` реализует S1-3 в ветке `task/S1-3-products`:
   product-admin контракты, `GET/POST /seller/products`,
   `PATCH /seller/products/:id`, publish/hide, authz своего магазина,
   DB-тесты.
2. Orchestrator: verify → independent review → PR → squash-merge.
3. После merge — tasks 3.1–3.4, board/state/daily/evidence, затем S1-4.

## Гигиена

- S1-1 и S1-2 task worktrees/ветки удалены после merge (локально и
  origin); lease S1-2 снят.
- Время в `.scrum/**` — UTC.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовые БД: `localhand_s1_2_test`; для S1-3 — `localhand_s1_3_test`.

## Ограничения

- Sprint 2 авто-стартует после закрытия Sprint 1 по standing
  authorization; без нового плана/скоупа не начинать.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
