# Evidence: S1-2 seller shop

Дата: 27.11.2026. Ветка `task/S1-2-shop`, review HEAD `ef819f3`,
merge `11ca2c0` (PR #14). Change `02-seller-onboarding`, tasks 2.1–2.4.

## Verify

Команда (секреты — тестовые, не прод):

```bash
export PATH="$HOME/.local/bin:$PATH"
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s1_2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

Хвост вывода:

```text
Public repo check: 180 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  3 passed (3)
packages/shared test:       Tests  18 passed (18)
apps/web test:         Test Files  1 passed (1)
apps/web test:              Tests  1 passed (1)
apps/api test:         Test Files  10 passed (10)
apps/api test:              Tests  78 passed (78)
build: shared/api/web — Done
openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

## DB-backed scenarios

- GET null до онбординга; POST draft + seller `user_id`.
- Повторный POST → 409 `shop_exists`; чужой slug → 409 `slug_taken`
  с откатом seller+shop.
- Invalid/reserved slug → 400 без создания seller.
- PATCH name/slug/description/status; смена slug → старый URL 404,
  новый 200.
- Publish → витрина 200; draft → 404; данные сохраняются.
- Blocked-магазин read-only: PATCH → 409 `shop_blocked`.
- Изоляция двух сессий; 401 без/битой/просроченной cookie и удалённого
  user.

## Review

- Независимый `scrum-reviewer`: **APPROVE**.
- P2-1 блокировка и P2-2 положительный тест slug закрыты в `a5f67f1`,
  повторное ревью — **APPROVE**.
- Остаточное P2: TOCTOU blocked-guard — закрыть conditional UPDATE/row
  lock в S1-5 вместе с модерацией.
- P3: `fileParallelism: false` (общая тестовая БД), skip DB-тестов без
  `DATABASE_URL_TEST`, looser output slug, e2e published-товаров —
  S1-3/S1-5.

## Preview / smoke

S1-2 — backend-only; seller UI появляется в S1-4. Проверены HTTP
контракты и витрина через `fastify.inject`; отдельный preview-сценарий
не применим.

## Rollback

Revert squash-коммита `11ca2c0`; новых миграций в S1-2 нет.
