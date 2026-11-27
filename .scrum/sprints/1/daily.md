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
  `check:public` чист. Лог: `/tmp/opencode/S1-1-verify-resume.log`.
- PR #12: `verify` + `review-gate` зелёные, squash-merge `d3e42b7`.
- S1-1 закрыт; tasks 1.1–1.6 отмечены.

## Cycle 2 — 27.11.2026

### S1-2 Seller shop

- Сделано: —
- Дальше: API создания/редактирования/публикации своего магазина,
  уникальный slug, authz-тесты.
- Блокеры: нет.
