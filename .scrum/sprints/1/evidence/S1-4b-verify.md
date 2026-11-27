# Evidence: S1-4b seller products admin UI

Дата: 27.11.2026. Ветка `task/S1-4b-admin-products`, review HEAD
`5789450`, merge `3753a1b` (PR #20). Change `02-seller-onboarding`,
tasks 4.4–4.5.

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
Public repo check: 219 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  4 passed (4)
packages/shared test:       Tests  33 passed (33)
apps/web test:         Test Files  6 passed (6)
apps/web test:              Tests  34 passed (34)
apps/api test:         Test Files 11 passed (11)
apps/api test:              Tests  97 passed (97)
build: shared/api/web/ui — Done
openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

Web suite дополнительно прогнан 3 раза подряд — 34/34 стабильно.

## Browser smoke (local preview)

Сценарий: login dev-OTP → `/admin/products` → create `1234,50` →
draft → publish → товар виден в `/api/shops/:slug`.

- 320: список карточками, форма в одну колонку, overflow=false.
- 1440: таблица, форма + статус-панель.
- Скриншоты:
  - [products 1440](S1-4b-products-1440.png)
  - [products 320](S1-4b-products-320.png)
  - [new 1440](S1-4b-new-1440.png)
  - [new 320](S1-4b-new-320.png)
  - [edit 1440](S1-4b-edit-1440.png)

## A11y

- axe-core 4.14.1, Chromium, WCAG 2.1/2.2 AA; raw:
  [S1-4b-axe.json](S1-4b-axe.json).
- 10 сканов: products/new/edit × 320/1440, light; products/new ×
  320/1440, dark — 0 violations.
- Таблица и карточки взаимно скрыты (`display:none`), caption/thead/th,
  labels, aria-invalid/describedby, focus после ошибки.

## Review

- Независимый `scrum-reviewer`: **APPROVE**.
- P2 session-expired login loop закрыт `SessionExpiredState` + тесты;
  повторное ревью — **APPROVE**.

## Остаточные P3

- 401 на мутациях create/save/status — inline-сообщение без авто-
  перехода на login.
- Формат цены `1 234,5 ₽` (нет второго знака) — правка `formatRubles`
  отдельным PBI.
- Нет axe edit-dark и empty/error/no-shop состояний.
- Focus-ring контейнера ошибки не виден.
- Гонка перезаписи `values` при save (поля не блокируются).
- `imageUrl` без проверки схемы URL.
- Perf: admin-код не code-split, LCP не измерен.

## Rollback

Revert squash-коммита `3753a1b`; миграций нет.
