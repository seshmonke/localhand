# Proposal: delivery (CDEK test + manual fallback)

## Why

Оплаченный физический заказ не имеет доставки: покупатель не выбирает ПВЗ,
не видит стоимость/срок, продавец не создаёт отправление и не получает
трек. Без этого money-path не закрывает MVP.

Tier: **T2** — PII, внешний провайдер, деньги/статусы.
TDD обязателен; threat model/contract/property — до кода.

## What Changes

- Габариты/вес товара: `weight_g`, `length_cm`, `width_cm`, `height_cm`;
  seller UI/API.
- Магазин: город отправки и ПВЗ сдачи (`cdek_city_code`,
  `cdek_city_name`, `cdek_shipment_point`); seller UI/API.
- Checkout: город/ПВЗ покупателя, signed quote (TTL 10 мин), цена
  доставки в `orders.total_kopecks`; получатель (имя) — PII, только
  тестовые данные до юрпакета.
- CDEK: платформенный аккаунт (owner decision 27.11.2026), тестовый
  контур; buyer quote и seller tariff list; создание заказа, трек,
  вебхук/опрос.
- Manual fallback: только после оплаты и только если CDEK-отправление
  точно не создано; продавец вводит carrier/track.
- `DeliveryProvider` seam: CDEK сейчас, Ozon — вторым адаптером после
  MVP.
- UI: checkout ПВЗ/цена, `/orders/:id` доставка/трек,
  `/admin/orders/:id` тариф/отправление/manual, `/admin/shop` город/ПВЗ.

## Capabilities

### New Capabilities

- `delivery`: ПВЗ, quote, отправление, трек, статусы, manual fallback.

### Modified Capabilities

- `checkout-orders`: checkout принимает доставку, `OrderSummary`
  содержит delivery snapshot, total включает доставку.
- `product-management`: габариты/вес товара.
- `seller-shop`: город/ПВЗ отправки магазина.

Статусы заказа `shipped/delivered` — отдельный change `08`; здесь
только delivery-статус.

## Impact

- `apps/api`: миграция `0006`, delivery routes/service, CDEK adapter,
  webhook, reconcile, outbound limiter, rate-limit, tests.
- `packages/shared`: delivery/product/shop/order contracts.
- `apps/web`: checkout PVZ, order delivery card, admin shipment card,
  shop city/PVZ, product dimensions.
- Env: `DELIVERY_PROVIDER=cdek|fake|manual`, `DELIVERY_ENV=test|live`,
  `CDEK_CLIENT_ID/SECRET/API_URL/WEBHOOK_URL`, `DELIVERY_QUOTE_SECRET`,
  `DELIVERY_LIVE_PII=false` (fail-closed).
- Preview: CDEK test/fake, fake addresses; real keys/contract — owner.

## Non-goals

- Доставка до двери/адрес (PVZ-only v1).
- Ozon/Boxberry/Почта — после MVP, только provider seam.
- Реальные ключи/договор/отправления, 54-ФЗ, юрпакет.
- Refunds, цифровые товары, AI.
- Статусы заказа shipped/delivered — change `08`.

## Success metric

Покупатель выбирает ПВЗ, видит цену/срок, оплачивает; продавец
выбирает тариф, создаёт CDEK (test) или manual-трек; buyer/seller видят
трек/статус; дублей отправлений нет; PII не в логах; verify/e2e зелёные.

## References

- `docs/tasks/03-money-path.md`, `docs/stack/integrations/cdek.md`
- `openspec/specs/checkout-orders/spec.md`,
  `openspec/specs/payments/spec.md`
- `docs/quality/dod.md`, `docs/quality/threat-model.md`
