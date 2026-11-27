# Task S1-1: Phone auth backend

## Цель

Продавец может запросить OTP по российскому номеру, подтвердить его,
получить httpOnly-сессию, прочитать `/auth/me` и выйти. Backend +
контракты + миграция + тесты. UI логина — S1-4, здесь нет.

## AC

- [x] Миграция: `users` (id, phone unique, created_at), `otp_codes`
      (id, phone, code_hash, expires_at, attempts, consumed_at, created_at,
      индекс phone+created_at), `sellers.user_id` (nullable unique FK).
- [x] `packages/shared`: Zod-контракты auth (phone, code, user, responses).
- [x] `POST /auth/request-code`: нормализует российский номер, создаёт
      OTP, отправляет через `SmsProvider`, отвечает 200 одинаково для
      нового/старого номера; невалидный номер — 400; лимит — 429.
- [x] `POST /auth/verify-code`: проверяет хеш/TTL/попытки, создаёт
      `users` при первом входе, выдаёт httpOnly cookie `lh_session`
      (JWT, 7 дней), возвращает user; ошибка — generic 401.
- [x] `GET /auth/me`: 200 с user по cookie, 401 без/с протухшей.
- [x] `POST /auth/logout`: очищает cookie.
- [x] OTP: 6 цифр, HMAC-SHA256 с `OTP_SECRET`, TTL 5 минут, 5 попыток,
      не хранится открытым текстом.
- [x] SMS-провайдер: интерфейс `SmsProvider`; `dev` adapter для preview
      (возвращает `devCode` только вне production); `smsru` adapter по
      `SMSRU_API_ID`; production с `SMS_PROVIDER=dev` падает на старте.
- [x] Тесты: валидный/неверный/просроченный код, лимит, нет cookie,
      dev в production, нормализация номера.
- [x] `pnpm verify` в worktree — зелёный.

## Change

`openspec/changes/02-seller-onboarding` (capability `phone-auth`).
Спека — `specs/phone-auth/spec.md`; дизайн — `design.md`.

## owns

- `apps/api/src/auth/**`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/**` (новая миграция)
- `apps/api/src/app.ts` (регистрация auth routes)
- `apps/api/src/env.ts` (auth env)
- `packages/shared/src/contracts/auth.ts`
- `packages/shared/src/index.ts`
- тесты рядом с кодом

Не трогать: `apps/web/**`, `packages/ui/**`, shop/product код,
`openspec/**`, `.scrum/**`, `docs/tasks/01-seller-onboarding.md`.

## Контракты

- `AuthUserSchema`: `{ id: number, phone: string }`.
- `RequestCodeSchema`: `{ phone: string }`.
- `RequestCodeResponseSchema`: `{ ok: true, devCode?: string }`.
- `VerifyCodeSchema`: `{ phone: string, code: string }`.
- `VerifyCodeResponseSchema`: `{ user: AuthUser }`.
- `MeResponseSchema`: `{ user: AuthUser }`.
- Cookie: `lh_session`, httpOnly, sameSite=lax, secure в production.
- Ошибки: `{ error: string }` с 400/401/429.

## Non-goals

- Login UI, seller shop/products, buyer auth.
- Реальный SMS-ключ и отправка в preview.
- Refresh-токены, роли админа, модерация.
- S3/фото, оплата, доставка, AI.

## Evidence

- `pnpm verify` — exit 0 (лог `/tmp/opencode/S1-1-verify-resume.log`):
  API 58/58, shared 8/8, web 1/1, build OK, `check:public` чист.
- `openspec validate --all --strict` — 2/2 passed.
- HTTP-контракты покрыты route-тестами: request/verify/me/logout,
  400/401/429, trusted/non-trusted XFF, dev-адаптер в production.
- Commit SHA: review `9ee2360`; merge `d3e42b7` (PR #12).
- Ревью: независимый `scrum-reviewer`, **APPROVE**; blocking P1 нет.

## Границы

- Работать только в task worktree, ветка `task/S1-1-phone-auth`.
- Не пушить, не мержить, не менять main.
- Не добавлять зависимость без записи в отчёт.
- При дыре в спеке — стоп, вопрос оркестратору.

## Addendum после ревью (P1/P2)

- [x] P1: два независимых лимитера на request-code — телефон 5/мин и IP
      20/мин (не пара); verify-code — 10/мин на IP+phone; 429 generic;
      тесты на каждый лимит.
- [x] P1: `trustProxy` для Fastify за Caddy; зафиксировать в env.
      Заменено Addendum 2: принимается только explicit IP/CIDR Caddy,
      `TRUST_PROXY=true` отклоняется.
- [x] P2: DB-backed тесты `auth.service` на valid / wrong / expired /
      consumed / 5 attempts / первый и повторный вход; в БД только хеш.
      Использовать `DATABASE_URL_TEST`; CI уже поднимает Postgres.
- [x] P2: вне `test` не использовать публичные dev-секреты; требовать
      `JWT_SECRET`/`OTP_SECRET`, отклонять известные плейсхолдеры;
      обновить `.env.example`.
- [ ] P3 (S1-5): cleanup expired/consumed OTP, rollback SQL миграции,
      метрики auth. Перенесено в `docs/tasks/backlog.md`.

## Addendum 2 после повторного ревью

- [x] P1: `trustProxy` не boolean true. Принимать только explicit IP/CIDR
      Caddy в `TRUST_PROXY`; `true` отклонять; вне production default
      false. Тесты: trusted remote + XFF учитывается, non-trusted remote
      + поддельный XFF не обходит IP-лимит.
- [x] P3: пустые `JWT_SECRET=`/`OTP_SECRET=` в `.env.example` не валят
      `NODE_ENV=test`; `ci-only` в запрещённых плейсхолдерах; 429 в
      response schema verify-code.
- [x] P3: IPv6 нормализуется через `normalizeIP` в ключе IP+phone.

## Итог ревью

- Вердикт: **APPROVE** на `9ee2360`; blocking P0/P1 нет.
- P2 (S1-5, не блокирует): `TRUST_PROXY=false`/`/0` в production —
  конфигурационный footgun для IP-лимита; тест TTL-константы 5 минут;
  тест отсутствия телефона/кода в логах; `DATABASE_URL` fail-fast в
  production; seed demo-user из design.
- P3 (S1-5/бэклог): OTP cleanup/retention, rollback SQL, auth-метрики,
  design.md про лимиты, evidence и addenda оформлены.
- Занесено в `docs/tasks/backlog.md`; S1-2 не расширять.

