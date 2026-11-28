# Handoff: Task S4-2b1 — orders buyer/seller W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2b1` ·
> `change: No spec change: i18n refactor` ·
> links: [report](report.md) · [evidence](evidence/)

Durable-путь: `.scrum/sprints/4/tasks/S4-2b1/handoff.md`. Ветка
`task/S4-2b1-orders-catalog`, база main `26971a7`, код-коммит `00e5eeb`.

## Сделано

- W1 orders seller/buyer copy в typed `ru.ts`: `OrdersPage` 19,
  `AdminOrderPage` 33, `AdminOrdersPage` 29 findings.
- `orders.*` 12 ключей, `admin.order.*` 31 ключ; reuse `order.*`,
  `payment.*`, `common.*`; `ORDER_STATUS_LABELS` не тронут.
- Code+tests: **431** (baseline excluded), ≤ 600; split не нужен.
- Baseline: **583 → 502** (−81 findings / −89 occurrences), deadKeys 0.
- Tests: web 246, targeted characterization 26/26 до и после; e2e 13/13;
  axe 72/0.
- Evidence: [evidence/](evidence/).

## Осталось

- S4-2b2 delivery: 78 findings, baseline 502 → 424
  (`AdminDeliveryCard` 55, `DeliverySummaryCard` 23).
- Для `DeliverySummaryCard` нужен Architect decision: предложен
  `delivery.*` (обоснование в S4-2a2 report).
- Следующий шаг: review/merge B1, затем B2.

## Что не делать

- Не мигрировать W2/shared labels/SMS/index.
- Не трогать `ORDER_STATUS_LABELS` из `packages/shared` — S4-4.
- Не менять state/board/specs; не мержить B1 в одиночку.
- Не коммитить Vite proxy-патч для e2e.

## Грабли

- Порты `3000/5173` заняты другими worktree: поднимать собственный
  стек, например API `:3100` + web `:5273`, с fake providers и
  `WEB_ORIGIN=http://localhost:5273`; proxy на `:3100` — временно.
- `AdminOrderPage` — «Статус оплаты недоступен.»: `payment.read.error`
  + точка в JSX; менять на строку с точкой в каталоге нельзя без
  изменения значения.
- E2E требует `SMS_PROVIDER=dev`, fake payments/delivery и совпадения
  `WEB_ORIGIN` с base URL; браузеры Playwright уже в кэше.
- LCP на dev — info (`lab-lcp-over-budget`), не выдавать за gate.

## Проверки

| Команда | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | web 246, i18n 4, shared 161, API 224/170 skipped, scanner 8, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 502 findings, 35 allowlisted, deadKeys 0 |
| `pnpm test:e2e` | 0 | 13 passed, axe 0 serious/critical |

## Открытые треды

- `#task-4`: review/merge B1.
- `#spec`: namespace `DeliverySummaryCard` для B2.
- PR **#91** открыт: <https://github.com/seshmonke/localhand/pull/91>.

## Doc change

- `No doc change: i18n refactor`.

## Read-back получателя

«Понял: B1 orders, baseline 502, 431 code+tests. Делаю: review/merge
B1, затем B2 delivery после решения по namespace. Не трогаю:
W2/shared/SMS/state/specs.»
