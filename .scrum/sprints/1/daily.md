# Sprint 1 daily

Формат: до синка активные WIP-владельцы пишут 3 строки; оркестратор
дописывает итог. Live-встречи нет — режим async, владелец подключается
на гейтах и эскалациях.

## Cycle 1 — 27.11.2026

### S1-1 Phone auth

- Сделано: OTP, users/otp_codes/sellers.user_id, JWT-cookie,
  `/auth/me`, logout, rate-limit, dev/SMS.ru адаптеры; тесты.
- Дальше: независимый review, PR, merge; затем S1-2 shop.
- Блокеры: нет.

### Итог синка

- Продолжаем: S1-1 → review → merge.
- Перепланирование не нужно.
- Эскалаций нет; владелец не требуется.

### Финал цикла

- Повторное ревью после `b467306`: **APPROVE**, blocking P1 trustProxy
  закрыт; P2/P3 перенесены в S1-5/бэклог.
- `pnpm verify` (DATABASE_URL_TEST): exit 0; API 58/58, shared 8/8,
  web 1/1, build OK, `openspec validate --all --strict` 2/2,
  `check:public` чист. Evidence:
  [evidence/S1-1-verify.md](evidence/S1-1-verify.md).
- PR #12: `verify` + `review-gate` зелёные, squash-merge `d3e42b7`.
- S1-1 закрыт; tasks 1.1–1.6 отмечены.

## Cycle 2 — 27.11.2026

### S1-2 Seller shop

- Сделано: контракты shop/slug, общий session guard, `GET/POST/PATCH
  /seller/shop`, ленивый seller, публикация, blocked read-only, тесты.
- Ревью: **APPROVE**; P2-1 blocked и P2-2 смена slug закрыты в `a5f67f1`.
- `pnpm verify`: exit 0; API 78/78, shared 18/18, web 1/1, OpenSpec 2/2.
- PR #14 squash-merge `11ca2c0`; evidence:
  [evidence/S1-2-verify.md](evidence/S1-2-verify.md).
- S1-2 закрыт; tasks 2.1–2.4 отмечены. Блокеров нет.

### Итог синка

- Продолжаем: S1-2 → review → merge → S1-3.
- Перепланирование не нужно.
- Эскалаций нет; владелец не требуется.

## Cycle 3 — 27.11.2026

### S1-3 Products

- Статус: `in_progress`, owner `scrum-worker`; ветка `task/S1-3-products`,
  lease до 04:30Z.
- Дальше: контракты product-admin, `GET/POST/PATCH /seller/products`,
  publish/hide, authz только своего магазина, тесты.
- Блокеры: нет.
