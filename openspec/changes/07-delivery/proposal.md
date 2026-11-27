# Proposal: delivery (CDEK test + manual fallback)

## Why

Оплаченный физический заказ не имеет доставки: покупатель не выбирает ПВЗ,
не видит стоимость/срок, продавец не создаёт отправление и не получает
трек. Без этого money-path не закрывает MVP.

## What Changes

- Габариты/вес товара: `weight_g`, `length_cm`, `width_cm`, `height_cm`.
- Checkout: выбор города и ПВЗ СДЭК, расчёт доставки по каждому магазину,
  стоимость входит в `orders.total_kopecks`; получатель (имя/телефон) —
  PII, только тестовые данные до юрпакета.
- CDEK: платформенный аккаунт (один договор, owner decision 27.11.2026),
  тестовый контур `api.edu.cdek.ru`; расчёт, создание заказа, трек,
  вебхук/опрос статусов.
- Manual fallback: продавец вводит перевозчика и трек вручную, если API
  недоступен/нет договора; покупатель видит трек.
- Провайдер-абстракция `DeliveryProvider`: CDEK сейчас, Ozon — вторым
  адаптером после MVP.
- UI: checkout ПВЗ/цена, `/orders/:id` доставка/трек,
  `/admin/orders/:id` создать отправление/трек/статус.

## Capabilities

### New Capabilities

- `delivery`: ПВЗ, расчёт, отправление, трек, статусы, manual fallback.

### Modified Capabilities

Нет. `checkout-orders` не меняется: доставка — отдельная capability;
статусы заказа `shipped/delivered` — change `08-order-lifecycle`.

## Impact

- `apps/api`: миграция `0006` (product dimensions, `order_deliveries`,
  `delivery_events`, `orders.delivery_kopecks`), delivery routes/service,
  CDEK adapter, webhook, reconcile, rate-limit, tests.
- `packages/shared`: delivery contracts (city/point/quote/shipment/status).
- `apps/web`: checkout PVZ, order delivery card, admin shipment card.
- Env: `CDEK_CLIENT_ID/SECRET`, `CDEK_API_URL`, `CDEK_WEBHOOK_URL`,
  `DELIVERY_PROVIDER=cdek|manual`, `DELIVERY_ENV=test|live`.
- Preview: CDEK test + fake addresses; real keys/contract — owner.

## Non-goals

- Доставка до двери/адрес (только ПВЗ v1).
- Ozon, Boxberry, Почта России — после MVP; только provider seam.
- Реальные ключи/договор/отправления, 54-ФЗ, юрпакет.
- Refunds, цифровые товары, AI.
- Статусы заказа shipped/delivered — change `08`.

## Success metric

Покупатель на checkout выбирает ПВЗ, видит цену/срок; после оплаты
продавец создаёт отправление СДЭК (test) или вводит трек вручную;
покупатель и продавец видят трек и статус; чужой заказ — 404; PII не в
логах; `pnpm verify` + e2e зелёные.

## References

- `docs/tasks/03-money-path.md`, `docs/stack/integrations/cdek.md`
- `openspec/specs/checkout-orders/spec.md`,
  `openspec/specs/payments/spec.md`
- `docs/quality/dod.md`
