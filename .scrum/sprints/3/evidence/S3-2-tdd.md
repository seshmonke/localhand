# S3-2 delivery — TDD trace

Tier T2. Для каждого AC сначала RED-тест, затем минимальный код, затем
refactor. Evidence: `S3-2-tdd-a-red.log`, `S3-2-tdd-a-green.log`,
`S3-2-property-red.log`, `S3-2-tdd-b.md`; журнал в
`.scrum/sprints/3/daily.md`.

## PR A — schema/contracts/provider

| AC | RED-тест (файл) | Что падает |
|----|-----------------|------------|
| Габариты товара | `packages/shared/src/contracts/product-admin.test.ts` | нет `weight_g/length_cm/...` |
| Город/ПВЗ магазина | `packages/shared/src/contracts/seller.test.ts` | нет `cdek_city_code/cdek_shipment_point` |
| Delivery snapshot | `packages/shared/src/contracts/delivery.test.ts` | нет схем city/point/quote/shipment |
| PII-валидация | `.../delivery.test.ts` | имя/телефон/трек без ограничений |
| Quote token | `apps/api/src/delivery/quote-token.test.ts` | нет HMAC/TTL/hash/per-shop payload |
| Event idempotency | `apps/api/src/db/schema.delivery.db.test.ts` | нет unique/повторного события |
| Schema | `apps/api/src/db/schema.delivery.db.test.ts` | нет таблиц/колонок `0006` |

## PR B — quote/checkout/seller data/UI

| AC | RED-тест | Что падает |
|----|----------|------------|
| Успешный quote | `delivery.quote.db.test.ts` | нет endpoint/расчёта (404) |
| ПВЗ не из города | `delivery.quote.db.test.ts` | point не валидируется |
| Несколько магазинов | `delivery.quote.db.test.ts` | один общий тариф |
| Подмена shop в quote | `orders.delivery.db.test.ts` | HMAC не покрывает per-shop цены |
| 429/502/ПВЗ сдачи | `delivery.quote.db.test.ts` | нет лимита/ошибок |
| Rate-limit 30/мин | `delivery.quote.db.test.ts` | нет 429 |
| Checkout с доставкой | `orders.delivery.db.test.ts` | нет delivery/total |
| Multi-shop цены | `orders.delivery.db.test.ts` | цены не per-shop |
| Quote устарел/replay | `orders.delivery.db.test.ts` | нет 409/replay |
| Цена клиента игнорируется | `orders.delivery.db.test.ts` | доверяет телу |
| Нет доставки/габаритов/города | `orders.delivery.db.test.ts` | нет `delivery_required`/409 |
| Volumetric weight | `delivery.packaging.test.ts` | не учитывает объём; fixture 20×15×10 → 600 г |
| UI checkout | `CheckoutPage.test.tsx` | нет ПВЗ/цены |
| Product/shop UI | `ProductForm.test.tsx`, `ShopSettings.test.tsx` | нет полей |

## PR C — shipment/status/manual/e2e

| AC | RED-тест | Что падает |
|----|----------|------------|
| Seller tariffs | `delivery.shipment.db.test.ts` | нет endpoint |
| Создание CDEK | `delivery.shipment.db.test.ts` | нет create/202 |
| Не оплачен | `delivery.shipment.db.test.ts` | нет 409 paid-гейта |
| Повтор create | `delivery.shipment.db.test.ts` | создаёт дубль |
| Другой тариф | `delivery.shipment.db.test.ts` | принимает тариф вне оплаченного quote |
| Цена тарифа изменилась | `delivery.shipment.db.test.ts` | меняет price/total |
| Timeout + reconcile | `delivery.duplicate.db.test.ts` | manual при живом CDEK |
| Manual без CDEK | `delivery.manual.db.test.ts` | нет endpoint |
| Manual при CDEK | `delivery.manual.db.test.ts` | перезаписывает |
| Webhook verify | `delivery.webhook.db.test.ts` | доверяет телу |
| Webhook replay | `delivery.webhook.db.test.ts` | дубль события |
| Reconcile delivered | `delivery.reconcile.db.test.ts` | не обновляет `in_transit` |
| Quoted без отправления | `delivery.reconcile.db.test.ts` | авто-`failed`/создание |
| Webhook verify fail | `delivery.webhook.db.test.ts` | применяет статус без проверки |
| Authz 404 | `delivery.authz.db.test.ts` | отдаёт чужое |
| PII redaction | `delivery.log-redaction.test.ts` | пишет имя/телефон |
| Live PII gate | `apps/api/src/env.test.ts` | live стартует с `DELIVERY_LIVE_PII=false` |
| Browser e2e | `apps/web/e2e/delivery-flow.spec.ts` | нет сценария |
| Axe | `apps/web/e2e/delivery-a11y.spec.ts` | нарушения |

## Property/contract

- `total_kopecks = items_kopecks + delivery_kopecks`
  (`packages/shared/src/domain/money.property.test.ts`).
- `max(weight_g, ceil(L*W*H/5))` не меньше каждого слагаемого;
  дробный объём округляется вверх до грамма.
- HMAC quote: подпись/город/точка/hash/exp/цены per-shop — любое изменение → invalid.
- CDEK fixtures: create request содержит `number`, `shipment_point`,
  `delivery_point`, `packages`; ответ 202 не терминален.
- Event replay: одинаковый `(status_code, occurred_at)` — одно событие.

## Исключения

Mutation/SAST — owner exception до Q1.3/Q1.4; alert/RUM — до публичного
запуска. Записаны в `.scrum/events.jsonl` и threat model.
