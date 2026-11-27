# Tasks: payments

PBI делится на два PR/цикла: **A. foundation** (схема, контракты, крипто,
адаптер) и **B. flow** (аккаунт, платёж, вебхук, UI). Один change,
два merge-шага; review — не автором.

## 1. Foundation (PR A)

- [x] 1.1 Добавить enum `payment_status` (`pending|succeeded|canceled|failed|manual_review`), `order_status += payment_pending|paid`, таблицы `seller_payment_accounts` (версии, partial unique active), `payments` (unique order+idempotency, partial unique active/manual, partial unique provider id), индексы и миграцию `0004`; отдельная `0005` — fail-closed default `error`, reconcile-поля и partial index.
- [x] 1.2 Обновить `OrderStatusSchema`/`statusLabels` и тесты контракта: `new|payment_pending|paid`; checkout по-прежнему создаёт `new`.
  > PR A: контракты, labels и тесты. Бейдж `manual_review` — отдельный UI-бейдж, не статус заказа; реализация в PR B (4.3).
- [x] 1.3 Добавить Zod-контракты: `PaymentStatus`, `OrderPayment`, `CreatePaymentResponse`, `SellerPaymentAccount`, `PaymentErrorCode`.
- [x] 1.4 Описать `PaymentProvider`: connection, exchange, `getAccountInfo`, `subscribeWebhooks`, `unsubscribeWebhooks`, create/get/revoke; fake-провайдер с явным `PAYMENTS_FAKE_ENABLED`.
  > PR A: интерфейс, fake-провайдер и тестовый hook `completePayment` есть; HTTP `/dev/payments/:id/complete` — PR B (нужны routes, только fake/test, authz покупателя).
- [x] 1.5 AES-256-GCM: формат `version||iv||tag||ciphertext`, keyring `PAYMENTS_TOKEN_KEYS` + `PAYMENTS_TOKEN_KEY_VERSION`, roundtrip/tamper/rotation тесты.
- [x] 1.6 Env и production guard: `PAYMENTS_PROVIDER`, `PAYMENTS_ENV=live|sandbox|test` (default `live`), `PAYMENTS_FAKE_ENABLED`, `PAYMENTS_STATE_SECRET`, `YOOKASSA_REDIRECT_URI`; в `live` запрещены fake и `isTest`; `.env.example` без секретов; startup fail на неполном yookassa-конфиге.
  > PR A: env-валидация, live-запрет fake, live-https redirect и pure `assertPaymentAccountAllowed` для `isTest`. Вызов guard в callback подключения аккаунта — PR B (2.2), без него аккаунт не создаётся.
- [x] 1.7 Down SQL и runbook `payments-rollback.md`: сначала откат `0005` (drop index/constraint/columns, default `active`), затем общий откат `0004` — выгрузить платежи, `UPDATE orders SET status='new' WHERE status IN ('payment_pending','paid')`, удалить таблицы, значения enum оставить (PostgreSQL не умеет DROP VALUE), повторный деплой `0004` — `ADD VALUE IF NOT EXISTS`/чистка журнала drizzle; полный rebuild — только с downtime; проверить откат на тестовой БД.
- [x] 1.8 `pnpm verify` + `openspec validate 06-payments --strict`; PR A может превысить 400 строк — зафиксировать исключение в PR (cohesive foundation) или разрезать на schema+contracts / crypto+adapter.

## 2. Аккаунт продавца (PR B)

- [ ] 2.1 `POST /seller/payments/connect`: HMAC-state (TTL 10 мин, seller_id), `consentUrl`, `YOOKASSA_REDIRECT_URI`.
- [ ] 2.2 `GET /seller/payments/callback`: сессия продавца, state/TTL/sellerId, exchange code, `getAccountInfo`, `subscribeWebhooks`, encrypt token, новая версия аккаунта, старая `superseded`; ошибка подписки → `error` только для новой версии, текущий active не трогать; `isTest` в `live` отклоняется.
- [ ] 2.3 `GET /seller/payments/account`: текущая версия `active|error|disabled` или `null` (маска, `isTest`, `expiresAt`); `DELETE` (`disabled`, 409 при активных платежах, токен для поздних вебхуков); `unsubscribeWebhooks`, best-effort `revoke`, идемпотентная повторная подписка.
- [ ] 2.4 UI `/admin/shop`: карточка «Приём платежей», статусы active/error/disabled, тестовый бейдж, подключить/отключить/повторить.
- [ ] 2.5 Тесты: 401, чужой seller, state, повторное подключение/версии, ошибка подписки, disconnect с платежом, истёкший токен → error.

## 3. Платёж и вебхук (PR B)

- [ ] 3.1 `POST /orders/:id/payments`: UUID header (400), authz 404, active account своего магазина, zero amount, rate-limit 5/мин, advisory lock `order:{id}`; **сначала lookup по `(order, key)` и replay до статусного гейта**, затем для нового ключа `SELECT orders FOR UPDATE`, `paid` и active/`manual_review` независимо от статуса заказа; unique violation active-индекса → 409; идемпотентность.
- [ ] 3.2 Создание: insert payment + commit до вызова провайдера; вызов вне транзакции (timeout 10 с) с metadata `orderId`/`paymentId`; 401/403 → аккаунт `error` + 409, другой 4xx → `failed` + 502, 5xx/timeout → `pending` + 502; тот же ключ ретраит, новый 409; provider id/URL сохранять под lock после перечитывания строки; условный `new → payment_pending`.
- [ ] 3.3 `POST /payments/yookassa/webhook`: body limit, lookup by provider id, неизвестный → 503, `getPayment`, order-lock, amount/currency/order match, `succeeded`/`canceled`/`manual_review`, 200 только после обработки.
- [ ] 3.4 Reconcile раз в 60 с и на старте под order-lock: pending с provider id > 2 мин → `getPayment`, pending без provider id > 15 мин → `manual_review`; 401 → аккаунт `error`, новая active-версия с тем же account id или после 3 неудач `manual_review`; graceful shutdown; тесты потерянного вебхука и сироты.
- [ ] 3.5 Buyer `GET /orders/:id/payment` (активный, иначе последний терминальный; `payment: null`; URL только pending) и seller `GET /seller/orders/:id/payment` (без URL); 404 на чужих.
- [ ] 3.6 DB-тесты: успех, повтор после create и после `paid` (возврат платежа, не 409), повтор при manual_review → 409; `payment_pending` без active → 409 invalid_order_transition; параллельные вебхуки, гонка create/webhook (нет второй строки `payments`), mismatch → manual_review и блокировка нового платежа, canceled при другом платеже, unknown → 503, 5xx → тот же ключ ретраит / новый 409, 15 мин → manual_review → новый 409 `payment_requires_review`, 4xx → failed и новый ключ проходит, 429.
- [ ] 3.7 Логи/метрики: коды без PII/токена/тела, rate-limit вебхука 60/мин, no-store на всех ответах; runbook `payments-manual-review.md` с тремя исходами: платежа нет → canceled/new, возврат в ЮKassa → canceled/new, оплата подтверждена → succeeded/paid + provider id/paid_at.

## 4. UI оплаты (PR B)

- [ ] 4.1 `/orders/:id`: приоритет статуса платежа над заказом (`manual_review` → «Требует проверки», `pending` → «Ожидает оплаты» даже при `new`), «Оплатить» для `new`, `paid`; `Idempotency-Key` хранится на попытку (sessionStorage/ref), при 409 — перечитать `GET /orders/:id/payment`; return URL, polling 3 с до 60 с, «Проверить ещё раз».
- [ ] 4.2 `/checkout` → заказ: переход к оплате или честный статус «оплата не подключена».
- [ ] 4.3 `/admin/orders/:id` и список: статус/сумма оплаты, отдельный бейдж `manual_review`, `statusLabels` для новых статусов; без кнопки оплаты.
- [ ] 4.4 Ошибки 409/429/502 и manual_review: тексты без техники, disabled/double-submit, focus/labels, axe light/dark.

## 5. Проверка и evidence

- [ ] 5.1 Unit: crypto roundtrip/tamper/rotation, fake-провайдер, state HMAC, amount match.
- [ ] 5.2 API e2e: buyer → payment → fake complete → webhook → order paid; seller sees paid; replay no-op; unknown 503 → retry; 5xx same-key retry, 4xx new-key retry.
- [ ] 5.3 Browser e2e: оплата из заказа, возврат, статус, manual_review; axe; preview LCP <2500.
- [ ] 5.4 `pnpm verify`, `openspec validate 06-payments --strict`, bundle delta; evidence в `.scrum/sprints/3/evidence/S3-1-*`.
- [ ] 5.5 Live sandbox smoke после тестовых ключей владельца; без ключей — P3, не блокирует merge.
