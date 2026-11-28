# S3-2-D4d: delivery P3 polish — TDD evidence

Scope: P3 items from the #74 review in `AdminDeliveryCard`, the delivery
query and the buyer `DeliverySummaryCard` legacy placeholder rows.
API, shared contracts, schema, tasks and OpenSpec are unchanged.

RED: `S3-2-d4d-tdd-red.txt` — 5 failed | 37 passed (42). Implementation
files were reverted to `7bca728` while the new tests stayed.
GREEN: `S3-2-d4d-tdd-green.txt` — 42 passed (42).
Verify: `S3-2-d4d-verify.txt` — `pnpm verify` exit 0 (web 220 passed,
shared 160, api 209 passed / 166 skipped, openspec 9/9).

| P3 | Test | RED |
|---|---|---|
| 1. Manual form hidden when `providerOrderId` exists but track is null | `does not offer the manual form when a provider order exists without a track` | already green; regression lock |
| 1. 401/404 delivery query shows no manual form | `does not offer the manual form when the delivery request fails with 401/404` | already green; regression lock |
| 2. GET retry for a network `TypeError`, not only `ApiError` 5xx | `retries a delivery request after a network error` | failed |
| 3. Polling stops after a 401/404 poll error (no 15 s hammering) | `stops polling when the delivery request fails with 401/404` | failed (4 GETs instead of 2) |
| 4. Field errors have `role="alert"` and focus moves to the first invalid input; keyboard Tab path | `validates carrier and track on the client before sending` | failed (no focus/alert) |
| 5. Buyer card hides `Не указан` legacy rows and explains the missing data | `hides placeholder city, PVZ and recipient rows for a legacy manual snapshot` | failed |
| 6. Client validation uses `useId` ids; dead `too_big` branch removed | `validates carrier and track on the client before sending` (aria-describedby equals the error id) | failed on focus; id link asserted |
| 6. Create `delivery_already_exists` refreshes and shows the conflict notice | `refreshes data when create reports delivery_already_exists` | already green; regression lock |

Notes:

- `too_big` was removed: the inputs are capped with `maxLength`, so the
  branch was unreachable; empty/invalid input is still covered.
- Polling still continues after 502/network errors; only 401/404 stop it.
- Manual form ids are now generated with `useId`; labels, `aria-invalid`
  and `aria-describedby` point at the generated ids.
- No changes to `tasks.md`, API, shared contracts or state files.
