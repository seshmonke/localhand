# Evidence: S2-4 security, e2e, close

Дата: 27.11.2026. Ветка `task/S2-4-security`, review HEAD `fd327a7`,
merge `8b748b2` (PR #33). PBI S2-4, Sprint 2.

## Verify

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

```text
Public repo check: 333 tracked files, no secrets/PII patterns found
packages/shared: 8 files / 103 tests passed
apps/web:        19 files / 114 tests passed
apps/api:        16 files / 156 tests passed
openspec validate --all --strict: 7 passed, 0 failed
```

## API e2e

- `buyer-flow.db.test.ts`: dev OTP → 2 shops/products → checkout 2 orders
  → buyer/seller own, second buyer/seller 404, no-shop [], 401 all,
  `Cache-Control: no-store`, snapshot/replay.
- `orders.logs.test.ts`: source + runtime (forced 500 и success-path)
  без phone/comment/code; реальный pino-stream.
- 7/7; тестовая БД guard `_test`, CI fail-fast, SMS preflight `dev`.

## Browser e2e (локальный гейт)

- Playwright `apps/web/e2e`, `pnpm test:e2e`; preview 3/3, dev 3/3.
- Buyer: поиск → товар → корзина → guest login → checkout → order →
  `/orders`; seller `/admin/orders` видит заказ.
- Browser e2e не в CI: зафиксировано в `apps/web/e2e/README.md`; CI —
  API e2e в `pnpm verify`.
- Логи: [S2-4-e2e-preview.log](S2-4-e2e-preview.log),
  [S2-4-e2e-dev.log](S2-4-e2e-dev.log).

## A11y

- axe-core 4.14.1 через `@axe-core/playwright` (devDep, не runtime):
  16 сканов catalog/cart/checkout/orders × 320/1440 × light/dark — 0.
- Raw: [S2-4-axe.json](S2-4-axe.json).

## Perf

- Lab LCP, CDP Slow 4G + CPU 4x, mobile 390×844, 5 прогонов.
- **Preview:** `/` 508 ms, `/checkout` 688 ms, gate enforced <2500
  ([S2-4-lcp-preview.json](S2-4-lcp-preview.json)).
- **Dev (unbundled):** 2720/2772 ms — info-only, gate off
  ([S2-4-lcp-dev.json](S2-4-lcp-dev.json)).
- Bundle 553.65 kB / 157.42 gzip, +0.03% к S2-3
  ([S2-4-bundle.json](S2-4-bundle.json)).

## Owner decision (DoD LCP)

Владелец 27.11.2026 выбрал: **lab/preview LCP-гейт <2500 ms —
owner-approved DoD-прокси v1; field p75/RUM — бэклог до публичного
запуска.** Sprint 2 закрывается с этим явным исключением, не как
«field p75 выполнен».

## Review

- `scrum-reviewer`: **APPROVE** после P1 preview-gate, P2 SMS/preflight,
  API safety; field p75 — owner exception.

## Остаточные P3

- Field RUM/p75; admin axe; Cache-Control spec; `/auth/me` no-store;
  source-audit heuristic; browser e2e не в CI; PR size.

## Rollback

Revert squash `8b748b2`; миграций нет.
