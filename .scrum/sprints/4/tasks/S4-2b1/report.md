# Report: Task S4-2b1 — orders buyer/seller W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2b1` ·
> `change: No spec change: i18n refactor` ·
> links: [handoff](handoff.md) · [brief](brief.md) · [evidence](evidence/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md) ·
> [text review W1](../../../../../.scrum/reviews/83-text-review-w1.md) ·
> [audit](../../../../../.scrum/reviews/text-site-audit.md)

## Итог для координатора (≤ 10 строк)

- Статус: **ready-for-review**. Buyer/seller orders W1 copy в typed
  `ru.ts`; значения, поведение, authz и статусы не менялись.
- Ветка `task/S4-2b1-orders-catalog`, база main `26971a7`, код-коммит
  `00e5eeb`.
- Code+tests: **431** (baseline excluded), ≤ 600; split не нужен.
- Baseline: **583 → 502** (−81 findings / −89 occurrences), deadKeys 0.
- `pnpm verify` 0; `pnpm check:i18n` 0; web **246**; e2e **13/13**;
  axe **72 скана / 0 violations**.
- `OrdersPage` 19, `AdminOrderPage` 33, `AdminOrdersPage` 29 findings —
  все три файла в baseline = 0.
- Не тронуты W2/shared/SMS/`ORDER_STATUS_LABELS`/B2 delivery,
  `openspec/specs/`, state/board/README.
- Brief S4-2b1 прочитан; AC и контракты совпадают с заданием.
- PR **#91** открыт: <https://github.com/seshmonke/localhand/pull/91>.
- Doc change: `No doc change: i18n refactor`.

## AC и evidence

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| `OrdersPage` 19 findings в каталоге | baseline | pass: 0 findings в файле | [delta](evidence/baseline-delta.txt) |
| `AdminOrderPage` 33 findings в каталоге | baseline | pass: 0 findings в файле | [delta](evidence/baseline-delta.txt) |
| `AdminOrdersPage` 29 findings в каталоге | baseline | pass: 0 findings в файле | [delta](evidence/baseline-delta.txt) |
| `orders.*` / `admin.order.*`, reuse `order.*`/`payment.*`/`common.*` | diff, typecheck | pass; 43 новых ключа, dynamic `t()` нет | [numstat](evidence/commit-numstat.txt) |
| Значения/поведение/authz/статусы не менялись | прежние тесты/e2e | pass; локаторы не менялись | [e2e](evidence/e2e.txt) |
| `ORDER_STATUS_LABELS` не тронут | diff | pass: shared импорт как был | [numstat](evidence/commit-numstat.txt) |
| Baseline prune, нет new violations/dead keys | `check:i18n` | pass: 583 → 502, deadKeys 0 | [check](evidence/check-i18n-after.txt) |
| `pnpm verify` 0; `pnpm check:i18n` 0 | команды | pass, exit 0 | [verify](evidence/verify.txt) |
| Web/e2e/axe | vitest + playwright | pass: 246, 13/13, 72/0 | [web](evidence/verify.txt), [e2e](evidence/e2e.txt), [axe](evidence/axe-buyer.json) |
| W2/shared/SMS/B2 не мигрированы | `git diff --name-only` | pass: только 3 страницы, их тесты, каталог, baseline | [numstat](evidence/commit-numstat.txt) |
| Размер < 600 | numstat | pass: 431 code+tests | [numstat](evidence/commit-numstat.txt) |

## TDD / characterization

- Characterization до миграции: существующие 22 теста страниц расширены
  проверками описаний, aria-label, загрузки/пустоты/ошибки, заголовков
  таблицы, платёжных состояний и not-found; **26/26 зелёные на базовом
  коммите** `26971a7`.
- Новые проверки до миграции: `OrdersPage` loading (2), `AdminOrdersPage`
  shop/orders loading (2), `AdminOrderPage` retryable payment read error
  (1) — плюс точные строки существующих состояний.
- После миграции: **26/26** и полный web **246/246**.
- Evidence:
  [before](evidence/tdd-characterization-before.txt),
  [after](evidence/tdd-characterization-after.txt).

## Изменения

- `apps/web/src/pages/OrdersPage.tsx` — `orders.*`; reuse `order.*`,
  `common.retry`; `OrderItemsList.label` стал обязательным (default
  «Состав заказа» никем не использовался).
- `apps/web/src/pages/AdminOrderPage.tsx` — `admin.order.*`; reuse
  `order.*`, `payment.*`, `common.retry`; «Статус оплаты недоступен.»
  = `payment.read.error` + точка в JSX, чтобы значение осталось ровно
  прежним.
- `apps/web/src/pages/AdminOrdersPage.tsx` — `admin.order.*`; reuse
  `order.*`, `order.payment.*`, `common.retry`.
- `packages/i18n/src/resources/ru.ts` — `orders.*` 12 ключей,
  `admin.order.*` 31 ключ (плоские, typed, plural не добавлялся).
- `scripts/i18n-baseline.json` — prune 81 findings (486 строк).
- Тесты: `OrdersPage.test.tsx`, `AdminOrdersPage.test.tsx` — только
  characterization/новые проверки, ни один старый assert не ослаблен.
- `ORDER_STATUS_LABELS`, `pluralizeItems`, `PaymentReadStatus`,
  `PaymentStatusBadge`, `formatOrderDate/Phone` — без изменений.

## Проверки

| Команда | Exit | Вывод (хвост) |
|---|---:|---|
| `pnpm verify` | 0 | typecheck/lint/format/check:public; check:i18n 502; web 246, i18n 4, shared 161, API 224/170 skipped, scanner 8; build; OpenSpec 9/9 — [log](evidence/verify.txt) |
| `pnpm check:i18n` | 0 | 502 findings / 550 occurrences, 35 allowlisted, deadKeys 0 — [log](evidence/check-i18n-after.txt) |
| `pnpm test:e2e` | 0 | **13 passed**; axe 0 serious/critical — [log](evidence/e2e.txt) |
| axe JSON | — | 20+24+12+16 = **72 скана, 0 violations** — [buyer](evidence/axe-buyer.json), [delivery](evidence/axe-delivery.json), [admin](evidence/axe-admin.json), [payments](evidence/axe-payments.json) |
| `git show --numstat 00e5eeb` | — | 431 code+tests; baseline 486 excluded — [numstat](evidence/commit-numstat.txt) |

E2E — ручной локальный гейт: собственный dev-стек API `:3100` с fake
payments/delivery и `WEB_ORIGIN=http://localhost:5273` + web `:5273`;
Vite proxy на `:3100` патчился временно и возвращён к `:3000` до
коммита. LCP на dev — info-only (`lab-lcp-over-budget`), не gate.

## Границы и риски

- Scope только W1 orders; W2, shared labels/SMS/index meta, B2 delivery
  не тронуты. `openspec/specs/`, state/board/README не менялись.
- Значения совпадают с PR #83: e2e-локаторы (`Мои заказы`, `Заказы`,
  `Оплата не начата`, `Заказ №…`, `Заказы вашего магазина`) прошли без
  правок.
- Baseline уменьшился ровно на 81 finding, новых keys/deadKeys нет;
  split не требуется (431 < 600).

## Handoff

- Следующий шаг: review PR/SHA, затем S4-2b2 delivery (78 findings,
  502 → 424); namespace `DeliverySummaryCard` — решение Architect
  (`delivery.*` предложен в S4-2a2 report).
- Грабли: порты `3000/5173` заняты другими worktree — поднимать свой
  API/web на свободных портах и не коммитить proxy-патч; e2e требует
  fake payments/delivery и `WEB_ORIGIN`, совпадающий с base URL.
- Открытые треды: `#task-4` (review/merge B1), `#spec` (namespace B2).
- PR #91 открыт; review ожидает.

## Блокеры

- Нет технических. Для B2 нужен Architect decision по namespace
  `DeliverySummaryCard`.
