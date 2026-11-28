# Handoff: Sprint 3 закрыт, delivery test contour в main

Дата: 28.11.2026.

## Состояние

- `main`: после merge close PR Sprint 3.
- Sprint 1/2/3 закрыты. Sprint 3 review ACCEPT; S3-1 payments и
  S3-2 delivery приняты, S3-3/S3-4 перенесены в Sprint 4.
- Changes `01`–`07` в архиве; `openspec/specs/` содержит
  storefront, phone-auth, seller-shop, product-management,
  catalog-discovery, cart, checkout-orders, payments, delivery.
- ЮKassa/СДЭК — fake/test contour; реальные деньги, ключи, адреса и
  ПДн не использовались.
- Browser e2e: 13 passed; axe 24×0; preview LCP 580/756/928 ms.
- API 394, web 220, shared 161 на close; `pnpm verify` exit 0.

## Следующий шаг

1. Upgrade `scrum-crew` до released `v0.5.0` по
   `references/upgrade.md`, отдельным PR; safe point: `sprint: null`,
   чистое дерево.
2. Sprint 4 planning только по команде владельца: S3-3 lifecycle,
   S3-4 hardening, Q1.1/Q1.2; live-интеграции и юрпакет — owner-гейты.
3. Owner-gates до публичного MVP: YooKassa adapter/keys, CDEK
   contract/live PII, юрпакет, Selectel deploy/SMS.

## Полезное

- `docs/tasks/03-money-path.md` — Sprint 3 (CLOSED).
- `openspec/changes/archive/2026-11-28-07-delivery` — delivery change.
- `docs/stack/adr/0005-delivery.md`, runbooks delivery-*.
- `.scrum/sprints/3/review.md`, `retro.md`, `daily.md`, `evidence/`.
- Preview: `pnpm db:up && pnpm dev` → web 5173, API 3000, DB 5433.
- Browser e2e — локальный гейт (`pnpm test:e2e`), не CI.

## Ограничения

- Реальные SMS/платежи/доставка/ПДн — только с владельцем и юрпакетом.
- Sprint 4 не начат без команды.
