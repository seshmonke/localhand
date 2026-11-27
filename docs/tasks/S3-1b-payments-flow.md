# Task S3-1b: Payments flow (backend)

## Цель

Реализовать backend-поток оплаты поверх foundation PR A: подключение
платёжного аккаунта, создание платежа, вебхук, reconcile и fake-complete
для e2e. UI, ADR и manual-review runbook — PR B2.

Change: `openspec/changes/archive/2026-11-27-06-payments/`.
Спринт: 3, PBI S3-1. PR B1, ветка `task/S3-1b-payments-flow`.

## AC

- [x] Env: `PAYMENTS_WEBHOOK_URL` (https в `PAYMENTS_ENV=live`,
      http только localhost/sandbox/test), `.env.example`, тесты.
- [x] Один экземпляр `PaymentProvider` на приложение (fastify
      decorate/контекст), чтобы connect/create/webhook/reconcile видели
      одно fake-состояние; прямой `new FakePaymentProvider` в routes
      запрещён.
- [x] `POST /seller/payments/connect`: seller auth, HMAC-state
      (TTL 10 мин, sellerId), `consentUrl`.
- [x] `GET /seller/payments/callback`: seller session, state/TTL/sellerId,
      `exchangeCode`, `getAccountInfo`, `assertPaymentAccountAllowed`,
      `subscribeWebhooks` с `PAYMENTS_WEBHOOK_URL`, encrypt token,
      транзакция: новая версия active, старая active → superseded;
      ошибка подписки → новая версия `error`, старый active не трогать.
- [x] `GET /seller/payments/account`: active, иначе последняя
      error/disabled, `null` если нет; маскированный account id,
      `isTest`, `expiresAt`.
- [x] `DELETE /seller/payments/account`: 409 при pending/manual_review;
      `disabled`, unsubscribe/revoke best effort, токен сохранить.
- [x] `POST /orders/:id/payments`: UUID header 400, buyer 404,
      active-аккаунт продавца заказа, zero 409, rate-limit 5/мин,
      advisory lock `order:{id}`, lookup `(order, key)` и replay **до**
      статусного гейта; новый ключ: `paid` 409, active/manual 409
      независимо от статуса заказа, `payment_pending` без active 409
      invalid; insert pending + commit, provider call вне транзакции
      (timeout 10 с, metadata orderId/paymentId), save provider id/URL
      под lock, conditional `new → payment_pending`; 401/403 → account
      error/409, другой 4xx → failed/502, 5xx → pending/502; unique
      violation → 409.
- [x] Replay: pending с URL → тот же URL; succeeded/canceled → без URL;
      failed (4xx) → повторный create с тем же ключом (только после
      повторного гейта; stale failed после paid → 409 `order_already_paid`);
      manual_review → 409 `payment_requires_review`.
- [x] `GET /orders/:id/payment` buyer: active, иначе последний
      терминальный, `payment:null`, URL только pending.
- [x] `GET /seller/orders/:id/payment`: seller authz, без URL, 404.
- [x] `POST /payments/yookassa/webhook`: no cookie, body limit, unknown
      503 + `webhook_unknown_payment`, `getPayment`, order-lock,
      amount/currency/order match, succeeded/canceled/manual_review,
      200 после обработки, provider error 502/503, rate-limit 60/мин
      IP, no-store.
- [x] `POST /dev/payments/:id/complete`: только fake+enabled, buyer
      владелец; завершает fake-платёж; e2e затем вызывает webhook.
- [x] Reconcile 60 с + onReady + graceful shutdown: pending с provider id
      >2 мин и заказ `payment_pending` → `getPayment` под order-lock;
      pending без provider id >15 мин → manual_review;
      `reconcile_attempts`/`last_checked_at`; 401 → account error,
      новая active-версия того же provider account или 3 неудачи →
      manual_review; не гоняется с webhook.
- [x] Все ответы платежей `no-store`; логи `payment_id/order_id/status/
      code`, без PII/токена/тела; rate-limit create/webhook.
- [x] API e2e fake: connect account → create payment → complete →
      webhook → `paid`; replay no-op; seller sees paid; чужой 404;
      unknown 503; 5xx same key retry/new 409; 4xx failed/new; 429.
- [x] DB-тесты: гонка create/webhook (нет второй строки), replay после
      `paid`, active/manual независимо от статуса, mismatch
      manual_review, canceled при другом платеже, reconcile orphan.
- [x] `pnpm verify`, `openspec validate 06-payments --strict`; миграций
      нет (0004/0005 уже в main). YooKassa HTTP adapter и реальные ключи
      — P3 после владельца; fake не блокирует.

## owns

- `apps/api/src/payments/**`, `apps/api/src/app.ts`, `apps/api/src/env.ts`
  (+ тесты), `packages/shared/src/contracts/payments.ts` при расширении.
- `docs/tasks/S3-1b-payments-flow.md`, `openspec/changes/archive/2026-11-27-06-payments/
  tasks.md` (отметки 2.x/3.x).
- `.env.example`.
- `apps/api/src/orders/**` — только helper/статусы, если нужно; не
  ломать checkout.

Не трогать: `apps/web/**` (PR B2), CDEK/lifecycle/pagination, реальные
ключи, `openspec/specs/**`, `.scrum/**` (кроме orchestrator).

## Контракты/данные

- TEST DB `localhand_s2_test`, миграции 0004/0005.
- Сумма — bigint копейки, RUB, `capture:true`; карт нет.
- Токен — только шифротекст; ключи из env.
- Тестовые данные вымышленные; PII/токены в логи не писать.

## Non-goals

- UI/страницы, e2e браузера, axe/LCP (PR B2).
- Реальный ЮKassa HTTP-адаптер, реальные деньги/ключи, 54-ФЗ.
- Refunds, CDEK, lifecycle shipping, pagination.

## Evidence

- Команды, exit code, SHA; verify.
- Fake API e2e, DB tests, webhook replay/mismatch.
- `openspec validate 06-payments --strict`.

## Границы

- Работать в `task worktree`, ветка
  `task/S3-1b-payments-flow`.
- Коммитить в ветку; не пушить/не мержить.
- При конфликте с `06-payments` — стоп и вопрос оркестратору.
