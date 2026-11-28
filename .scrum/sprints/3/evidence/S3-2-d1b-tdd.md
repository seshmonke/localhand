# S3-2-D1b: shop delivery origin happy path — TDD evidence

Scope: `/admin/shop` "Доставка" card — debounced city search (300 ms,
≥2 chars, one request per full query), city/PVZ selects, saved prefill,
save via `updateShop`, point reset on city change, PVZ required,
save-error mapping, PVZ `aria-invalid`/`aria-describedby`, no clickable
placeholder once a city is chosen. Error/loading/empty/retry/clear body
states stay in D1c. Fixtures match fake-provider: СПб=137, Казань=447.

RED: `S3-2-d1b-tdd-red.txt` — original 2 failed | 6 passed (8); review
fix 2 failed | 7 passed (9).
GREEN: `S3-2-d1b-tdd-green.txt` — review fix 9 passed (9).

| AC | Test |
|---|---|
| Saved city/point on load + save (`seller-shop` "Сохранение") | `AdminShopPage > shows the saved shipping city and PVZ and saves a new origin` |
| PVZ required + save error visible, fields kept (502) | `AdminShopPage > requires a PVZ and reports a save error` |
| Debounce: one city request with full value; PVZ still loads | `AdminShopPage > debounces city search and still loads PVZ after a city change` |

Verify: `S3-2-d1b-verify.txt` — `pnpm verify` exit 0; 23 web test files,
170 tests (169 baseline + 1 new debounce), 540 tracked.
