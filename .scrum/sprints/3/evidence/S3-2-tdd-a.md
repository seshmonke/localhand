# S3-2 PR A — schema/contracts/provider

Дата: 27.11.2026. Стек `task/S3-2-contracts` → `-env` → `-provider` → `-db2`. Tier T2.

## RED

1. Shared contracts: `pnpm --filter @localhand/shared test`
   → 8 failed / 141 до реализации, `Cannot find module ./delivery.js`;
   product/shop fixtures падали на новых обязательных полях.
2. Env: `pnpm --filter @localhand/api test -- env.test.ts`
   → `resolveDeliverySettings` не экспортирован, delivery env не валидируется.
3. Delivery modules: `pnpm --filter @localhand/api test -- src/delivery`
   → `Cannot find module ./packaging.js`, `./quote-token.js`,
   `./fake-provider.js`.
4. API DB/e2e после смены контрактов: 42 failed — сервисы не отдавали
   `delivery`, габариты, город/ПВЗ; Zod-ответы падали.

## GREEN

- `packages/shared`: 154 passed (delivery/product/shop/order contracts).
- `pnpm verify`: exit 0; shared 154, web 154, api 313, OpenSpec 9/9,
  public 499 files. В API входят property-тесты упаковки/токена,
  event idempotency/cascade DB-тесты, seller dimensions/city.
- RED/GREEN: `S3-2-tdd-a-red.txt`, `S3-2-tdd-a-green.txt`;
  mutation-check TTL — `S3-2-property-red.txt`.

## Покрытые AC

- Габариты/вес товара: positive int, nullable, границы.
- Город/ПВЗ магазина: nullable, формат point code.
- Delivery snapshot: provider-neutral, статусы `quoted…failed`.
- Quote token: HMAC, TTL 10 мин (верхняя граница), per-shop payload,
  tamper/expiry/wrong-secret; property-тесты fast-check.
- Event idempotency: duplicate `(delivery,status,occurred_at)` → 23505;
  cascade delete order → delivery/events; partial unique provider ids.
- Упаковка: сумма веса, max габариты, `ceil(L*W*H/5)` граммов.
- Env: fake/test/live guards, live-PII fail-closed, production preview
  только fake, CDEK test host.
- Схема `0006`: таблицы, checks, unique идемпотентности; down-runbook.

## Файлы

- `packages/shared/src/contracts/delivery.ts|test.ts`, `limits.ts`,
  `product-admin.ts`, `seller.ts`, `order.ts`.
- `apps/api/src/delivery/{packaging,quote-token,fake-provider,provider,rate-limiter}.ts`.
- `apps/api/src/db/schema.ts`, `drizzle/0006_silent_blink.sql`,
  `src/db/schema.delivery.db.test.ts`.
- `apps/api/src/env.ts|test.ts`.
- `docs/stack/runbooks/delivery-rollback.md`.
- Обновлены fixtures web/api и `OrderSummary.delivery`.

## Ограничения

- Реальный CDEK adapter, маршруты quote/checkout/shipment — PR B/C.
- Live-ключи/договор CDEK — у владельца; в PR A только test/fake.
