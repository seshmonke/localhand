# S3-2-D4b: seller shipment UI happy path — TDD

Date: 2026-11-28. Branch `task/S3-2-d4b-seller-shipment-ui`, base `main`.
Tier T2 (UI on reviewed API). Change `07-delivery`, tasks 3.8 partially (PR C
keeps manual/polling/axe). `tasks.md` 3.8 is intentionally unchecked.

## AC → test

| AC | Test |
|---|---|
| quoted: «Рассчитать тарифы» GET; paid tariff not first (137 vs 136); POST only `quota.paid.tariffCode` | `AdminDeliveryCard.test.tsx` → «creates a shipment with the paid tariff only…» (body `{tariffCode:"137"}`) |
| «Оплаченный тариф» = paid snapshot price, list = current CDEK price | same: paid 410 (`delivery.priceKopecks`) ≠ current 450 (`paid.priceKopecks`) |
| success: cache `{delivery}` + refetch, notice + track + event | same test |
| 409 `delivery_tariff_mismatch`, snapshot stays, retry available | «explains a tariff mismatch…» |
| 502 `delivery_provider_error`, safe copy, retry | «reports a provider outage and allows a retry» |
| 401 → `SessionExpiredState` (cache clear), snapshot stays | «shows an expired session for a 401…» |
| 404 «Заказ не найден», snapshot stays | «shows a not-found message for a 404…» |
| paid + no delivery: empty text + manual note, no actions, no fetch | «shows the empty state and no actions…» |
| not paid: «Доставка доступна после оплаты», no actions, no fetch | «shows the after-payment state and no actions…» |
| events newest-first; «Обновить» refetch (h-11 = 44px) | «renders the newest event first and refreshes…» |
| empty history one line; track only `trackNumber`; no provider ids/codes in DOM | «renders a single empty-history line…» (providerNumber absent) |
| seller page keeps snapshot (regression) | `AdminOrdersPage.test.tsx` → «shows the delivery snapshot to the seller» |

## REFACTOR / review fixes

- Unique heading id via `useId()`; 401 reuses `SessionExpiredState` with cache
  clearing; 502 copy drops the manual-track advice until PR C.
- 44px targets: refresh `size="sm"` + `h-11`; buttons md h-12.
- Evidence: RED 10 failed / 12 passed / 22 on the two files (see red file);
  review-fix RED 4 failed before the fixes.
- Deferred to PR C: manual track form, polling, axe and browser e2e.
