# Evidence: S1-4a seller auth + shop UI

Дата: 27.11.2026. Ветка `task/S1-4a-admin-auth`, review HEAD `aca0448`,
post-approval none, merge `f991c93` (PR #18). Change
`02-seller-onboarding`, tasks 4.1–4.3 + применимые 4.5.

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
Public repo check: 200 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  4 passed (4)
packages/shared test:       Tests  33 passed (33)
apps/web test:         Test Files  3 passed (3)
apps/web test:              Tests  15 passed (15)
apps/api test:         Test Files 11 passed (11)
apps/api test:              Tests  97 passed (97)
build: shared/api/web/ui — Done
openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

Лог снят до добавления evidence; на финальном дереве (206 tracked
files) `node scripts/check-public-repo.mjs` — clean.

## Browser smoke (local preview)

Сценарий: `/login` → вымышленный тестовый номер → dev-OTP из ответа
API → `/admin/shop` → create shop → publish → статус published.

- 320×568: горизонтального overflow нет, форма в одну колонку.
- 1440×900: sidebar + split-view формы/статуса.
- Скриншоты:
  - [admin 1440](S1-4a-admin-1440.png)
  - [admin 320](S1-4a-admin-320.png)
  - [login 1440](S1-4a-login-1440.png)
  - [login 320](S1-4a-login-320.png)
  - [dark onboarding](S1-4a-onboarding-dark.png)

## A11y

- axe-core 4.14.1, Chromium, WCAG 2.1/2.2 AA. Raw:
  [S1-4a-axe.json](S1-4a-axe.json) — 9 сканов, `testEngine` 4.14.1,
  tags wcag2a/2aa/21a/21aa/22a/22aa.
- Light: `/login` 320/1440, `/admin/shop` 320/1440, `/admin/products`
  1440 — 0 violations.
- Dark (`data-theme="dark"`): `/login` 320/1440, `/admin/shop`
  onboarding 320/1440 — 0 violations.
- Focus полей — контрастный ink-ring; ошибки текстом + иконкой,
  aria-invalid/aria-describedby, aria-live.
- Скрипт — локальный (вне репо); axe-гейт в CI — carry-over S1-5.

## Security

- httpOnly cookie не читается; все запросы `credentials: "include"`.
- `safeNext` допускает только `/admin`/`/admin/...`; external и loop
  (`/login?next=/login`) отсекаются.
- Seller-кэш очищается при login, 401 guard и logout; регрессионный тест
  с production-like `staleTime` и данными магазина A.
- Blocked-магазин read-only; publish disabled при несохранённых полях.

## Review

- Независимый `scrum-reviewer`: **APPROVE** после двух раундов фиксов.
- P1 cross-account cache leak, P2 light/dark contrast закрыты;
  повторное ревью — **APPROVE**.

## Остаточные P3

- `packages/ui` button focus ring остаётся оранжевым (follow-up S1-5).
- axe — локальный скрипт, в CI a11y-гейта нет.
- inverse-aside login без границы в dark-теме.
- perf/LCP/observability UI не измерены; admin-код в основном чанке.
- тестовый harness по умолчанию `staleTime: 0`; guard/logout cache-пути
  покрыты только частично.

## Rollback

Revert squash-коммита `f991c93`; миграций нет.
