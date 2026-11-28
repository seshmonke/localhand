# Brief: Task S3-2 — Delivery CDEK test contour

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 3` · `task: S3-2` · `change: 07-delivery (archived)` ·
> links: [sprint](../../sprint.md) · [report](report.md) ·
> [board](../../../../board.json)

## 1. Objective

Физический заказ получает расчёт СДЭК, отправление, трек-номер и статус
доставки в тестовом контуре; покупатель и продавец видят доставку в
заказе.

## 2. AC

- [x] Габариты/вес товара; город/ПВЗ магазина; checkout собирает
  адрес/ПВЗ получателя с минимизацией PII.
- [x] Для оплаченного заказа продавец видит тарифы, создаёт отправление
  оплаченным тарифом и видит трек.
- [x] Статус доставки приходит по webhook/reconcile и виден buyer/seller.
- [x] Чужой заказ — 404; адрес/телефон не в логах/публичных ответах;
  `no-store`.
- [x] Тесты: fake CDEK, DB-интеграция, API/DB e2e, browser e2e, axe,
  preview LCP; live CDEK — owner gate.

## 3. Tier и change

- Tier: T2 (внешний провайдер, PII/адрес, деньги/заказ).
- Change: `07-delivery`, archived `2026-11-28-07-delivery`.
- Specs: `delivery`, delta `checkout-orders`, `product-management`,
  `seller-shop`.

## 4. owns

- `packages/shared/src/contracts/delivery.ts`
- `apps/api/src/delivery/**`, `apps/api/src/db/schema.ts` (0006)
- `apps/web/src/pages/CheckoutPage`, `OrderPage`, `AdminOrderPage`,
  `AdminShopPage`, `AdminProductFormPage`
- `openspec/changes/07-delivery/**` (до архива)
- Evidence: `.scrum/sprints/3/evidence/S3-2-*`,
  `.scrum/sprints/3/tasks/S3-2/evidence/`

Не трогать: реальные деньги/ключи/ПДн, Ozon, другие PBI.

## 5. Контракты

- `DeliveryQuoteRequest/Response`, `DeliverySnapshot`, tariff/shipment/
  manual/events; `SELLER_DELIVERY_EVENTS_MAX=50`.
- Схема `0006`: products dimensions, shops cdek fields, orders
  `delivery_kopecks`, `order_deliveries`, `delivery_events`.
- Внешний контракт: CDEK test API через adapter/fake; live — owner.

## 6. Non-goals

- Реальные деньги, live-ключи, реальные адреса/ПДн.
- Ozon/вторая логистика, собственный склад, возвраты.
- S3-3 lifecycle и S3-4 hardening — Sprint 4.

## 7. Output format

- `report.md`, `handoff.md`, `evidence/`.
- PR — squash, review не-автора.

## 8. Tools / sources

- `pnpm verify`, `pnpm test:e2e`, `openspec validate --all --strict`.
- [sprint](../../sprint.md), [DoD](../../../../../docs/quality/dod.md),
  [archive change](../../../../../openspec/changes/archive/2026-11-28-07-delivery/proposal.md).

## 9. Evidence contract

- TDD/ATDD: RED/GREEN/REFACTOR, mutation/e2e; 3.1 — owner named
  exception (retrospective RED) до Q1.1/Sprint 4.
- T2: threat model D1–D16, contract/property, SLO/логи, runbooks,
  rollback; mutation/SAST/alert/RUM — owner-исключения до Q1.3/Q1.4.
- Browser: 13 passed; axe 24×0; LCP preview <2500.
- Doc change: host-файлы обновлены; archive README.

## 10. Stop conditions

- Нужны реальные ключи/ПДн/юрпакет.
- Нужно менять контракт вне change.
- 3 неудачи/красный main.

## 11. Границы

- Только owns; не мержить; не менять specs вне change.
- Live CDEK/YooKassa — owner.

## 12. Read-back

«Понял: delivery test contour. Делаю: quote/shipment/webhook/reconcile/UI
и evidence. Не трогаю: реальные деньги/ПДн, Ozon, S3-3/S3-4.»
