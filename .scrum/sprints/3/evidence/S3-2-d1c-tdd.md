# S3-2-D1c: shop origin states — TDD evidence

Scope: `/admin/shop` "Доставка" — loading/empty/429/502/generic errors,
retry buttons, live status announcements, saved-point fallback and
clear-origin (`cdekCityCode: null`). Marks `07-delivery` task 2.5 `[x]`.

RED: `S3-2-d1c-tdd-red.txt` — 3 failed | 8 passed (11).
GREEN: `S3-2-d1c-tdd-green.txt` — 11 passed.

| AC | Test |
|---|---|
| Empty city result + 429 `rate_limited` + retry | `AdminShopPage > shows an empty city result and a rate-limit error with retry` |
| PVZ loading + 502 `delivery_unavailable` + retry | `AdminShopPage > shows PVZ loading, maps delivery_unavailable and retries` |
| Clear origin sends nulls (`seller-shop` city/point removal) | `AdminShopPage > clears the shipping origin and sends nulls` |

Verify: `S3-2-d1c-verify.txt` — `pnpm verify` exit 0.
