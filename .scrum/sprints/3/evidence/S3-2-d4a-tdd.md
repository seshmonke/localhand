# S3-2-D4a: seller delivery events API + web client

Дата: 2026-11-28. Ветка `task/S3-2-d4a-delivery-events-api`, база `main`
@ `066b29b`. Tier: T2 (external provider, order data). Change `07-delivery`,
tasks 3.5/3.8 API-срез; UI — следующий PR. `tasks.md` 3.8 не отмечен.

## AC → тест

| AC | Тест |
|---|---|
| `DeliveryEvent` без payload hash/PII, длины, ISO datetime | `packages/shared/src/contracts/delivery.test.ts` → `DeliveryEventSchema` (2 теста) |
| `SellerDeliveryResponse {delivery, events}` | `delivery.test.ts` → `SellerDeliveryResponseSchema` (2 теста) |
| GET seller: события newest-first, `occurred_at DESC, id DESC` | `shipment.db.test.ts` → «returns the seller delivery with newest-first events…» |
| Последние 50 событий | `shipment.db.test.ts` → «returns the last 50 events ordered by occurred_at and id descending» |
| Пустая история | `shipment.db.test.ts` → «returns an empty event list for a quoted delivery» |
| Authz: no session 401, чужой/legacy 404, no-store | `shipment.db.test.ts` → «requires a session and keeps 404…» + header assert |
| POST/PATCH/buyer GET остаются snapshot-only | существующие `DeliveryResponseSchema` тесты + `Object.keys(created.json())` |
| Web: `fetchSellerDelivery` | `apps/web/src/lib/api.test.ts` → «fetches the seller delivery with its events» |
| Web: `fetchSellerDeliveryTariffs` | `api.test.ts` → «fetches seller tariffs for the order» |
| Web: `createSellerShipment` POST body | `api.test.ts` → «creates a shipment with the paid tariff code» |
| Web: `saveSellerManualTrack` PATCH body | `api.test.ts` → «saves a manual carrier and track» |
| Ошибки API (409) пробрасываются | `api.test.ts` → «propagates API errors with status and code» |
| Ключи `sellerKeys.delivery/deliveryTariffs` стабильны | `api.test.ts` → «keeps seller delivery query keys stable» |

## RED / GREEN

- RED: `.scrum/sprints/3/evidence/S3-2-d4a-tdd-red.txt` — contract 4 failed,
  API DB 3 failed (`events: undefined`), web 6 failed (missing exports/keys).
- GREEN: `.scrum/sprints/3/evidence/S3-2-d4a-tdd-green.txt` — 17 + 16 + 6.
- `pnpm verify`: `.scrum/sprints/3/evidence/S3-2-d4a-verify.txt`.

## Решения

- `getSellerDelivery` теперь возвращает `{delivery, events}`; authz и snapshot
  переиспользуют `loadContext`/`toSnapshot`, отдельного запроса прав нет.
- `payloadHash` остаётся внутренним полем БД и не попадает в публичную схему;
  Zod отбрасывает лишние ключи, тест фиксирует точный набор полей события.
- POST/PATCH и buyer GET не менялись: `DeliveryResponseSchema` без events.
