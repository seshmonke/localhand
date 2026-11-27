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

- Сделано: контракты product-admin, `GET/POST/PATCH /seller/products`,
  publish/hide, ownership 404, int4/NUL validation, DB-тесты.
- Ревью: **APPROVE**; P2 int4/NUL и P3 no-op publish закрыты в `4e4da27`.
- `pnpm verify`: exit 0; API 97/97, shared 33/33, web 1/1, OpenSpec 2/2.
- PR #16 squash-merge `b728eda`; evidence:
  [evidence/S1-3-verify.md](evidence/S1-3-verify.md).
- S1-3 закрыт; tasks 3.1–3.4 отмечены. Блокеров нет.

### Итог синка

- Продолжаем: S1-3 → merge → S1-4a admin auth/shop UI.
- Перепланирование не нужно; S1-4 делим на 4a и 4b.
- Эскалаций нет; владелец не требуется.

## Cycle 4 — 27.11.2026

### S1-4a Admin auth + shop UI

- Сделано: API client с cookie, `/login` OTP, guard `/admin`, admin
  shell, onboarding/settings/publish, blocked read-only, cache isolation,
  responsive/a11y.
- Ревью: **APPROVE**; P1 cross-account cache, P2 light/dark contrast
  закрыты; axe 0 violations light/dark.
- `pnpm verify`: exit 0; API 97/97, shared 33/33, web 15/15, OpenSpec 2/2.
- PR #18 squash-merge `f991c93`; evidence:
  [evidence/S1-4a-verify.md](evidence/S1-4a-verify.md),
  скриншоты 320/1440 и dark в `evidence/`.
- 4a закрыт; tasks 4.1–4.3 отмечены. Блокеров нет.

### Итог синка

- Продолжаем: 4a → merge → S1-4b products UI.
- Перепланирование не нужно.
- Эскалаций нет; владелец не требуется.

## Cycle 5 — 27.11.2026

### S1-4b Products admin UI

- Сделано: список/таблица/карточки, create/edit, publish/hide/draft,
  цена рубли↔копейки, PATCH diff, session-expired cache clear,
  responsive/a11y.
- Ревью: **APPROVE**; P2 session-login fixed `5789450`.
- `pnpm verify`: exit 0; API 97/97, shared 33/33, web 34/34, OpenSpec 2/2.
- Browser smoke: create 1234,50 → publish → виден в storefront API;
  320 без
  overflow. Axe light/dark 10 сканов, 0 violations.
- PR #20 squash-merge `3753a1b`; evidence:
  [evidence/S1-4b-verify.md](evidence/S1-4b-verify.md).
- S1-4 закрыт; tasks 4.4–4.5 отмечены. Блокеров нет.

### Итог синка

- Продолжаем: S1-4 закрыт → S1-5 security/evidence/archive.
- Перепланирование не нужно.
- Эскалаций нет; владелец не требуется.

## Cycle 6 — 27.11.2026

### S1-5 Security, evidence, docs, archive

- Сделано: real-DB e2e seller flow, authz/401, log privacy test,
  ADR 0002 phone auth/SMS, legal-раздел, evidence + browser-smoke;
  P1 card-overlap на 320 исправлен.
- Ревью: **APPROVE**; P3 ADR/e2e guards закрыты; повторное — **APPROVE**.
- `pnpm verify`: exit 0; API 102/102, shared 33/33, web 35/35,
  OpenSpec 4/4 strict.
- PR #22 squash-merge `64a2b30`; evidence:
  [evidence/S1-5-verify.md](evidence/S1-5-verify.md).
- Change `02-seller-onboarding` заархивирован
  (`2026-11-27-02-seller-onboarding`); specs phone-auth/seller-shop/
  product-management созданы.
- S1-5 закрыт; tasks 5.1–5.5 отмечены. Блокеров нет.

### Итог синка

- Sprint 1 **закрыт**: Sprint Goal достигнут, ACCEPT.
- Ретро и действия записаны в `retro.md`.
- Следующий — планирование Sprint 2 (buyer-core) по standing
  authorization.
- Эскалаций нет; владелец не требуется.
