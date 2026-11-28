# Report: Task S4-2a2 — payment/order W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2a2` ·
> `change: No spec change: i18n refactor` ·
> links: [handoff](handoff.md) · [evidence](evidence/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md) ·
> [text review W1](../../../../../.scrum/reviews/text-site-audit.md)

## Итог для координатора (≤ 10 строк)

- Статус: **ready-for-review**. Второй PR split S4-2a: payment/order
  W1 copy поверх A1.
- Ветка `task/S4-2a2-payment-order-catalog` от A1 `b7b30d3`;
  payment-коммит `2b16712` (patch идентичен `fec82de`), docs-коммит — этой папки.
- Code+tests: **529** (baseline excluded), ≤ 600. После merge A1 diff
  vs main = A2.
- Baseline: **685 → 583** (−102), deadKeys 0; W1 остаток — 159 на
  S4-2b.
- `pnpm verify` 0; `pnpm check:i18n` 0; `pnpm test:e2e` **13/13**,
  axe 0 serious/critical; web 242.
- Значения не менялись: локаторы/тесты без изменений.
- W2/shared labels/SMS/index не мигрированы.
- S4-2b план — в § «План S4-2b».
- Doc change: `No doc change: i18n refactor`.

## AC и evidence (A2 scope)

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| Payment/order W1-строки в `ru.ts` | baseline | pass: `OrderPage` 65, `SellerPaymentsCard` 28, `PaymentStatusBadge` 5, `payment-read` 4 | [after](evidence/baseline-after.txt) |
| `t`/`useTranslation`, typed keys | typecheck, `check:i18n` | pass; dynamic `t()` нет | [verify](evidence/verify.txt) |
| Значения = PR #83 | прежние тесты/e2e | pass; web 242, e2e 13 | [e2e](evidence/e2e.txt) |
| Тесты/e2e/axe; baseline prune | verify + e2e | pass; 685 → 583 | [verify](evidence/verify.txt) |
| `pnpm verify` 0; `pnpm check:i18n` 0 | команды | pass, exit 0 | [verify](evidence/verify.txt), [check](evidence/check-i18n-after.txt) |
| W2/shared/SMS не мигрированы | diff | pass | [diff A1..A2](evidence/diff-a1-a2.txt) |

## TDD / ATDD

- После A1 база: 232 web-теста зелёные.
- Characterization A2 до миграции: `PaymentStatusBadge` 5 статусов +
  `PaymentReadStatus` loading/error/paid/empty — **10/10 зелёные** на
  базовом коммите (в составе общего прогона 242).
- После миграции: 242/242.
- Evidence:
  [characterization before](evidence/tdd-characterization-before.txt).

## Изменения

- `apps/web/src/pages/OrderPage.tsx` — `order.*`,
  `payment.status.*`, `payment.error.*`.
- `apps/web/src/components/admin/SellerPaymentsCard.tsx` —
  `admin.payment.*`.
- `apps/web/src/components/admin/PaymentStatusBadge.tsx` —
  `payment.status.*`, switch по статусу.
- `apps/web/src/components/admin/payment-read.tsx` — `payment.read.*`,
  `common.retry`, `payment.status.succeeded`.
- Новые тесты: `PaymentStatusBadge.test.tsx`,
  `payment-read.test.tsx`.
- `packages/i18n/src/resources/ru.ts` — 104 order/payment/admin keys.
- `scripts/i18n-baseline.json` — prune 685 → 583.

Контракты: плоские ключи, `keySeparator: false`, plural i18next,
`TFunction = ReturnType<typeof useTranslation>["t"]`. Зависимости,
схема, миграции не менялись.

## Проверки

| Команда | Exit | Вывод (хвост) |
|---|---:|---|
| `pnpm verify` | 0 | web 242, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9; [log](evidence/verify.txt) |
| `pnpm check:i18n` | 0 | 583 findings / 639 occurrences, 35 allowlisted; [log](evidence/check-i18n-after.txt) |
| `pnpm test:e2e` | 0 | **13 passed**, axe 0 serious/critical; [log](evidence/e2e.txt) |
| `git show --numstat 2b16712` | — | **529** code+tests, baseline excluded; [size](evidence/commit-size.txt) |

E2E — ручной гейт: собственный dev-стек API :3100 (fake
payments/delivery, `WEB_ORIGIN=http://localhost:5273`) + web :5273;
Vite proxy на :3100 патчился временно и возвращён к `:3000` до
коммита. Lab LCP на dev — info (`lab-lcp-over-budget`), не gate.

## План S4-2b (не реализован)

Остаток W1: **159 findings**, baseline 583 → 502 → 424; после B2 W1 в
baseline = 0, остаётся W2 (424) для S4-3.

### B1 orders — 81 finding

- `apps/web/src/pages/OrdersPage.tsx` 19 — `orders.*`.
- `apps/web/src/pages/AdminOrderPage.tsx` 33 — `admin.order.*`.
- `apps/web/src/pages/AdminOrdersPage.tsx` 29 — `admin.order.*`
  (табличные заголовки/действия).
- Переиспользовать `order.*`, `payment.status.*`, `payment.read.*`,
  `common.retry`, `common.sessionExpired.*` из A1/A2, чтобы не
  дублировать значения.
- `ORDER_STATUS_LABELS` из `packages/shared` не трогать: это shared
  labels, S4-4.
- Baseline после B1: **502**. Оценка ~450–600; если > 600 — split
  buyer `OrdersPage` и admin `AdminOrder*`.

### B2 delivery — 78 findings

- `apps/web/src/components/admin/AdminDeliveryCard.tsx` 55 —
  `admin.delivery.*`, переиспользовать `common.retry`,
  `common.sessionExpired.inline`.
- `apps/web/src/components/orders/DeliverySummaryCard.tsx` 23 —
  общий buyer/seller компонент.
- **Namespace decision (нужен Architect):** для общего
  `DeliverySummaryCard` предлагаю **`delivery.*`** (например,
  `delivery.status.pending`, `delivery.city`, `delivery.track`).
  Обоснование: один компонент и одна модель `DeliverySnapshot`
  используются и buyer, и seller; `orders.delivery.*` привязал бы
  общий компонент к buyer-маршруту и всё равно показывался бы в
  админке; `admin.delivery.*` — только для seller-контролов
  `AdminDeliveryCard`. Дублировать 7 статусов в двух namespace —
  лишний риск расхождения. Альтернатива, если Architect настаивает на
  контракте брифа: `orders.delivery.*` только для buyer-обёртки, а
  seller использует `admin.delivery.*`; тогда общий компонент должен
  принимать namespace/keys пропом — дороже и без выгоды.
- Baseline после B2: **424**. Оценка ~450–550; если > 600 — split
  admin-карточка и общий компонент.

## Doc change и drift

- `No doc change: i18n refactor`; ADR 0006 и план спринта актуальны.
- Stale claims: none.
- Обещание теста: ссылки в TDD/AC.
- Будущее как текущее: S4-2b помечен «не реализован».

## Handoff

- Следующий шаг: merge A1 → merge A2 → B1 orders → B2 delivery.
- Грабли: e2e требует свой API с fake providers и `WEB_ORIGIN`,
  совпадающий с base URL; `DeliverySummaryCard` namespace — решение
  Architect до B2.
- Открытые треды: `#task-4` (merge A1/A2), `#spec` (namespace
  `delivery.*`).
- PR не открыт: push в окружении недоступен, передан SHA.

## Блокеры

- Нет технических. Для B2 нужен Architect decision по namespace
  `DeliverySummaryCard`.
