# S3-2-E2E: API/DB delivery end-to-end

Дата: 2026-11-28. Ветка `task/S3-2-e2e-api`, база `339f0c5` + merge main.
Tier: T2 test slice (external provider, PII, order transitions). Change
`07-delivery`, task 3.9. Production-код не менялся.

## AC → тест (`apps/api/src/delivery/delivery.e2e.db.test.ts`)

| AC | Тест |
|---|---|
| Quote → checkout: snapshot `quoted`, `delivery=38000`, `total=458000`, заказ `new` | `runs quote -> …` |
| Seller: оплаченный тариф/цена = snapshot | там же |
| Create 201: provider id/number, `created`, событие | там же |
| Webhook `DELIVERED` → `delivered`; buyer/seller одинаковые status/track/no-store | там же |
| Replay webhook: 200, события не растут | там же |
| Duplicate create: провайдер не вызван, snapshot/БД не перезаписаны | там же |
| Create definitive fail → 502, snapshot `quoted`, provider id/событий нет | `allows manual…` |
| Ручной трек: lookup вернул явный `null` → 200 manual; buyer/seller видят трек; повтор 409 | там же |
| Guard: lookup бросает (5xx/timeout) → manual 502, snapshot/статус не меняются | `blocks manual…` |
| Guard: remote shipment есть, локального provider id нет → 409, без записи | там же |
| PII: source audit `log.*` в delivery route/service/reconcile (info/warn/error) | `delivery logging source audit` |
| PII: runtime-логи без имени/телефона/адреса/комментария/`payload_hash`; forced 500 route-а | `keeps recipient PII…` |

## Правки по ревью

- P2.1: добавлены negative-ветки manual guard (throw → 502, remote → 409) и
  allow только на явном `null`; mutation «удалить remote lookup» падает.
- P2.2: source audit всех лог-вызовов delivery + runtime forced 500; mutation
  `recipientName` в `shipment.route.ts:74` падает.
- P3: `DATABASE_URL` удаляется в `afterAll`; user-SQL помечен fixture-комментом.
- Note (3.11 docs): tasks 3.3/спека говорят 202, route отдаёт 201 — не менялось.

## Решения

- Production-gap нет: regression-lock + mutation-check, без фальшивого RED.
- `BuildAppOptions.deliveryProvider` питает только reconcile/подписку; маршруты
  зовут `getDeliveryProvider()`, поэтому отказ моделируется double на fake
  (restore в `finally`).
- Payment — прямой DB fixture, не payment e2e (S3-1). Секретов в файле нет.
