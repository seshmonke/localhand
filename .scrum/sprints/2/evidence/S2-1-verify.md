# Evidence: S2-1 catalog discovery

Дата: 27.11.2026. Ветка `task/S2-1-catalog`, review HEAD `7b42080`,
merge `7ab658e` (PR #26). Change `03-catalog-discovery` (архив
`2026-11-27-03-catalog-discovery`), tasks 1.1–1.4.

## Verify

Команда (тестовая БД S2):

```bash
export PATH="$HOME/.local/bin:$PATH"
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

```text
Public repo check: 267 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  5 passed (5)
packages/shared test:       Tests  55 passed (55)
apps/web test:         Test Files  9 passed (9)
apps/web test:              Tests  47 passed (47)
apps/api test:         Test Files 13 passed (13)
apps/api test:              Tests 134 passed (134)
openspec validate --all --strict
Totals: 7 passed, 0 failed (7 items)
```

Лог verify снят до добавления evidence; на финальном дереве
(273 tracked files) check:public — clean.

## Browser smoke

Playwright + axe-core, light, 320/1440:
4 карточки, поиск «куртка» → 1, `q` в URL, `sort=price_asc` в URL,
overflow 0, axe 0 violations; console 404 в 320 — служебный
favicon, на функциональность не влияет. Raw:
[S2-1-browser.json](S2-1-browser.json).

- [catalog 1440](S2-1-catalog-1440.png)
- [catalog 1440 search](S2-1-catalog-1440-search.png)
- [catalog 320](S2-1-catalog-320.png)
- [catalog 320 search](S2-1-catalog-320-search.png)

## Review

- Независимый `scrum-reviewer`: **APPROVE**.
- P2 NUL q → 400, P3 id/page/focus/reset/nav закрыты в `7b42080`;
  повторное ревью — **APPROVE**.

## Остаточные P3

- Каталожный skeleton/ShopPage loading без role/status.
- `ProductListResponse` deprecated.
- Catalog без rate-limit; `q` в access-log; 500-хендлер без error id.
- ILIKE без индекса, offset-пагинация — принято v1.
- PR size > 400 (тесты).

## Rollback

Revert squash `7ab658e`; change вернуть из архива; миграций нет.
