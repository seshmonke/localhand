# Brief: Task S4-2 — migrate W1 copy to catalog

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-2` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [S4-1 brief](../S4-1/brief.md) ·
> [text review](../../../../../docs/tasks/text-review.md)

## 1. Objective

W1-тексты (checkout, оплата, доставка, заказы buyer/seller) переезжают из
JSX/TS в `packages/i18n/src/resources/ru.ts`; значения не меняются,
поведение не меняется, baseline уменьшается на W1.

## 2. AC

- [ ] Все W1 production-строки в `ru.ts`; в W1-файлах нет кириллицы вне
  каталога.
- [ ] `t`/`useTranslation` используются; typed keys; нет dynamic/raw
  string fallback.
- [ ] Тексты/статусы/ошибки не переписаны — значения совпадают с PR #83.
- [ ] Тесты/e2e проходят: web 221+, e2e 13, axe; baseline обновлён/pruned.
- [ ] `pnpm verify` 0; `pnpm check:i18n` 0.
- [ ] W2/shared/SMS не мигрированы.

## 3. Tier и change

- Tier T1 (refactor, no behavior). `No spec change: i18n refactor`.
- ADR 0006.

## 4. owns

W1 production/test/e2e:
- `apps/web/src/pages/CheckoutPage.tsx` (+ test)
- `OrderPage.tsx` (+ test), `OrdersPage.tsx` (+ test)
- `AdminOrderPage.tsx` (+ test), `AdminOrdersPage.tsx` (+ test)
- `apps/web/src/components/admin/AdminDeliveryCard.tsx` (+ test)
- `apps/web/src/components/orders/DeliverySummaryCard.tsx` (+ test)
- `SellerPaymentsCard.tsx`, `PaymentStatusBadge.tsx`, `payment-read.tsx`
- `ScreenState.tsx`/`SessionExpiredState.tsx` только если W1-строки
- `cart/item-count.ts` только W1-плюрализация
- `packages/i18n/src/resources/ru.ts`
- `scripts/i18n-baseline.json` (prune W1)
- W1 e2e локаторы, если значения/ключи меняют селекторы

Не трогать: W2-страницы, shared labels/SMS, specs/state/board, copy.

## 5. Контракты

- Ключи `checkout.*`, `order.*`, `orders.*`, `payment.*`,
  `admin.order.*`, `admin.payment.*`, `admin.delivery.*`, `common.*`;
  плоские, typed. Architect decision 28.11: `common.*` для shared
  состояний, `delivery.*` для общего DeliverySummaryCard в B2.
- Значения — ровно текущие W1-строки (copy review PR #83).
- `t("key", { count })` для plural; даты/деньги — `Intl`.

## 6. Non-goals

- W2 (витрина/каталог/корзина/auth/admin shop/products).
- shared labels/SMS/index meta (S4-4).
- Любая правка копирайта/поведения.

## 7. Output format

- `report.md`, `handoff.md`, `evidence/`; PR <600 code+tests.
- Split: S4-2a1 checkout/shared (#89), S4-2a2 payment/order (#90),
  S4-2b1 orders, S4-2b2 delivery — последовательно.

## 8. Tools/sources

- `pnpm verify`, `pnpm check:i18n`, `pnpm test:e2e`, `pnpm check:i18n:update`.
- Read: ADR 0006, PR #83 copy, S4-1 scanner/allowlist.
- W1 string inventory: `.scrum/reviews/text-site-audit.md`.

## 9. Evidence contract

- Existing tests green; key/plural tests; baseline prune count; `check:i18n` 0.
- E2E 13/axe on changed pages; no copy changes.
- T1 refactor: no test-after; tests exist before migration; if a key lacks
  coverage, add a small render test first.

## 10. Stop conditions

- Нужно менять W2/shared/SMS.
- Значение/статус не совпадает с PR #83.
- Baseline не уменьшается или new violations.
- W1 >600 без split.

## 11. Границы

- Только owns; не мержить; не менять state/board/specs.
- Live/PDn/Ozon — нет.

## 12. Read-back

«Понял: W1 в каталог без смены текста. Делаю: ru.ts keys, t/useTranslation,
baseline prune, tests/e2e. Не трогаю: W2/shared/SMS/state.»
