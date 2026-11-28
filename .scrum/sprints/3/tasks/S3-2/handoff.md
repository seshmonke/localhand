# Handoff: S3-2 Delivery

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 3` · `task: S3-2` · `change: 07-delivery (archived)` ·
> links: [brief](brief.md) · [report](report.md)

## Состояние

- Delivery test contour в main; change archived
  `2026-11-28-07-delivery`; specs `delivery` + deltas.
- Live CDEK/YooKassa, юрпакет, production deploy/SMS — owner gates.
- S3-3 lifecycle/S3-4 hardening — Sprint 4.

## Следующий шаг

- Sprint 4 planning: `08-order-lifecycle` → `09-orders-pagination`
  последовательно (capability `checkout-orders`).
- Owner: CDEK contract/test account, YooKassa keys, legal package,
  Selectel deploy/SMS.

## Грабли

- CDEK shared test account: 4 подписки не удалять; webhook-тесты — на
  отдельном аккаунте.
- v1 — один API-контейнер; distributed lock для подписок — P2 backlog.
- Field RUM/LCP — до публичного запуска.

## Read-back получателя

«Понял: delivery test contour закрыт. Делаю: Sprint 4 planning/lifecycle.
Не трогаю: live-ключи/ПДн без owner.»
