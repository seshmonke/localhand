# Evidence: S2-3 checkout & orders

Дата: 27.11.2026. Ветки `task/S2-3a-checkout-api` (HEAD `b304ce7`),
`task/S2-3b-orders-ui` (HEAD `966a39f`); merge `b909f30` (PR #30) и
`2849d8c` (PR #31). Change `05-checkout-orders` (архив
`2026-11-27-05-checkout-orders`), tasks 3.1–3.7, 4.1–4.5.

## Verify

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

```text
Public repo check: 315 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  7 passed (7)
packages/shared test:       Tests 100 passed (100)
apps/web test:         Test Files 19 passed (19)
apps/web test:              Tests 114 passed (114)
apps/api test:         Test Files 14 passed (14)
apps/api test:              Tests 148 passed (148)
openspec validate --all --strict
Totals: 7 passed, 0 failed (7 items)
```

## API (3a)

- Migration `0003`: orders/order_items, bigint total, unique
  buyer+clientCheckoutId+shop, checks, indexes, FKs;
  down SQL/runbook проверен на тестовой БД.
- `POST /checkout`: auth 401, rate-limit 10/мин, 400 (empty/dupes/>50/
  uuid/comment/NUL), 409 no partial, group per shop, snapshot name/price,
  buyer phone from session, advisory lock + in-tx replay, 201.
- `/orders/mine`, `/orders/:id`, `/seller/orders`, `/seller/orders/:id`
  authz 401/404, seller no-shop empty; PII только buyer/seller.
- Orders DB 14/14: multi-shop, bigint 4 294 967 294, replay third shop,
  concurrent same-key upper/lower UUID, rate-limit, product_id null.

## UI (3b)

- `/checkout` BuyerGuard, login next, summary/comment, stable
  clientCheckoutId per composition, double-submit, 201 clear only
  ordered + `/orders`, 409 no clear, 401 neutral.
- `/orders`, `/orders/:id`, `/admin/orders`, `/admin/orders/:id`;
  seller table/cards, no-shop onboarding; AdminShell orders link.
- safeNext `/admin|/checkout|/orders|/orders/:id`, open redirect/loop.
- Real browser smoke: buyer add→login→checkout→order; seller sees
  order; 320 overflow=false.
- Axe 28 сканов light/dark 0 (raw:
  [S2-3-axe.json](S2-3-axe.json)); bundle 553.5 kB / 157.4 gzip
  (+3.3%, в бюджете S2-4).
- Скриншоты:
  - [checkout 1440](S2-3-checkout-1440.png)
  - [orders 1440](S2-3-orders-1440.png)
  - [orders 320](S2-3-orders-320.png)
  - [seller orders 1440](S2-3-admin-orders-1440.png)

## Review

- `scrum-reviewer`: **APPROVE** 3a/3b после P2 bigint, lock-scope,
  idempotency/UUID, header/спека, buyer-401 copy, checkoutId test.

## Остаточные P3

- Orders pagination; Cache-Control no-store/metrics; shops read-only
  TOCTOU; test helper negative hash; silent DB skip; formatRubles
  1 decimal; bundle/LCP S2-4.

## Rollback

Revert squash `b909f30`/`2849d8c`; change из архива; migration down
runbook (`docs/stack/runbooks/orders-rollback.md`).
