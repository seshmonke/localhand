# Handoff: остановка на checkpoint S1-1

Дата: 2026-11-27. Причина: контекстное окно сессии; работа продолжается
из новой сессии.

## Состояние

- Репозиторий: https://github.com/seshmonke/localhand, public.
- main: `d9b4249` (после PR #10, backlog import).
- main защищён: PR only, `verify` + `review-gate`, linear history,
  force push запрещён, admins enforced.
- Sprint 1: **BUILDING**, cycle 1.
- S1-1 phone auth: **in progress**, не смержен.
- S1-2 shop, S1-3 products, S1-4 admin UI, S1-5 security — `ready`,
  не начаты.

## Ветка S1-1

- Ветка: `task/S1-1-phone-auth`
- Worktree: `/tmp/opencode/localhand-S1-1`
- Последний коммит: `9ee2360` (`docs(s1-1): review addenda`),
  до него `b467306` (`fix(auth): trust only caddy proxy`),
  `4e8d2c6` (`chore(s1-1): run auth db tests in CI`).
- Worktree чистый; незакоммиченного WIP нет.
- Worker session: `ses_de5cf8d89ffeZ7Sj0Q4rOHCVe2`.
- Reviewer session: `ses_de5c92420ffel9uIJSdZ3Goueh`.

## Что сделано по S1-1

- `users`, `otp_codes`, `sellers.user_id` + миграция `0002`.
- Auth-контракты, OTP (HMAC, TTL 5 мин, 5 попыток), JWT-cookie
  `lh_session`, `/auth/request-code`, `/auth/verify-code`,
  `/auth/me`, `/auth/logout`.
- Dev/SMS.ru адаптеры, rate-limits, DB-backed тесты, CI env.
- Orchestrator verify: 47 API tests, 8 shared, 1 web; OpenSpec 2 passed.

## Блокер, на котором остановились

Re-review: **REQUEST_CHANGES** по `trustProxy=true`.
Фикс `b467306` уже сделан: `TRUST_PROXY` только explicit IP/CIDR Caddy,
`true` отклоняется; тест non-trusted XFF; P3-быстрые фиксы. Но **повторное
ревью после b467306 ещё не проведено** — мержа нет.

## Следующие шаги

1. `cd /tmp/opencode/localhand-S1-1` (если worktree потерян:
   `git worktree add /tmp/opencode/localhand-S1-1 task/S1-1-phone-auth`).
2. Проверить/докоммитить фикс trustProxy; не мержить без ревью.
3. `pnpm install`; тестовая БД:
   `docker compose exec -T db createdb -U localhand localhand_s1_1_test`
   (если нет).
4. Прогнать:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s1_1_test' \
   JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
   OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
   pnpm verify
   ```
5. Повторное ревью (reviewer session выше). APPROVE → push branch,
   PR, label `reviewed`, `verify` + `review-gate`, squash-merge.
6. Отметить tasks 1.1–1.6 в `openspec/changes/02-seller-onboarding/tasks.md`,
   обновить `daily.md`/board/state, затем S1-2 shop.

## Полезное

- `docs/tasks/01-seller-onboarding.md` — Sprint 1 план.
- `openspec/changes/02-seller-onboarding/` — change, spec, design, tasks.
- `.scrum/sprints/1/daily.md` в task worktree — cycle 1 daily.
- Preview: `pnpm dev` → http://localhost:5173 (API 3000, DB 5433).
- Логи: `/tmp/opencode/S1-1-*.log`.
- P3 на S1-5: OTP cleanup/retention, rollback SQL, demo seller user_id,
  auth metrics, logout stateless trade-off, seed demo-user.

## Ограничения

- Не начинать Sprint 2 без плана/проверки направления.
- Не мержить красный PR, не обходить branch protection.
- Реальные SMS/платежи/прод — только с владельцем.
