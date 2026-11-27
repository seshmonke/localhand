# Evidence: S1-3 seller products

Дата: 27.11.2026. Ветка `task/S1-3-products`, review HEAD `b12fe79`,
merge `b728eda` (PR #16). Change `02-seller-onboarding`, tasks 3.1–3.4.

## Verify

Команда (секреты — тестовые, не прод):

```bash
export PATH="$HOME/.local/bin:$PATH"
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s1_3_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

Хвост вывода:

```text
Public repo check: 188 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  4 passed (4)
packages/shared test:       Tests  33 passed (33)
apps/web test:         Test Files  1 passed (1)
apps/web test:              Tests  1 passed (1)
apps/api test:         Test Files  11 passed (11)
apps/api test:              Tests  97 passed (97)
build: shared/api/web/ui — Done
openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

## DB-backed scenarios

- 401 без сессии на всех seller-product ручках.
- Пустой список без магазина; 409 `shop_required` на create.
- Create всегда draft, игнор присланного `status`; границы полей/цены;
  int4 overflow id → 400; NUL в тексте → 400 без записи.
- Список только своего магазина, все статусы, `updated_at desc`.
- Publish только при published-магазине; 409 `shop_not_published`;
  hide/draft всегда; повторное сохранение already-published при draft-
  магазине → 200 и скрыто на витрине.
- Витрина `/catalog/products`, `/shops/:slug`, `/products/:id`;
  снятие магазина скрывает все товары, повторная публикация возвращает.
- Чужой/несуществующий id → 404 без изменений.

## Review

- Независимый `scrum-reviewer`: **APPROVE**.
- P2-1 int4 overflow, P2-2 NUL, P3 no-op publish закрыты в `4e4da27`;
  повторное ревью — **APPROVE**.
- Post-approval `b12fe79` — docs-only: publish-переход уточнён в спеке,
  design и брифе.
- Остаточные P3: TOCTOU publish (S1-5), `imageUrl: ""`, пагинация/
  rate-limit, storefront id/SQL в non-prod, skip DB-тестов без env.

## Preview / smoke

S1-3 — backend-only; seller products UI появляется в S1-4b. Проверены
HTTP-контракты и витрина через `fastify.inject`; preview-сценарий
не применим.

## Rollback

Revert squash-коммита `b728eda`; миграций в S1-3 нет.
