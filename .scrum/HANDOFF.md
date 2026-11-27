# Handoff: Sprint 1, cycle 2 — старт S1-2 shop

Дата: 2026-11-27. Обновлено после merge S1-1 и docs-закрытия.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `0c5c480` (S1-1 auth + docs-закрытие), PR #12/#13 merged.
- Sprint 1: **BUILDING**, cycle 2.
- S1-1 phone auth: **done**, PR #12 merged; tasks 1.1–1.6 отмечены.
- S1-2 shop: **in_progress**, owner `scrum-worker`; brief
  `docs/tasks/S1-2-seller-shop.md`, ветка `task/S1-2-shop`, lease
  `.scrum/locks/S1-2.json` до 03:30Z.
- S1-3 products, S1-4 admin UI, S1-5 security — `ready`.

## S1-1 evidence

- Verify (orchestrator): exit 0; API 58/58, shared 8/8, web 1/1,
  build OK, `openspec validate --all --strict` 2/2, `check:public` чист.
  Evidence: `.scrum/sprints/1/evidence/S1-1-verify.md`.
- Review: независимый `scrum-reviewer`, **APPROVE** на `9ee2360`;
  P1 trustProxy закрыт, тесты trusted/non-trusted XFF.
- PR #12: `verify` + `review-gate` зелёные, squash-merge `d3e42b7`.
- Preview smoke: S1-1 backend-only, login UI — S1-4; исключение
  зафиксировано в evidence.

## Carry-over (не блокирует S1-2)

- Backlog: `TRUST_PROXY=false`/`/0` в production, TTL/log-тесты,
  `DATABASE_URL` fail-fast, OTP cleanup/rollback/метрики, seed demo-user.
- S1-5 берёт carry-over по приоритету; из tasks 5.2 — только проверка
  authz/rate-limit/логов. Состав S1-2 не расширяется.

## Текущий шаг

1. `scrum-worker` реализует S1-2 в ветке `task/S1-2-shop`: контракты
   slug/резервов, `GET/POST/PATCH /seller/shop`, публикация, уникальный
   slug, чужая лавка 404, без сессии 401.
2. Orchestrator: verify → independent review → PR → squash-merge.
3. После merge — tasks 2.1–2.4, board/state/daily/evidence, затем S1-3.

## Гигиена

- S1-1 task worktree и ветка `task/S1-1-phone-auth` удалены после
  merge (локально и origin).
- Время в `.scrum/**` — UTC; старые +03-записи нормализованы,
  корректирующее событие в `events.jsonl`.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовая БД S1-2: `localhand_s1_2_test` (создана).

## Ограничения

- Не начинать Sprint 2 без плана/проверки направления.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
