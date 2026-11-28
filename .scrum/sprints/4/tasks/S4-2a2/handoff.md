# Handoff: Task S4-2a2 — payment/order W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2a2` ·
> `change: No spec change: i18n refactor` ·
> links: [report](report.md) · [evidence](evidence/)

Durable-путь: `.scrum/sprints/4/tasks/S4-2a2/handoff.md`. Ветка
`task/S4-2a2-payment-order-catalog`, база A1 `b7b30d3`, payment-коммит
`2b16712`.

## Сделано

- Payment/order W1 copy в typed `ru.ts`: `OrderPage` 65,
  `SellerPaymentsCard` 28, `PaymentStatusBadge` 5, `payment-read` 4.
- Code+tests: **529** (baseline excluded).
- Baseline: **685 → 583** (−102), deadKeys 0.
- Tests: web 242; characterization 10/10 до миграции; e2e 13/13.
- Evidence: [evidence/](evidence/).

## Осталось

- S4-2b-1 orders: 81 finding, baseline 583 → 502.
- S4-2b-2 delivery: 78 finding, baseline 502 → 424.
- Для `DeliverySummaryCard` нужен Architect decision: предложен
  `delivery.*` (обоснование в [report §План S4-2b](report.md)).
- Следующий шаг: merge A1, затем A2, затем B1/B2.

## Что не делать

- Не мигрировать W2/shared labels/SMS/index.
- Не трогать `ORDER_STATUS_LABELS` из `packages/shared` — S4-4.
- Не менять state/board/specs.
- Не включать B1/B2 в этот PR.

## Грабли

- `PaymentStatusBadge` status labels — switch по `PaymentStatus`, без
  dynamic `t(key)`; так сканер видит ключи.
- `PaymentReadStatus.emptyLabel` («Оплата не начата») остаётся строкой
  `OrdersPage` и мигрирует в B1.
- E2E: API :3100 + web :5273, `WEB_ORIGIN` совпадает с base URL;
  Vite proxy патчился временно, не коммитить.
- Порты 3000/5173 могут быть заняты другими worktree.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | web 242, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 583 findings, 35 allowlisted |
| `pnpm test:e2e` | 0 | 13 passed, axe 0 serious/critical |

## Открытые треды

- `#task-4`: merge A1 → A2.
- `#spec`: namespace `DeliverySummaryCard` (`delivery.*` vs
  `orders.delivery.*`).
- Review: не запрошен; PR не открыт (push недоступен).

## Doc change

- `No doc change: i18n refactor`.

## Read-back получателя

«Понял: A2 payment/order, baseline 583, 529 code+tests. Делаю: merge
A1/A2, затем B1 orders и B2 delivery. Не трогаю: W2/shared/SMS/state.»
