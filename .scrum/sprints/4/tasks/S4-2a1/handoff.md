# Handoff: Task S4-2a1 — checkout/shared W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2a1` ·
> `change: No spec change: i18n refactor` ·
> links: [report](report.md) · [evidence](evidence/)

Durable-путь: `.scrum/sprints/4/tasks/S4-2a1/handoff.md`. Ветка
`task/S4-2a1-checkout-catalog`, база `main@6773120`, code-коммит
`587cb26`.

## Сделано

- Checkout/shared W1 copy в typed `ru.ts`: `CheckoutPage.tsx` 56,
  `ScreenState.tsx` 4, `SessionExpiredState.tsx` 4, `item-count.ts` 3.
- Code+tests: **320** (baseline excluded).
- Baseline: **752 → 685** (−67), deadKeys 0.
- Tests: web 232; characterization 13/13 до миграции; e2e 13/13.
- Evidence: [evidence/](evidence/).

## Осталось

- A2: `task/S4-2a2-payment-order-catalog` от A1; cherry-pick
  `fec82de` (payment/order). Baseline A2: 685 → 583.
- S4-2b: orders 81 + delivery 78; план — в отчёте A2.
- Следующий шаг: merge A1, затем PR A2.

## Что не делать

- Не включать payment/order в A1: `OrderPage`, `SellerPaymentsCard`,
  `PaymentStatusBadge`, `payment-read` — это A2.
- Не мигрировать W2/shared labels/SMS/index.
- Не менять state/board/specs.

## Грабли

- `COMMENT_HINT` удалён из `CheckoutPage`; тест использует литерал
  значения, не константу.
- `ScreenState`/`SessionExpiredState`/`pluralizeItems` — общие для
  W1/W2: значения те же, W2-строки внутри W2-файлов не тронуты.
- E2E: API :3100 + web :5273, `WEB_ORIGIN` совпадает с base URL;
  Vite proxy патчился временно, не коммитить.
- Порты 3000/5173 могут быть заняты другими worktree.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | web 232, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 685 findings, 35 allowlisted |
| `pnpm test:e2e` | 0 | 13 passed, axe 0 serious/critical |

## Открытые треды

- `#task-4`: merge A1 → A2.
- Review: не запрошен; PR не открыт (push недоступен).

## Doc change

- `No doc change: i18n refactor`.

## Read-back получателя

«Понял: A1 checkout/shared, baseline 685, 320 code+tests. Делаю: merge
A1 и PR A2 payment/order. Не трогаю: W2/shared/SMS/state.»
