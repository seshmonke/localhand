# S3-2-D4c: seller manual track, polling, 3.8 — TDD evidence

Scope: seller delivery UI in `/admin/orders/:id` — manual carrier/track,
15 s polling for live deliveries, retry/error polish, `tasks.md` 3.8.
API, shared contracts, DB, buyer pages and the checkout are unchanged.

RED: `S3-2-d4c-tdd-red.txt` — 12 failed | 18 passed (30). Implementation
files were reverted to `775b783` while the new tests stayed.
GREEN: `S3-2-d4c-tdd-green.txt` — 30 passed (30).
Verify: `S3-2-d4c-verify.txt` — `pnpm verify` exit 0 (web 212 passed,
shared 160, api 209 passed / 166 skipped, openspec 9/9).

| AC | Test |
|---|---|
| Manual form for `quoted` with no provider order; PATCH body, cache, track, events refetch | `AdminDeliveryCard > saves a manual carrier and track for a quoted delivery` |
| Manual form for legacy `delivery === null` + note about missing city/PVZ/recipient | `AdminDeliveryCard > saves a manual carrier and track for a legacy order without a delivery snapshot` |
| Legacy empty state offers manual entry and does not call GET before save | `AdminDeliveryCard > offers manual entry for a paid order without a delivery snapshot` |
| No manual form when provider order / manual status / track exists | `AdminDeliveryCard > does not offer the manual form when ...` (3 cases) |
| Client validation via `DeliveryManualTrackSchema`, Russian errors, `aria-invalid`/`aria-describedby` | `AdminDeliveryCard > validates carrier and track on the client before sending` |
| 409 `delivery_already_exists` → refresh + form disabled + message | `AdminDeliveryCard > handles a conflict when saving the manual track` |
| 502 `delivery_provider_error` → retry possible and succeeds | `AdminDeliveryCard > handles a provider error when saving the manual track` |
| 404 → not-found message, form disabled | `AdminDeliveryCard > handles a missing order when saving the manual track` |
| 401 → session-expired state, form disabled | `AdminDeliveryCard > handles an expired session when saving the manual track` |
| GET delivery retry keeps the snapshot | `AdminDeliveryCard > retries a failed delivery request without losing the snapshot` |
| Tariffs retry after 502 | `AdminDeliveryCard > retries tariffs after a transient provider error` |
| Manual submit disabled while pending, one PATCH only | `AdminDeliveryCard > does not send a manual track twice while the request is pending` |
| Polling created/in_transit every 15 s, stops on delivered, cleanup on unmount | `AdminDeliveryCard > polls a ... delivery every 15 seconds, stops when delivered and cleans up` (2 cases) |
| No polling for quoted/delivered/manual/canceled/failed | `AdminDeliveryCard > does not poll a ... delivery` (5 cases) |
| Long carrier/track wraps; no raw provider ids/codes/hash in DOM | `AdminDeliveryCard > wraps long manual track values and never exposes raw provider data` |
| Existing shipment happy path/409/502/401/404 and #71 tests stay green | the first 9 tests of `AdminDeliveryCard.test.tsx` |

Notes:

- The #71 test “empty state and no actions for a paid order without
  delivery” was replaced by “offers manual entry…”, because the new spec
  requires manual carrier/track for legacy paid orders. Other #71 tests
  are unchanged.
- `tasks.md` 3.8 is checked. 3.9–3.11 and 4.1 remain untouched.
- Polling lives in `useSellerOrderDeliveryQuery`; the key is unchanged.
- Browser e2e/axe/LCP stay in 3.10.
