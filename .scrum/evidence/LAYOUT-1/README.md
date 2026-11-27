# Evidence: LAYOUT-1 layout system

Дата: 27.11.2026. PBI LAYOUT-1, ветка `task/layout-system`, review HEAD
`e0a578f`, merge `5d91cc5` (PR #35). `No spec change`: поведение и API
не менялись.

## Verify

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' pnpm verify
```

Exit code: `0`.

```text
Public repo check: 352 tracked files (review run; final tree 380 (after lcp-results))
packages/shared: 103 passed
apps/web:        114 passed
apps/api:        156 passed
openspec validate --all --strict: 7 passed, 0 failed
```

Полный лог: [LAYOUT-verify.txt](LAYOUT-verify.txt).

## Browser e2e

- Dev: 6 passed ([LAYOUT-e2e-dev.txt](LAYOUT-e2e-dev.txt)).
- Preview: 5 passed, 1 skipped — guides dev-only
  ([LAYOUT-e2e-preview.txt](LAYOUT-e2e-preview.txt)).
- Preview LCP: `/` 532 ms, `/checkout` 720 ms, gate enforced <2500
  ([lcp-results.json](lcp-results.json)).
- Dev LCP: 3024/3060 ms — info-only, gate off.

## Screenshots

22 PNG: 21 layout (7 страниц — `/`, `/cart`, `/checkout`, `/orders`,
`/admin/shop`, `/admin/products/:id`, `/admin/orders` — × 320/768/1440)
плюс guides 1440. Данные вымышленные (e2e fixtures).

## Layout checks

- Header: controls и nav 44 px, центры ±1 px; CTA видна с `lg`;
  badge внутри header container.
- Admin product 1440: form/status top delta ≤1 px.
- Левые края заголовков: storefront 16/24/40; admin 16/24/300
  (сайдбар 260 + padding 40).
- `?guides=1`: 4/8/12 видимых колонок на 320/768/1440.
- Overflow: нет на всех 21 комбинациях.
- Raw: [layout-results.json](layout-results.json).

## A11y

- Admin: 12 сканов (3 страницы × 2 viewport × light/dark), 0 violations
  ([layout-axe-results.json](layout-axe-results.json)).
- Buyer: 320/1440 × light/dark — 0 serious/critical.

## Bundle

JS 550.05 kB / 157.88 gzip; CSS 40.46 / 11.06. На main было
553.65 / 157.42 — роста нет. Warning chunk >500 kB прежний.

## Review

- `scrum-reviewer`: REQUEST_CHANGES (P1 nav 16 px, P2 потерян
  `<time dateTime>`) → исправлено `e0a578f` → **APPROVE**, P3 нет.

## Остаточные P3

- CTA/меню скрыты/инертны на <lg: точки входа продавца в header на
  мобильных нет — следующий PBI.
- Badge проверяется по border-box shell, не content-box.
- Chunk >500 kB — code splitting.
- PR >400 строк — осознанное исключение для кросс-страничного layout.

## Rollback

Revert squash `5d91cc5`; миграций нет.
