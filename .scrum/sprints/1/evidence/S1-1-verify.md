# Evidence: S1-1 phone auth

Дата: 27.11.2026. Ветка `task/S1-1-phone-auth`, review HEAD `9ee2360`,
merge `d3e42b7` (PR #12). Change `02-seller-onboarding`, tasks 1.1–1.6.

## Verify

Команда (секреты — тестовые, не прод):

```bash
export PATH="$HOME/.local/bin:$PATH"
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s1_1_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

Хвост вывода:

```text
Public repo check: 169 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  2 passed (2)
packages/shared test:       Tests  8 passed (8)
apps/api test:         Test Files  8 passed (8)
apps/api test:              Tests  58 passed (58)
apps/web test:         Test Files  1 passed (1)
apps/web test:              Tests  1 passed (1)
packages/shared build: Done
packages/ui build: Done
apps/api build: Done
apps/web build: Done
$ openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

## Review

- Независимый `scrum-reviewer`: `VERDICT: APPROVE` на `9ee2360`.
- Blocking P0/P1 нет; trustProxy-фикс проверен тестами trusted и
  non-trusted XFF.
- P2/P3 перенесены в `docs/tasks/backlog.md`; S1-2 не расширяют.

## Preview / smoke

S1-1 — backend-only: login UI появляется в S1-4. Поэтому preview-сценарий
«вход по dev-OTP в браузере» для этого PBI не применим; проверены HTTP
контракты через `fastify.inject` и DB-backed тесты. Preview smoke всего
пути — S1-4/S1-5.

## Rollback

Revert squash-коммита `d3e42b7`; миграция `0002` аддитивная, down SQL —
carry-over в бэклоге (S1-5).
