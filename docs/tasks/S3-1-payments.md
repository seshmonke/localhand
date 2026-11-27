# Task S3-1: Payments (ЮKassa sandbox)

## Цель

Дать покупателю оплатить заказ продавцу через ЮKassa в тестовом контуре,
а продавцу — подключить платёжный аккаунт и видеть оплату. Платформа не
принимает деньги на свой счёт, не хранит карты и не логирует секреты.
Первый шаг — foundation, затем flow.

Change: `openspec/changes/06-payments/` (spec/design/tasks).
Спринт: 3, PBI S3-1. PR A — foundation, PR B — flow.

## AC — PR A (foundation)

- [ ] Миграции `0004`–`0005`: enum `payment_status`
      (`pending|succeeded|canceled|failed|manual_review`),
      `order_status += payment_pending|paid`; таблицы
      `seller_payment_accounts` (версии, `is_test`, шифротекст токена,
      `expires_at`, partial unique active) и `payments` (unique
      `order_id+idempotency_key`, partial unique active/manual,
      partial unique `provider_payment_id`); индексы.
- [ ] Миграция `0005`: fail-closed `seller_payment_accounts.status`
      default `error`; `payments.reconcile_attempts` (default 0, check
      >= 0), `payments.last_checked_at`, partial index
      `payments_pending_reconcile_idx`.
- [ ] `OrderStatusSchema`/`statusLabels`/тесты: `new|payment_pending|
      paid`; checkout по-прежнему создаёт `new`; бейдж
      `manual_review` — отдельно от статуса заказа.
- [ ] Контракты `payments`: `PaymentStatus`, `OrderPayment`,
      `CreatePaymentResponse`, `SellerPaymentAccount`,
      `PaymentErrorCode`; UUID `Idempotency-Key` нормализуется в lower.
- [ ] `PaymentProvider` интерфейс: connection, exchange, account info,
      subscribe/unsubscribe webhooks, create/get/revoke; fake-провайдер
      с `PAYMENTS_FAKE_ENABLED`. HTTP dev-complete endpoint — PR B
      (только fake/test, authz покупателя), не входит в PR A.
- [ ] AES-256-GCM: формат `version||iv||tag||ciphertext`, keyring
      `PAYMENTS_TOKEN_KEYS` + `PAYMENTS_TOKEN_KEY_VERSION`; roundtrip/
      tamper/rotation тесты.
- [ ] Env/guard: `PAYMENTS_PROVIDER`, `PAYMENTS_ENV=live|sandbox|test`
      (default live), `PAYMENTS_FAKE_ENABLED`, `PAYMENTS_STATE_SECRET`,
      `YOOKASSA_REDIRECT_URI`; в live fake и `isTest` запрещены;
      `.env.example` без секретов; startup fail на неполном yookassa.
- [ ] Down SQL + runbook `docs/stack/runbooks/payments-rollback.md`:
      выгрузить платежи, сначала down `0005`, затем `UPDATE orders SET
      status='new' WHERE status IN ('payment_pending','paid')`, удалить
      таблицы, enum-значения оставить, повторный деплой `0004`+`0005` —
      `ADD VALUE IF NOT EXISTS`/идемпотентные объекты; откат проверен на
      тестовой БД.
- [ ] `pnpm verify` + `openspec validate 06-payments --strict` зелёные;
      evidence в PR.

## AC — PR B (flow, следующий шаг)

- [ ] `POST /seller/payments/connect|callback`, `GET|DELETE
      /seller/payments/account`: state HMAC/TTL/sellerId, exchange,
      `subscribeWebhooks`, версии аккаунта, `error` при сбое подписки,
      `disabled` с retention, `isTest` в live отклоняется.
- [ ] `POST /orders/:id/payments`: UUID 400, authz 404, active account
      своего магазина, zero 409, rate-limit 5/мин, order-lock, replay
      по ключу **до** статусного гейта, active/manual_review независимо
      от статуса заказа, unique violation → 409.
- [ ] Create: insert+commit до вызова провайдера; вызов вне транзакции
      (timeout 10 с) с metadata `orderId/paymentId`; 401/403 → account
      error/409, другой 4xx → failed/502, 5xx → pending/502; тот же
      ключ ретраит, новый 409; URL только pending.
- [ ] Webhook: unknown 503 + лог, `getPayment`, order-lock,
      amount/currency/order match, `succeeded`/`canceled`/
      `manual_review`, 200 только после обработки; rate-limit 60/мин.
- [ ] Reconcile 60 с + на старте: pending с provider id >2 мин,
      сирота без id >15 мин → manual_review; 401 → account error и
      новая active-версия/3 неудачи → manual_review.
- [ ] Buyer `GET /orders/:id/payment` и seller `GET
      /seller/orders/:id/payment`; активный, иначе последний
      терминальный; URL только pending; 404 чужим.
- [ ] UI: `/orders/:id` (приоритет статуса платежа, ключ попытки,
      polling, 409-refetch), `/admin/shop` (карточка подключения),
      `/admin/orders/:id|list` (статус/бейдж, без кнопки).
- [ ] Тесты: unit crypto/fake/state, DB e2e успех/повтор/гонки/mismatch/
      canceled/unknown/5xx/4xx/manual_review/429, browser e2e, axe,
      preview LCP <2500, bundle delta.
- [ ] Runbook `payments-manual-review.md`: платежа нет → canceled/new;
      возврат в ЮKassa → canceled/new; оплата подтверждена →
      succeeded/paid + provider id/paid_at; SQL/ops-only.
- [ ] Live sandbox smoke после ключей владельца — P3, не блокирует.

## owns

- `apps/api/src/db/schema.ts`, `apps/api/drizzle/0004_*.sql`, `0005_*.sql`,
  `apps/api/drizzle/meta/**` (только сгенерированное drizzle-kit).
- `apps/api/src/payments/**`, `apps/api/src/env.ts` (+ тесты).
- `packages/shared/src/contracts/{order,payments}.ts` (+ тесты).
- `apps/web/src/**` — только PR B: `pages/{Order,Checkout,AdminShop,
  AdminOrder,AdminOrders}Page.tsx`, `components/admin/**`,
  `lib/api.ts`, `lib/queries.ts` при необходимости. Исключение PR A:
  только `pages/OrdersPage.tsx` — labels новых `OrderStatus`, без UI
  оплаты.
- `docs/stack/runbooks/payments-{rollback,manual-review}.md`,
  `docs/stack/adr/0004-payments.md` (PR B).
- `openspec/changes/06-payments/tasks.md` — отметить выполненные пункты.

Не трогать: CDEK/lifecycle/pagination (`07`–`09`), реальные ключи,
`openspec/specs/**` (только archive), `.scratch`/`.scrum` (кроме
orchestrator), чужие изменения.

## Контракты/данные

- TEST DB: `DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`,
  guard `_test`; миграции `0004`–`0005`.
- Деньги — `bigint` копейки, RUB, `capture: true`; без карт и PAN.
- Токен — только шифротекст; ключи из env, не в репо.
- Все ответы платежей — `no-store`; логи без PII/токена/тела.
- Тестовые данные — вымышленные; фото/скриншоты без ПДн.

## Non-goals

- Реальные деньги/ключи/54-ФЗ/чеки/возвраты.
- СДЭК, адрес, lifecycle shipping, pagination.
- Цифровые товары, AI, Ozon.
- Sprint 4.

## Evidence

- Команды, exit code, хвост, SHA; `pnpm verify`.
- `openspec validate 06-payments --strict`.
- Миграция up/down на тестовой БД.
- Crypto/fake/contract тесты.
- PR A: описание с исключением, если >400 строк (cohesive foundation).

## Границы

- Работать только в task worktree ветки `task/S3-1-payments`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При конфликте с `06-payments` — стоп и вопрос оркестратору.
