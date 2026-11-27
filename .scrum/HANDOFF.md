# Handoff: Sprint 1, cycle 2 — S1-2 shop

Дата: 2026-11-27. Обновлено после merge S1-1.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `d3e42b7` (squash PR #12, phone auth).
- Sprint 1: **BUILDING**, cycle 2.
- S1-1 phone auth: **done**, PR #12 merged; tasks 1.1–1.6 отмечены.
- S1-2 shop: **in progress**, ветка/worktree создаются от `main`.
- S1-3 products, S1-4 admin UI, S1-5 security — `ready`.

## S1-1 evidence

- Verify (orchestrator): exit 0; API 58/58, shared 8/8, web 1/1,
  build OK, `openspec validate --all --strict` 2/2, `check:public` чист.
  Лог: `/tmp/opencode/S1-1-verify-resume.log`.
- Review: независимый `scrum-reviewer`, **APPROVE** на `9ee2360`;
  P1 trustProxy закрыт, тесты trusted/non-trusted XFF.
- PR #12: `verify` + `review-gate` зелёные, squash-merge `d3e42b7`.

## Carry-over (не блокирует S1-2)

- P2: `TRUST_PROXY=false`/`/0` в production; TTL-константа без теста;
  тест отсутствия телефона/кода в логах; `DATABASE_URL` fail-fast в prod.
- P3: OTP cleanup/retention, rollback SQL, auth-метрики, design.md
  demo-user seed, evidence-секция брифа.
- Всё занесено в `docs/tasks/backlog.md` и S1-5; не расширять S1-2.

## Следующий шаг

S1-2 shop: контракты slug/резервов, `GET/POST/PATCH /seller/shop`,
публикация, уникальный slug, чужая лавка 404, без сессии 401.
Бриф — `docs/tasks/S1-2-seller-shop.md`; change `02-seller-onboarding`,
capability `seller-shop`.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Тестовая БД: `localhand_s1_1_test`; для S1-2 — отдельная
  `localhand_s1_2_test`.

## Ограничения

- Не начинать Sprint 2 без плана/проверки направления.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
