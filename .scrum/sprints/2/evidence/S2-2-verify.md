# Evidence: S2-2 cart

Дата: 27.11.2026. Ветка `task/S2-2-cart`, review HEAD `de118f2`,
merge `92b4b9d` (PR #28). Change `04-cart` (архив
`2026-11-27-04-cart`), tasks 2.1–2.4.

## Verify

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

```text
Public repo check: 290 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  6 passed (6)
packages/shared test:       Tests  70 passed (70)
apps/web test:         Test Files 15 passed (15)
apps/web test:              Tests  87 passed (87)
apps/api test:         Test Files 13 passed (13)
apps/api test:              Tests 134 passed (134)
openspec validate --all --strict
Totals: 7 passed, 0 failed (7 items)
```

Web suite 3× подряд — 87/87; LoginPage-флейк исправлен `waitFor`.

Лог verify снят до добавления evidence; на финальном дереве
(295 tracked files) check:public — clean.

## A11y / browser

- `/cart` 320/1440, каталог 320/1440: axe-core 4.14.1 — 0 violations,
  nested-interactive 0, overflow 0 (raw-отчёт не сохранён; ручная
  Playwright-проверка + скриншоты).
- Длинные неразрывные имена товара/магазина: scrollWidth=320/1440;
  «Керамическая кружка» переносится по словам, не внутри.
- Remove на mobile — 44×44 icon-only с aria-label; на desktop с текстом.
- Скриншоты:
  - [cart 320](S2-2-cart-320.png)
  - [cart 1440](S2-2-cart-1440.png)
  - [long names 320](S2-2-cart-long-320.png)
  - [catalog 320](S2-2-catalog-320.png)

## Review

- Независимый `scrum-reviewer`: **APPROVE**.
- P1 nested-interactive и 320 overflow закрыты; P3 word-split/aria
  закрыты; повторное ревью — **APPROVE**.

## Остаточные P3

- Stale closure двух add в одной задаче; hydration race; header cart
  32×44; focus после remove; ProductPage h1 long name; PR size.

## Rollback

Revert squash `92b4b9d`; change вернуть из архива; миграций нет.
