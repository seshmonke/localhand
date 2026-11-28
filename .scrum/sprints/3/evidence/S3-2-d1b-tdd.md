# S3-2-D1b: shop delivery origin happy path — TDD evidence

Scope: `/admin/shop` "Доставка" card — city search/select, PVZ select,
saved city/point prefill, save via `updateShop`, point reset on city
change, PVZ required, "Город сдачи не настроен" note. Error/loading/
empty/retry/clear stay in D1c.

RED: `S3-2-d1b-tdd-red.txt` — 2 failed | 6 passed (8).
GREEN: `S3-2-d1b-tdd-green.txt` — 8 passed.

| AC | Test |
|---|---|
| Saved city/point on load + save (`seller-shop` "Сохранение") | `AdminShopPage > shows the saved shipping city and PVZ and saves a new origin` |
| No origin note + PVZ required before save (`seller-shop` "Нет ПВЗ сдачи" UX) | `AdminShopPage > requires a PVZ for a chosen city and saves the origin` |

Verify: `S3-2-d1b-verify.txt` — `pnpm verify` exit 0.
