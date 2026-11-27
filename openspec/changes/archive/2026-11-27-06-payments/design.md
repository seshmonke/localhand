# Design: payments

## Context

- Buyer-core: `orders` на магазин, `order_status = 'new'`, телефон
  покупателя snapshot, ответы `no-store`, логи без PII.
- Продукт: деньги идут продавцу, платформа не принимает их на свой счёт;
  продавец подключает свой магазин к ЮKassa, платформа хранит
  ограниченный токен, а не секретные ключи.
- Один API-процесс Fastify + PostgreSQL; Redis и job-сервера нет.
  Идемпотентность — БД + advisory lock, как в checkout. Reconcile —
  периодический проход в процессе API.
- Sprint 3 — тестовый контур: fake-провайдер в dev/test, реальный
  ЮKassa-адаптер за env-флагом, live smoke — после ключей владельца.

## Decisions

### Провайдер-адаптер

Интерфейс `PaymentProvider`:

- `createConnection(state): { consentUrl }` — начало OAuth; callback URL
  зарегистрирован в приложении провайдера (`YOOKASSA_REDIRECT_URI`).
- `exchangeCode(code): { accessToken, expiresAt? }` — обмен кода; account
  id и `test`-флаг отдельно, из `GET /v3/me`.
- `getAccountInfo(token): { accountId, isTest }`.
- `subscribeWebhooks(token, url): void` — подписка на
  `payment.succeeded`/`payment.canceled`; без неё live-контур не получит
  `paid`.
- `unsubscribeWebhooks(token): void`.
- `createPayment(input): { providerPaymentId, status, confirmationUrl }`,
  `input`: `amountKopecks`, `currency: "RUB"`, `orderId`, `paymentId`,
  `idempotencyKey`, `returnUrl`, `capture: true`; `metadata` содержит
  `orderId` и локальный `paymentId`, чтобы найти платёж в кабинете при
  потерянном ответе.
- `getPayment(token, providerPaymentId): { status, amountKopecks,
  currency, orderId, paidAt? }`, `status`:
  `pending|succeeded|canceled`.
- `revoke(token)` — best effort.

`fake`-провайдер детерминирован: платёж `pending`, `confirmationUrl` —
внутренняя dev-страница, `getPayment` читает статус из fake-состояния.
Завершение платежа — `/dev/payments/:id/complete` только при
`PAYMENTS_PROVIDER=fake && PAYMENTS_FAKE_ENABLED=true`; endpoint требует
сессию покупателя этого платежа, иначе 404, и не регистрируется иначе.
Webhook-route зарегистрирован для всех провайдеров; в fake-режиме
e2e вызывает его напрямую после complete. Fake включается явно, в том
числе в preview для e2e, но не в production-конфиге.

`yookassa`-адаптер — HTTP-клиент с таймаутом; retry только на
idempotent GET; токены/ключи не логируются. Без `YOOKASSA_*` адаптер не
включается. Contract-тесты — на fixtures.

### Схема и миграции `0004`–`0005`

- `seller_payment_accounts` — версии аккаунта, не одна мутируемая
  строка:
  `id`, `seller_id` FK sellers restrict, `provider` text,
  `provider_account_id` text, `is_test` bool, `token_ciphertext` bytea,
  `token_key_version` smallint, `status`
  (`active|superseded|disabled|error`) default `error` (fail-closed:
  новая версия становится `active` только после успешного обмена и
  подписки на вебхуки), `expires_at`, `connected_at`, `updated_at`.
  Partial unique `(seller_id) WHERE status = 'active'` — один активный
  аккаунт. При повторном подключении старый становится `superseded`,
  его токен остаётся для pending-платежей; `payments` ссылается на
  конкретную версию аккаунта. UI видит только active.
- `payments`: `id`, `order_id` FK orders restrict,
  `seller_account_id` FK seller_payment_accounts restrict, `provider`,
  `provider_payment_id` text, `status`
  (`pending|succeeded|canceled|failed|manual_review`),
  `amount_kopecks` bigint check ≥0, `currency` char(3) default `RUB`,
  `confirmation_url` text null, `idempotency_key` uuid, `created_at`,
  `updated_at`, `paid_at`, `reconcile_attempts` smallint default 0
  check ≥0 (неудачные попытки reconcile), `last_checked_at`
  timestamptz null (последняя проверка провайдера).
  - unique `(order_id, idempotency_key)` (UUID в нижнем регистре);
  - partial unique `payments(order_id) WHERE status IN
    ('pending','manual_review')` — один активный/спорный платёж;
  - partial unique `provider_payment_id WHERE provider_payment_id IS NOT
    NULL`;
  - partial index `payments_pending_reconcile_idx(created_at) WHERE
    status = 'pending'` — выборка pending для reconcile без полного
    скана.
- `order_status` расширяется `payment_pending`, `paid`. `capture: true`,
  поэтому `waiting_for_capture` не используется.
- Схема меняется двумя аддитивными миграциями: `0004` (enum и
  таблицы) и `0005` (fail-closed default `error`, reconcile-поля и
  partial index). Опубликованную `0004` не меняем; инстанс с
  промежуточной `0004` из ветки до split лечится идемпотентной `0005`.
- Down SQL: остановить трафик, выгрузить платежи, сначала откатить
  `0005` (drop index/constraint/columns, вернуть default `active`),
  затем `UPDATE orders SET status='new' WHERE status IN
  ('payment_pending','paid')`, удалить `payments`/
  `seller_payment_accounts`, оставить значения enum (PostgreSQL не умеет
  `DROP VALUE`); старый код читает только `new`. При повторном деплое
  `0004` + `0005` — `ADD VALUE IF NOT EXISTS`/идемпотентные
  колонки/индекс и чистка журнала drizzle, как в `orders-rollback.md`. Полный rebuild enum — только скрипт с downtime
  и потерей статусов. Runbook:
  `docs/stack/runbooks/payments-rollback.md`.

### Шифрование токена

- AES-256-GCM. `token_ciphertext` = `version(1) || iv(12) || tag(16) ||
  ciphertext`.
- Keyring: `PAYMENTS_TOKEN_KEYS` — JSON `{"1":"base64key",...}`,
  `PAYMENTS_TOKEN_KEY_VERSION` — текущая версия. Ротация: добавить ключ,
  переключить версию, старые расшифровываются по версии.
- Тесты: roundtrip, tamper tag, неизвестная версия, ротация.
- Токен не пишется в лог/ответ/БД в открытом виде.

### Подключение продавца

- `POST /seller/payments/connect` (seller auth) создаёт одноразовый
  `state` (HMAC `PAYMENTS_STATE_SECRET`, TTL 10 минут, seller_id) и
  возвращает `consentUrl`.
- `GET /seller/payments/callback?code&state`: требует сессию продавца,
  проверяет HMAC/TTL и `state.sellerId == session.userId`, обменивает
  code (code одноразовый у провайдера), получает account info,
  подписывает вебхуки, шифрует токен, активирует новую версию аккаунта,
  старую — `superseded`. Если `subscribeWebhooks` упал, текущий active
  не трогается; новая версия получает `error`, платежи не создаются;
  UI показывает «Повторить подключение».
- `GET /seller/payments/account` возвращает текущую версию со статусом
  `active|error|disabled` или `null`: маскированный account id,
  `isTest`, `expiresAt`. `DELETE` — `disabled`, токен сохраняется для
  pending-платежей; при активных платежах — 409. При отключении
  вызывается `unsubscribeWebhooks`, `revoke` — best effort; повторная
  подписка идемпотентна.
- Окружение задаётся явно: `PAYMENTS_ENV=live|sandbox|test` (default
  `live`). В `live` запрещены fake-провайдер и `isTest`-аккаунты:
  подключение тестового магазина отклоняется со статусом `error`.
  `sandbox` — preview, `test` — CI/локально; оба разрешают тестовый
  контур. `NODE_ENV` для этого не используется.
- `isTest` показывается бейджем «Тестовый магазин». Просроченный
  токен/401 при create/webhook/reconcile → аккаунт `error`, UI просит
  переподключить; create возвращает 409 `seller_payment_unavailable`,
  webhook — 502. Reconcile: если есть более новая active-версия с тем же
  `provider_account_id`, повторяет `getPayment` её токеном; иначе после
  3 неудач переводит платёж в `manual_review` для ops.

### Создание платежа

- `POST /orders/:id/payments`, buyer auth, header `Idempotency-Key`
  (UUID, иначе 400). Заказ принадлежит buyer; иначе 404.
- Продавец с active account, и `account.seller_id == shop.seller_id`
  заказа; иначе 409 `seller_payment_unavailable`. Сумма
  `orders.total_kopecks`, RUB; 0 → 409 `zero_amount`.
- Транзакция: advisory lock `order:{id}`; **внутри lock сначала**
  искать `payments` по `(order_id, idempotency_key)`. Если найден —
  применить replay-правила и вернуть его **до** статусного гейта,
  независимо от статуса заказа. Только для нового ключа:
  `SELECT orders ... FOR UPDATE`; `paid` → 409 `order_already_paid`;
  затем **независимо от статуса заказа** проверить active-платёж
  (`pending` → 409 `payment_in_progress`, `manual_review` → 409
  `payment_requires_review`); только `new` без active идёт дальше.
  `payment_pending` без active → 409 `invalid_order_transition` до
  reconcile/manual review.
  Создать `payments` row `pending` со ссылкой на account-версию;
  закоммитить. Unique violation по partial active-индексу маппится в
  тот же 409, а не в 500. **Вызов провайдера — вне транзакции**, чтобы не держать
  lock и соединение на сети; timeout провайдера — 10 секунд.
- Повтор с тем же ключом:
  - `manual_review` — 409 `payment_requires_review`, без URL;
  - `pending` с provider id — вернуть платёж и URL;
  - `succeeded`/`canceled` — вернуть платёж без URL (URL только
    `pending`);
  - строка `failed` без provider id (явный 4xx) — повторно пройти
    гейт под order-lock: `paid` → 409 `order_already_paid`, другой
    active/`manual_review` → 409, только `new` без active — выбрать
    active-аккаунт продавца `FOR SHARE`, перевести строку в `pending`
    с этой версией аккаунта, сбросить `createdAt`, затем повторить
    `createPayment` с тем же provider idempotency key вне транзакции;
  - строка `pending` без provider id (краш/таймаут) — тот же ключ
    повторяет вызов; новый ключ получает 409, пока reconcile не
    переведёт сироту в `manual_review` через 15 минут.
- После ответа провайдера: под order-lock перечитать строку; если она
  уже `failed`/`manual_review` — не сохранять URL, отменить платёж у
  провайдера best effort и вернуть 409. Иначе сохранить
  `provider_payment_id`, `confirmation_url`; условно перевести заказ
  `new → payment_pending` (`UPDATE ... WHERE status = 'new'`). Если
  заказ уже не `new` — не перезаписывать, платёж оставить для
  reconcile.
- Ошибки провайдера:
  - 401/403 → аккаунт `error`, 409 `seller_payment_unavailable`;
  - другой явный 4xx (платёж не создан) → `failed`, 502, новый ключ
    разрешён;
  - 5xx/timeout (исход неизвестен) → строка остаётся `pending`, 502,
    тот же ключ повторяет вызов, новый ключ получает 409. Reconcile
    через 15 минут переводит такую сироту в `manual_review`, а не
    `failed`, чтобы новый ключ не создал второе списание.
  - `provider_payment_id` уже привязан к другой строке → текущая
    строка `failed` без provider id/URL, 409, лог
    `payment_provider_id_conflict`; чужой платёж не отменяется.
  - create вернул терминальный статус ≠ `pending` → строка
    `manual_review` с provider id и без URL, 409
    `payment_requires_review`, лог; URL клиенту не отдаётся.
- Rate-limit: 5 попыток в минуту на buyer; 429.

### Вебхук и reconcile

- `POST /payments/yookassa/webhook` без cookie; body limit; JSON.
- Не доверять телу: `object.id` → найти `payments` по
  `provider_payment_id`; если нет — вернуть 503, чтобы провайдер
  повторил (не 200: 200 финализирует доставку), и записать
  `webhook_unknown_payment`; reconcile ищет только строки с provider id,
  поэтому 503 даёт create время закоммитить.
- Для найденного платежа: загрузить account-версию, вызвать
  `getPayment(accountToken, id)`. Тело — только подсказка.
- Транзакция: advisory lock `order:{orderId}` + `SELECT orders FOR
  UPDATE` + `SELECT payments FOR UPDATE`; если платёж уже `succeeded` —
  no-op 200.
- `canceled`: платёж `canceled`; заказ `payment_pending → new` только
  если нет другого активного/спорного платежа; иначе оставить статус.
- `succeeded`: проверить amount/currency/orderId. Mismatch → платёж
  `manual_review`, заказ остаётся `payment_pending`, лог
  `payment_amount_mismatch`, 200 (событие финализировано), новый
  платёж запрещён partial unique; runbook — ручная проверка, возврат
  делает продавец/ops в кабинете ЮKassa вне платформы. Иначе платёж
  `succeeded`, `paid_at`, заказ `paid` (только из
  `payment_pending`).
- Неизвестный статус провайдера → `manual_review`, 200, алерт-лог.
- `manual_review` — терминальный до ручного разбора: заказ остаётся
  `payment_pending`, новый платёж и disconnect заблокированы. Runbook
  `payments-manual-review.md` (в PR B) определяет три исхода:
  платежа у провайдера нет (поиск по `metadata.orderId`/`paymentId`)
  → `canceled`, заказ `new`; возврат подтверждён в кабинете ЮKassa
  (деньги возвращает продавец/ops вне платформы) → `canceled`, заказ
  `new`; оплата подтверждена → `succeeded`, заказ `paid`. SQL/скрипт
  и запись в лог — только владелец/ops.
- Ошибка `getPayment` → 502/503, ничего не менять, провайдер повторит.
- Reconcile: раз в 60 секунд (и на старте, с graceful shutdown)
  выбирать `pending` с provider id старше 2 минут и
  `order_status=payment_pending` без терминального платежа, вызывать
  `getPayment`; `pending` без provider id старше 15 минут →
  `manual_review` (не `failed`: исход вызова неизвестен). Условие
  выборки — `pending` с provider id и заказ `payment_pending`;
  выборку ускоряет partial index `payments_pending_reconcile_idx` по
  `created_at WHERE status = 'pending'`. Каждая неудачная проверка
  увеличивает `reconcile_attempts` и пишет `last_checked_at`; после 3
  неудачных попыток платёж уходит в `manual_review`.
  Reconcile берёт тот же order-lock и перечитывает платёж/заказ под
  ним, поэтому не гоняется с вебхуком. 401 токена → аккаунт `error`;
  если есть новая active-версия с тем же `provider_account_id`,
  использовать её токен, иначе после 3 неудач — `manual_review`.
  `getPayment` выполняется до короткой транзакции, чтобы сетевой вызов
  не держал order-lock. На graceful shutdown новые платежи в проходе не
  начинаются, текущий вызов ограничен 10-секундным timeout, затем
  процесс закрывается.

### Чтение и UI

- Buyer: `GET /orders/:id/payment` — свой заказ; `payment: null` если
  платежа нет; иначе активный (`pending`/`manual_review`), а если
  активного нет — последний терминальный; `confirmationUrl` только для
  `pending`.
- Seller: `GET /seller/orders/:id/payment` — заказ своего магазина; без
  `confirmationUrl` и токена. Buyer/seller namespace разделён, как в
  ADR 0003.
- `/orders/:id`: UI приоритезирует статус платежа над статусом
  заказа: `manual_review` → «Требует проверки», `pending` → «Ожидает
  оплаты» (даже если заказ `new`), иначе «Оплатить» для `new`,
  «Оплачен» для `paid`. `Idempotency-Key` попытки хранится в
  `sessionStorage`/ref и переиспользуется при retry; return
  `/orders/:id?payment=return`, polling 3 с до 60 с, затем «Проверить
  ещё раз». При 409 из-за ключа другой вкладки UI перечитывает
  `GET /orders/:id/payment` и показывает активный платёж.
- `/admin/shop`: карточка «Приём платежей» — active/error/disabled,
  тестовый бейдж, подключить/отключить, переподключить.
- `/admin/orders/:id`: статус оплаты и сумма, без кнопки; списки
  обновляют `statusLabels` для новых статусов.
- Все ответы платежей — `no-store`.

### Безопасность и логи

- Токены: AES-256-GCM + keyring; plaintext никогда не в БД/логе/ответе.
- Вебхук: server-side `getPayment`, amount/currency/order match,
  идемпотентность, body limit, rate-limit 60/мин на IP.
- Логи: `payment_id`, `order_id`, `status`, `code`; без телефона,
  комментария, токена, card data, тела вебхука.
- Authz: buyer — свой заказ, seller — свой магазин; чужие — 404.
- CSRF: существующая SameSite-cookie; вебхук без cookie.
- Manual review: payment/order не двигаются, новый платёж запрещён,
  runbook и безопасный лог; метрики/алерты — P3.

## Alternatives

- **Деньги на счёт платформы.** Отклонено продуктом: расчётный счёт,
  54-ФЗ/ККТ, расчёты с продавцом.
- **Карта на нашей странице.** Отклонено: PCI DSS; hosted page.
- **Polling вместо вебхука.** Отклонено как единственный механизм;
  polling — fallback, reconcile — страховка.
- **Один платёж на все заказы.** Отклонено: заказ на магазин, свой
  аккаунт и платёж.
- **Хранить секретные ключи продавца.** Отклонено: только OAuth-токен,
  зашифрованный.
- **Одна мутируемая строка аккаунта.** Отклонено: reconnect ломает
  старые pending-платежи; нужны версии.
- **200 на неизвестный вебхук.** Отклонено: 200 финализирует доставку,
  событие теряется; 503 + reconcile.
- **Идемпотентность по сумме.** Отклонено: явный `Idempotency-Key`.

## Risks

- Партнёрская схема ЮKassa требует договор/доступ; без них fake и
  адаптер готовы, live — после владельца.
- OAuth-токен — секрет; утечка ключа шифрования компрометирует токены.
  Ключ только в env, не в репозитории; keyring для ротации.
- Reconcile в одном процессе не переживает рестарт, но подхватывает
  pending при следующем старте; отдельный job — P3.
- Refunds/отмена оплаченного — вне change; 409, чтобы не обещать
  возврат.
- Юрпакет и 54-ФЗ до реальных денег — P0; change не включает
  фискализацию.
- PBI большой: два PR/цикла — foundation (схема/контракты/крипто/
  адаптер) и flow (аккаунт/платёж/вебхук/UI), чтобы держать ревью
  управляемым. `08-order-lifecycle` позже расширит и `payments`
  (shipped/delivered), после архивации `06`.

## Sources

- `https://yookassa.ru/developers/api` — payments, webhooks,
  idempotence, `/v3/me`, OAuth partner flow.
- `docs/stack/adr/0003-orders.md` — заказы, PII, no-store,
  buyer/seller namespace.
- `docs/concept/product.md` — партнёрская схема, деньги продавцу.
