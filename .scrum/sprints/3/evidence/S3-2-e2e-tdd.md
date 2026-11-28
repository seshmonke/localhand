# S3-2-E2E: API/DB delivery end-to-end

Дата: 2026-11-28. Ветка `task/S3-2-e2e-api`, main `22c6d8b` влит (merge
`9fe4a77`). Tier: T2 test slice. Change `07-delivery`, task 3.9.
Production-код не менялся.

## AC → тест (`delivery.e2e.db.test.ts`, 600 строк, 5 тестов)

| AC | Тест |
|---|---|
| Quote → checkout: snapshot `quoted`, `delivery=38000`, `total=458000`, заказ `new` | `runs quote -> …` |
| Seller: оплаченный тариф/цена = snapshot | там же |
| Create 201: provider id/number, `created`, событие | там же |
| Webhook `DELIVERED` → `delivered`; buyer/seller одинаковые status/track/no-store | там же |
| Replay webhook: 200, события не растут; duplicate create не зовёт провайдера | там же |
| Create definitive fail → 502, snapshot `quoted`, provider id/событий нет | `allows manual…` |
| Manual только при явном `null` lookup → 200; повтор 409 | там же |
| Guard: lookup throws → manual 502; remote shipment → 409; без записи | `blocks manual…` |
| PII source audit: depth-aware `log.*`, без raw `err/error/cause/new Error` | `delivery logging source audit` |
| PII runtime: captured pino без имени/телефона/адреса/комментария/payload hash | `keeps recipient PII…` |
| Reconcile runtime PII (`err:{name,code?}`, #77) | `delivery.log-redaction.test.ts` (14 тестов) |

## P2.2 (ревью)

- `ALLOWED_KEYS` больше не содержит `err`/`error`: ключ `err` допустим только
  как `safeErrorForLog(error)`, `error` — только `result.ok ? undefined :
  result.error`; raw `err: error`, `error: err`, `code: error`, `new Error`
  падают.
- `[^)]*` заменён depth-aware сканером: `recipientName` после `Date.now()`
  ловится; mutation RED: `err: new Error("Иван Тестов")` в reconcile и
  `recipientName` после `Date.now()` в delivery.route — audit FAIL.
- Runtime reconcile PII уже safe в #77; его 14 тестов гоняются в этой ветке.

## Notes

- Merge `22c6d8b`: конфликт `tasks.md` решён — 3.8 `[x]` из main, 3.9 `[x]`.
- 202/201: main #76 уже уточнил tasks 3.3 (CDEK 202 внутренний, локально 201);
  здесь не менялось.
- Payment — DB fixture (S3-1). `BuildAppOptions.deliveryProvider` только для
  reconcile; отказ провайдера — double на fake, restore в `finally`.
