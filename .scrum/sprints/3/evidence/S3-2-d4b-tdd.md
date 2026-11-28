# S3-2-D4b: seller shipment UI happy path — TDD

Date: 2026-11-28. Branch `task/S3-2-d4b-seller-shipment-ui`, base `main` @ `618fdda`.
Tier T2 (UI on reviewed API). Change `07-delivery`, tasks 3.8 partially (PR C
keeps manual/retry-polish/polling/axe). `tasks.md` 3.8 is intentionally unchecked.

## AC → test

| AC | Test |
|---|---|
| quoted: «Рассчитать тарифы» GET, paid tariff + list, POST only `paid.tariffCode` | `AdminDeliveryCard.test.tsx` → «creates a shipment with the paid tariff only…» |
| success: cache `{delivery}` + refetch, «Отправление создано» + track + event | same test (POST body `{tariffCode:"136"}`, refetch returns event) |
| 409 `delivery_tariff_mismatch`, snapshot stays, retry available | «explains a tariff mismatch and keeps the quoted snapshot» |
| 502 `delivery_provider_error`, safe message, retry | «reports a provider outage and allows a retry» |
| 401 login link, snapshot stays | «shows an expired session for a 401 without hiding the snapshot» |
| 404 «Заказ не найден», snapshot stays | «shows a not-found message for a 404 without hiding the snapshot» |
| paid + no delivery: empty text + manual line, no actions, no fetch | «shows the empty state and no actions…» |
| not paid: «Доставка доступна после оплаты», no actions, no fetch | «shows the after-payment state and no actions…» |
| events newest-first; «Обновить» refetch for created/in_transit | «renders the newest event first and refreshes…» |
| empty history one line; no provider ids/status/tariff/point codes in DOM | «renders a single empty-history line and never exposes raw ids or codes» |
| seller page keeps snapshot (regression) | `AdminOrdersPage.test.tsx` → «shows the delivery snapshot to the seller» |

## Notes

- hooks `useSellerOrderDeliveryQuery` (staleTime 5s, retry false) and
  `useSellerDeliveryTariffsQuery` (enabled on demand, retry false) live in
  `apps/web/src/lib/queries.ts`; exercised through component fetch mocks.
- A11y: section/aria-labelledby, native buttons with names, aria-live for
  status/notice/loading, role=alert errors, `min-h-11/12` targets.
- Deferred to PR C: manual track form, provider-error manual action, polling,
  axe and browser e2e.
