# ADR 0004: приём платежей через ЮKassa

Статус: accepted.
Дата: 2026-11-27.
Владелец: Local Hand.
Связанные документы: `openspec/changes/06-payments/`,
`docs/stack/adr/0003-orders.md`,
`docs/stack/runbooks/payments-manual-review.md`,
`docs/stack/runbooks/payments-rollback.md`,
`docs/quality/threat-model.md`.

## Контекст

- Sprint 3 добавляет оплату заказа на странице ЮKassa: покупатель платит,
  продавец видит статус, деньги идут продавцу; платформа не принимает их на
  свой счёт.
  Поведение — `openspec/changes/06-payments/specs/payments/spec.md`.
- Один API-процесс Fastify + PostgreSQL 18, без Redis и отдельного
  job-сервера (`docs/stack/adr/0001-stack.md`). Идемпотентность — БД,
  advisory lock и уникальные индексы; reconcile — периодический проход в
  процессе API.
- Заказ создаётся как заявка (`new`) и не резервирует товар
  (`docs/stack/adr/0003-orders.md`). Оплата — следующий шаг после
  оформления; доставка и lifecycle заказа — отдельные change.
- Партнёрская схема ЮKassa: продавец подключает свой магазин через OAuth,
  платформа хранит ограниченный токен и создаёт платежи от его имени.
  Деньги и фискализация — на стороне продавца/ЮKassa; платформа не
  эмитирует чеки и не делает возвраты.
- Репозиторий публичный; реальные ключи, ПДн и скриншоты с ПДн в
  репозиторий не попадают.

## Решение

### Партнёрская схема и границы денег

- `POST /seller/payments/connect` создаёт одноразовый `state`
  (HMAC-SHA256, TTL 10 минут, `seller_id`) и возвращает `consentUrl`.
- `GET /seller/payments/callback` требует сессию продавца, проверяет
  HMAC/TTL и совпадение `seller_id`, обменивает `code`, получает account
  info, подписывает вебхуки, шифрует токен и активирует новую версию
  аккаунта. Ошибка подписки оставляет текущий active-аккаунт нетронутым,
  новая версия получает `error`.
- Платёж создаётся `POST /orders/:id/payments` с заголовком
  `Idempotency-Key` (UUID). Сумма — `orders.total_kopecks`, валюта RUB,
  `capture: true`; карта вводится на hosted-странице ЮKassa, платформа не
  видит карточные данные (PCI DSS не применяется).
- Возвраты, 54-ФЗ/ККТ и расчёты с продавцом — вне change. Платформа не
  обещает возврат: для оплаченного заказа новый платёж запрещён, возврат
  делает продавец/ops в кабинете ЮKassa. Юридический контур до реальных
  денег — P0 у владельца.

### Версии аккаунта и токен

- `seller_payment_accounts` — версии, не одна мутируемая строка. Частичный
  unique `(seller_id) WHERE status = 'active'`. Повторное подключение
  переводит старую версию в `superseded`; её токен остаётся для
  pending-платежей. `payments` ссылается на конкретную версию.
- Токен: AES-256-GCM, формат `version(1) || iv(12) || tag(16) ||
  ciphertext`; keyring `PAYMENTS_TOKEN_KEYS` и
  `PAYMENTS_TOKEN_KEY_VERSION` в env, ротация добавлением ключа. Токен
  никогда не пишется в БД/лог/ответ в открытом виде; UI видит только
  маскированный account id.
- Просроченный токен/401 → аккаунт `error`, create возвращает 409
  `seller_payment_unavailable`; reconcile использует более новую
  active-версию того же provider account, иначе после 3 неудач —
  `manual_review`.

### Fake, sandbox, live

- `PAYMENTS_ENV=live|sandbox|test` (default `live`). `live` запрещает
  fake-провайдер и `isTest`-аккаунты; `sandbox` — preview, `test` — CI и
  локальная разработка. `NODE_ENV` для выбора контура не используется.
- `fake`-провайдер детерминирован, живёт в памяти процесса и не делает
  сетевых вызовов. Его consent/complete-страницы (`/dev/payments/*`)
  существуют только в dev-сборке web; API-маршрут
  `POST /dev/payments/:id/complete` регистрируется только при
  fake + enabled + не-live и требует сессию покупателя этого платежа.
- `yookassa`-адаптер в этом change не реализован; включается только после
  реализации и полного набора `YOOKASSA_*`/`PAYMENTS_*`; в `live` redirect и
  webhook — только https. Contract-тесты адаптера — после его реализации на
  fixtures; реальные ключи и live smoke — после владельца (P3, не блокирует
  merge).

### Вебхук и reconcile

- `POST /payments/yookassa/webhook` без cookie, body limit 16 KiB,
  rate-limit 60/мин на IP. Тело — только подсказка: сервер находит
  платёж по `object.id` и вызывает `getPayment`; неизвестный платёж — 503,
  чтобы провайдер повторил доставку.
- Транзакция: advisory lock `order:{id}`, `SELECT ... FOR UPDATE` заказа и
  платежа; терминальный платёж — no-op 200. `succeeded` проверяет
  amount/currency/order; mismatch → `manual_review` и заказ остаётся
  `payment_pending`. `canceled` возвращает заказ в `new`, если нет другого
  активного платежа.
- Reconcile раз в 60 секунд и на старте: `pending` с provider id старше
  2 минут → `getPayment`; `pending` без provider id старше 15 минут →
  `manual_review` (исход вызова неизвестен, второй ключ не создаёт второе
  списание). 3 неудачные проверки → `manual_review`. Graceful shutdown
  останавливает новые проходы.
- `manual_review` — терминальный статус платежа, не статус заказа. Новый
  платёж и disconnect заблокированы до ручного разбора. Процедура —
  `docs/stack/runbooks/payments-manual-review.md` (три исхода: платежа
  нет → canceled/new; возврат в ЮKassa → canceled/new; оплата
  подтверждена → succeeded/paid + provider id/paid_at). SQL/ops-only.

### UI и честные статусы

- `/orders/:id` приоритезирует статус платежа: `manual_review` →
  «Требует проверки», `pending` → «Ожидает оплаты» даже при заказе `new`,
  `succeeded` → «Оплачен»; «Оплатить» доступна только для `new` без
  активного платежа. `Idempotency-Key` хранится на попытку в
  `sessionStorage`; новый ключ — только после терминальной неудачи.
- `?payment=return` включает polling `GET /orders/:id/payment` каждые 3
  секунды до 60 секунд, затем «Проверить ещё раз». 409
  `payment_in_progress`/`payment_requires_review` не показывается как
  ошибка: UI перечитывает платёж.
- Если платежа нет, `/orders` и `/orders/:id` честно пишут «Оплата не
  подключена»; после checkout одного заказа покупатель попадает на
  страницу заказа. 409 `seller_payment_unavailable` показывает, что
  продавец не подключил приём платежей.
- `/admin/shop`: карточка «Приём платежей» — `active|error|disabled|null`,
  тестовый бейдж, маскированный счёт, подключить/отключить/повторить.
  Disconnect при pending/manual_review — 409 с понятным текстом.
- `/admin/orders` и `/admin/orders/:id`: бейдж оплаты отдельно от статуса
  заказа, без кнопки оплаты. Все ответы платежей — `Cache-Control:
  no-store`, логи без телефона/комментария/токена/тела.

### Наблюдаемость и LCP (решение владельца)

- Логи: `payment_id`, `order_id`, `status`, `code`; без PII, токена и тела
  вебхука. SLO-дизайн: API p95 < 500 мс без сети провайдера, error rate
  < 1%, availability 99,5%. Алерты и field RUM — P3 до публичного
  запуска.
- Владелец 27.11.2026 выбрал **lab/preview LCP < 2500 мс как
  owner-approved DoD-прокси v1**; field p75/RUM — бэклог до публичного
  запуска. Это явное исключение, а не «field p75 выполнен». Бюджет
  проверяется на preview (`pnpm preview`, 4173) в `apps/web/e2e/perf.spec.ts`.
- Bundle-бюджет: ≤ +10% и ≤ +20 KiB gzip к предыдущему замеру; дельта
  фиксируется в evidence спринта.

## Альтернативы

- **Деньги на счёт платформы.** Отклонено продуктом: расчётный счёт,
  54-ФЗ/ККТ и расчёты с продавцом; платформа становится платёжным
  агентом.
- **Карта на нашей странице.** Отклонено: PCI DSS; hosted page провайдера.
- **Секретные ключи продавца вместо OAuth-токена.** Отклонено: больший
  радиус поражения, сложнее отзыв, нет партнёрской модели.
- **Одна мутируемая строка аккаунта.** Отклонено: reconnect ломает
  pending-платежи; нужны версии и токен старой версии.
- **Polling вместо вебхука.** Отклонено как единственный механизм:
  polling — fallback, reconcile — страховка; основной путь — вебхук.
- **200 на неизвестный вебхук.** Отклонено: 200 финализирует доставку,
  событие теряется; 503 + reconcile.
- **Идемпотентность по сумме/корзине.** Отклонено: явный
  `Idempotency-Key` переживает retry и не зависит от состава.
- **Автоматический возврат при mismatch.** Отклонено: возвраты вне
  change; ручной разбор в кабинете ЮKassa по runbook.

## Последствия

- Плюсы: деньги идут продавцу, платформа не хранит карты и не считает
  фискализацию; токен зашифрован и версионирован; двойное списание
  закрыто ключом, partial unique и order-lock; UI честно показывает
  оплату и manual_review.
- Минусы: OAuth-токен — секрет, компрометация ключа шифрования раскрывает
  токены; keyring и ротация обязательны. Reconcile живёт в одном
  процессе и не переживает рестарт, но подхватывает pending при старте;
  отдельный job — P3. In-memory rate-limit сбрасывается при рестарте.
- Минусы: возвраты, 54-ФЗ и lifecycle заказа вне change; до реальных
  денег нужны договор, юрпакет и тестовые ключи владельца. Live smoke —
  P3, не блокирует merge.
- Риск: manual_review требует ручной операции; ошибка ops может перевести
  заказ неверно. Митигация — runbook, транзакция с блокировками,
  backup перед изменением и запись в лог.
- Риск: PII (телефон/комментарий) остаётся в заказах; платёжные данные
  не собираются. no-store и логи без PII обязательны.
- Откат: revert кода + down SQL `payments-rollback.md`; платежи
  выгружаются до удаления таблиц.

## Источники

- `openspec/changes/06-payments/design.md`,
  `openspec/changes/06-payments/specs/payments/spec.md`.
- `docs/stack/adr/0003-orders.md` — заказы, PII, no-store,
  buyer/seller namespace.
- `docs/stack/runbooks/payments-rollback.md`,
  `docs/stack/runbooks/payments-manual-review.md`.
- `docs/quality/threat-model.md` — модель угроз платежей.
- [YooKassa API](https://yookassa.ru/developers/api) — payments,
  webhooks, idempotence, `/v3/me`, OAuth partner flow.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
  — аутентификация, сессии, защита данных.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  — что не попадает в логи.
