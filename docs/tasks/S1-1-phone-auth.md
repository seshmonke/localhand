# Task S1-1: Phone auth backend

## Цель

Продавец может запросить OTP по российскому номеру, подтвердить его,
получить httpOnly-сессию, прочитать `/auth/me` и выйти. Backend +
контракты + миграция + тесты. UI логина — S1-4, здесь нет.

## AC

- [ ] Миграция: `users` (id, phone unique, created_at), `otp_codes`
      (id, phone, code_hash, expires_at, attempts, consumed_at, created_at,
      индекс phone+created_at), `sellers.user_id` (nullable unique FK).
- [ ] `packages/shared`: Zod-контракты auth (phone, code, user, responses).
- [ ] `POST /auth/request-code`: нормализует российский номер, создаёт
      OTP, отправляет через `SmsProvider`, отвечает 200 одинаково для
      нового/старого номера; невалидный номер — 400; лимит — 429.
- [ ] `POST /auth/verify-code`: проверяет хеш/TTL/попытки, создаёт
      `users` при первом входе, выдаёт httpOnly cookie `lh_session`
      (JWT, 7 дней), возвращает user; ошибка — generic 401.
- [ ] `GET /auth/me`: 200 с user по cookie, 401 без/с протухшей.
- [ ] `POST /auth/logout`: очищает cookie.
- [ ] OTP: 6 цифр, HMAC-SHA256 с `OTP_SECRET`, TTL 5 минут, 5 попыток,
      не хранится открытым текстом.
- [ ] SMS-провайдер: интерфейс `SmsProvider`; `dev` adapter для preview
      (возвращает `devCode` только вне production); `smsru` adapter по
      `SMSRU_API_ID`; production с `SMS_PROVIDER=dev` падает на старте.
- [ ] Тесты: валидный/неверный/просроченный код, лимит, нет cookie,
      dev в production, нормализация номера.
- [ ] `pnpm verify` в worktree — зелёный.

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

- `pnpm verify` — вывод и exit code.
- `openspec validate 02-seller-onboarding --strict`.
- curl-примеры: request/verify/me/logout; 401/429.
- Список файлов и commit SHA.

## Границы

- Работать только в `/tmp/opencode/localhand-S1-1`, ветка
  `task/S1-1-phone-auth`.
- Не пушить, не мержить, не менять main.
- Не добавлять зависимость без записи в отчёт.
- При дыре в спеке — стоп, вопрос оркестратору.

## Addendum после ревью (P1/P2)

- [ ] P1: два независимых лимитера на request-code — телефон 5/мин и IP
      20/мин (не пара); verify-code — 10/мин на IP+phone; 429 generic;
      тесты на каждый лимит.
- [ ] P1: `trustProxy` для Fastify за Caddy; зафиксировать в env
      (`TRUST_PROXY=true` в prod) и не доверять заголовку вне прокси.
- [ ] P2: DB-backed тесты `auth.service` на valid / wrong / expired /
      consumed / 5 attempts / первый и повторный вход; в БД только хеш.
      Использовать `DATABASE_URL_TEST`; CI уже поднимает Postgres.
- [ ] P2: вне `test` не использовать публичные dev-секреты; требовать
      `JWT_SECRET`/`OTP_SECRET`, отклонять известные плейсхолдеры;
      обновить `.env.example`.
- [ ] P3 (можно в S1-5): cleanup expired/consumed OTP, rollback SQL
      миграции, метрики auth. Зафиксировать в отчёте, не блокировать P1.

