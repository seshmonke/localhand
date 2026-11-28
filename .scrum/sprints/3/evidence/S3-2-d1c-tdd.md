# S3-2-D1c: shop origin states — TDD evidence

Scope: `/admin/shop` "Доставка" — loading/empty/429/502/generic errors,
retry buttons, live status announcements, saved-point fallback and
clear-origin (`cdekCityCode: null`). Marks `07-delivery` task 2.5 `[x]`.
Merged with main `618fdda`; B fix (debounce 300 ms, onError, placeholder,
PVZ aria, fixtures 137/447) preserved.

RED: `S3-2-d1c-tdd-red.txt` — review P2: 2 failed | 13 passed (15).
GREEN: `S3-2-d1c-tdd-green.txt` — 15 passed (9 B + 6 C).

| AC | Test |
|---|---|
| Empty city result + 429 `rate_limited` + retry | `shows an empty city result and a rate-limit error with retry` |
| PVZ loading + 502 `delivery_unavailable` + retry | `shows PVZ loading, maps delivery_unavailable and retries` |
| Clear origin sends nulls | `clears the shipping origin and sends nulls` |
| Generic city 500 -> alert + retry | `shows live city status and a generic city error with retry` |
| Empty PVZ text + points live status | `shows an empty PVZ status` |
| Saved PVZ gone -> warning, no stale fallback, no PATCH | `warns when the saved PVZ disappears and blocks saving it` |
| PVZ required: no PATCH, `aria-invalid` only for this case | `requires a PVZ and reports a save error` |

Saved-point semantics: fallback option only while points are pending/error;
on a successful list without the saved point the select clears, a warning
appears, and save requires a new PVZ. 429/502/network save errors set
`deliveryError` but not `aria-invalid`.

Verify: `S3-2-d1c-verify.txt` — `pnpm verify` exit 0; 24 web files,
182 tests, 552 tracked.
