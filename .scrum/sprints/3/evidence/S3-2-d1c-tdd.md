# S3-2-D1c: shop origin states — TDD evidence

Scope: `/admin/shop` "Доставка" — loading/empty/429/502/generic errors,
retry buttons, live status announcements, saved-point fallback and
clear-origin (`cdekCityCode: null`). Marks `07-delivery` task 2.5 `[x]`.
Merged with main `618fdda`; B fix (debounce 300 ms, onError, placeholder,
PVZ aria, fixtures 137/447) preserved.

RED: `S3-2-d1c-tdd-red.txt` — on B-fix page: 3 failed | 9 passed (12).
GREEN: `S3-2-d1c-tdd-green.txt` — 12 passed (9 B + 3 C).

| AC | Test |
|---|---|
| Empty city result + 429 `rate_limited` + retry | `AdminShopPage > shows an empty city result and a rate-limit error with retry` |
| PVZ loading + 502 `delivery_unavailable` + retry | `AdminShopPage > shows PVZ loading, maps delivery_unavailable and retries` |
| Clear origin sends nulls (`seller-shop` city/point removal) | `AdminShopPage > clears the shipping origin and sends nulls` |
| B fix not regressed (debounce, onError, save fields) | `debounces city search...`, `requires a PVZ and reports a save error`, `saves a new origin` |

Verify: `S3-2-d1c-verify.txt` — `pnpm verify` exit 0; 24 web files,
179 tests, 552 tracked.
