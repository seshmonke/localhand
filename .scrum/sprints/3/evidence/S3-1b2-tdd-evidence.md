# TDD evidence — S3-1b2

Ветка `task/S3-1b2-payments-ui`. Все команды — из корня worktree.
DB-тесты — с `DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`
и `JWT_SECRET`/`OTP_SECRET` (не placeholders). Web-тесты — `pnpm --filter @localhand/web test`.

## 1. API dev-complete contract

**RED**

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
  pnpm --filter @localhand/api vitest run src/payments/payments.flow.db.test.ts \
  -t "creates, completes"
```

```text
FAIL src/payments/payments.flow.db.test.ts > ... creates, completes ...
AssertionError: expected { ok: true } to match object { ok: true, orderId: 1, …(1) }
- Expected: orderId + providerPaymentId
+ Received: { "ok": true }
Tests 1 failed | 29 skipped
```

Причина: dev-странице нужны `providerPaymentId` (вызвать реальный вебхук) и
`orderId` (вернуть покупателя в заказ), а route возвращал только `{ok:true}`.

**GREEN**

```text
Tests 1 passed | 29 skipped
```

**REFACTOR / full suite**

```text
pnpm --filter @localhand/api test
Test Files 23 passed (23), Tests 263 passed (263)
```

## 2. Web RTL: seller payments card, order/checkout/orders/admin

**RED (до реализации)**

```bash
pnpm --filter @localhand/web test
```

```text
Test Files 6 failed | 15 passed (21)
Tests 14 failed | 106 passed (120)
```

Новые тесты падали на отсутствии карточки «Приём платежей», кнопки
«Оплатить», статусов оплаты, dev-страниц и перехода checkout → заказ.
Второй RED-проход после первой реализации (асинхронные запросы ещё не
дождались):

```text
Test Files 4 failed | 17 passed (21)
Tests 22 failed | 118 passed (140)
```

**GREEN**

```text
pnpm --filter @localhand/web test
Test Files 21 passed (21)
Tests 140 passed (140)
```

Покрыто: active/error/disabled/null, isTest, маскированный счёт, 409
disconnect, 409 `payment_in_progress` → refetch, 409
`seller_payment_unavailable`, `Idempotency-Key` на попытку и ротация после
терминальной неудачи, polling 3 с / «Проверить ещё раз» после 60 с,
`manual_review` отдельно от статуса заказа, checkout → `/orders/:id`,
честная «Оплата не подключена», dev connect/complete.

**REFACTOR** — тесты зелёные после выноса `goToExternal`, вынесения
poll-состояния из synchronous `setState` в effect (lint
`react(set-state-in-effect)`), без изменения поведения.

## 3. Browser e2e (fake provider)

**RED** — первый прогон спеки против dev-стека (до появления рабочей
карточки в отдаваемой сборке):

```text
Locator: getByRole('region', { name: 'Приём платежей' }).getByText('Не подключено')
Error: element(s) not found
```

**GREEN**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 \
  pnpm --filter @localhand/web test:e2e e2e/payments-flow.spec.ts
```

```text
✓ seller connects fake payments, buyer pays, seller sees paid
✓ a 409 payment_in_progress refetches the active payment instead of duplicating it
✓ manual_review is a payment state, not an order status, for buyer and seller
3 passed
```

Полный dev-набор (все спеки, включая обновлённый buyer-flow после перехода
checkout → `/orders/:id`):

```text
10 passed (2.6m)
```

## 4. Axe light/dark 320/1440

**RED**

```text
Error: admin-shop-320-dark
color-contrast serious, target: .bg-accent-orange
Elements must meet minimum color contrast ratio thresholds
```

Причина: бейдж «Тестовый магазин» использовал оранжевый фон с наследуемым
светлым текстом в dark-теме. Исправлено на paper-бейдж с оранжевой точкой.

**GREEN** (dev и preview):

```text
scans 16 serious/critical 0
✓ axe has no serious or critical findings on payment pages
```

## 5. Preview LCP

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 pnpm --filter @localhand/web test:e2e \
  e2e/perf.spec.ts e2e/payments-a11y.spec.ts
```

```text
✓ axe has no serious or critical findings on payment pages
✓ lab LCP smoke on catalog and checkout
2 passed
```

`lcp-results.json`: catalog labP75 **616 ms**, checkout labP75 **816 ms**,
`budget.enforced: true`, limit 2500 ms. Lab-прокси, не field p75
(owner decision, ADR 0004).

## 6. Verify

```bash
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s2_test' \
JWT_SECRET='…' OTP_SECRET='…' pnpm verify
```

Exit code `0`: shared 133, web 140, api 263, openspec 8/8, public repo 423
файла, production build без dev-чанков.

## 7. Round 2 — P1 review fixes + property tests

### 7.1 UI RED/GREEN

**RED** (новые тесты на P1-поведение, до кода):

```bash
pnpm --filter @localhand/web test \
  src/pages/OrderPage.test.tsx src/pages/OrdersPage.test.tsx \
  src/pages/AdminOrdersPage.test.tsx src/components/admin/SellerPaymentsCard.test.tsx
```

```text
Test Files 4 failed (4)
Tests 11 failed | 33 passed (44)
```

Падали: pending без `confirmationUrl` (нет «Повторить оплату» и POST с
сохранённым ключом), 409 `invalid_order_transition` (нет refetch), повторная
проверка `seller_payment_unavailable`, ошибка `GET payment` в списках
(показывалась «Оплата не подключена»/«Нет платежа»), fallback paid-заказа,
manual_review-копирайт (runbook вместо поддержки).

**GREEN**

```text
Test Files 4 passed (4)
Tests 44 passed (44)

pnpm --filter @localhand/web test
Test Files 22 passed (22)
Tests 153 passed (153)
```

### 7.2 Property-based (fast-check 4.11.0, root devDependency)

`fast-check` — тестовая зависимость для web/shared/api, в runtime-бандл не
попадает (root devDependency, обоснование: один инструмент на три workspace).

**RED (API helper до реализации)**

```text
FAIL payments.transitions.property.test.ts
TypeError: providerPaymentMatches is not a function
Tests 4 failed (4)
```

**GREEN**

```bash
pnpm --filter @localhand/web test src/pages/OrderPage.property.test.ts   # 4 passed
pnpm --filter @localhand/shared test                                    # 139 passed
pnpm --filter @localhand/api test                                       # 271 passed
```

Покрыто:
- `attemptKeyFor`: UUID, стабильность, pending/manual_review сохраняют ключ,
  terminal очищает и генерирует новый, ключи разных заказов не смешиваются.
- Контракты: amount `0..MAX` принимается, отрицательные/дробные
  отклоняются; currency только RUB; confirmation URL только http(s);
  terminal-статус не отдаёт URL.
- `providerPaymentMatches`: полное совпадение true, любое расхождение false;
  `isPaymentStatusTerminal`: только pending не терминален (succeeded/
  canceled/failed/manual_review не reopen).

### 7.3 Dev-route absence

`apps/api/src/payments/payments.dev-routes.test.ts` — 4 passed: route есть
только при fake + enabled + non-live (401 без сессии); 404 при non-fake
провайдере, `PAYMENTS_ENV=live` и `fakeEnabled=false`.

### 7.4 Verify / e2e / axe / LCP

```text
pnpm verify → exit 0
shared 139, web 153, api 271, openspec 8/8, public repo 436 files
production build: no DevPayments chunks, no /dev/payments route strings
```

```text
dev 5173 payments: 4 passed (flow 3 + axe 1)
preview 4173: 3 passed (buyer axe, payments axe, LCP)
axe payments: 16 scans, 0 serious/critical
LCP preview: catalog 524 ms, checkout 708 ms, gate enforced < 2500
bundle: 577.79 kB JS / 163.95 gzip (+4.36% / +6.53 kB vs S2-4; within budget)
```

### 7.5 SAST / mutation

`semgrep` и `codeql` в окружении отсутствуют; тяжёлые тулзы не
устанавливались. Именованное owner-исключение до появления SAST в CI
зафиксировано в `docs/quality/threat-model.md`. Stryker mutation в B2 не
добавляется — owner exception до Q1.3 (там же).
