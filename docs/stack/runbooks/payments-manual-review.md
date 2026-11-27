# Runbook: разбор платежа в `manual_review`

Статус: ops-only. Выполняет владелец или назначенный ops-инженер.
Платёж в `manual_review` — терминальный статус: заказ остаётся
`payment_pending`, новый платёж и disconnect заблокированы, пока платёж не
разобран. Автоматического возврата и автоматического перевода в `paid` нет.

Связанные документы: `docs/stack/adr/0004-payments.md`,
`docs/stack/runbooks/payments-rollback.md`,
`openspec/changes/archive/2026-11-27-06-payments/design.md`.

## Когда применять

Платёж попадает в `manual_review`, если:

- `succeeded` от провайдера не совпал по сумме/валюте/заказу;
- провайдер вернул неизвестный статус;
- reconcile 3 раза не смог получить статус (401/ошибка токена/сеть);
- `pending` без provider id старше 15 минут (исход создания неизвестен).

Симптомы: в `/admin/orders/:id` у платежа бейдж «Требует проверки», у
заказа — «Ожидает оплаты»; покупатель видит «Требует проверки» и не может
заплатить повторно.

## Правила

- Только владелец/ops. Агенты и продавцы не выполняют эти SQL.
- Сначала read-only проверка и backup, потом изменение. Одна транзакция на
  платёж и заказ, с блокировками.
- Не менять статус заказа из других состояний; не удалять платежи; не
  трогать `token_ciphertext`; не логировать телефон, комментарий, токен и
  тело вебхука.
- Возврат денег — только в кабинете ЮKassa продавцом/ops. Платформа
  возвратов не делает и не обещает.
- После разбора записать в тикет/журнал инцидента: `payment_id`,
  `order_id`, исход, `provider_payment_id`, `paid_at`, кто и когда.

## 1. Зафиксировать состояние и сделать backup

```bash
pg_dump "$DATABASE_URL" --data-only \
  --table=public.payments \
  --table=public.orders > manual-review-backup-$(date -u +%Y%m%dT%H%M%SZ).sql
```

Файл содержит ПДн (телефон в `orders`) — хранить в защищённом месте, не
коммитить и не пересылать в открытых каналах.

```sql
-- Платёж и заказ. Заменить :payment_id и :order_id.
SELECT p.id, p.order_id, p.status, p.provider, p.provider_payment_id,
       p.amount_kopecks, p.currency, p.created_at, p.updated_at,
       p.reconcile_attempts, p.last_checked_at
FROM payments p
WHERE p.id = :payment_id;

SELECT o.id, o.status, o.total_kopecks, o.created_at, o.updated_at
FROM orders o
WHERE o.id = :order_id;

-- Не должно быть другого активного/спорного платежа по заказу.
SELECT id, status, provider_payment_id
FROM payments
WHERE order_id = :order_id AND status IN ('pending', 'manual_review');
```

Проверить платёж в кабинете ЮKassa: поиск по `provider_payment_id`, а если
его нет — по `metadata.orderId`/`metadata.paymentId` (локальный
`payments.id`). Ниже — три исхода.

## 2. Исход A: платежа у провайдера нет

Признак: в кабинете ЮKassa платежа нет, деньги не списаны.

```sql
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('order:' || :order_id, 0));

-- Убедиться под блокировкой: заказ payment_pending, платёж manual_review.
SELECT id, status FROM orders WHERE id = :order_id FOR UPDATE;
SELECT id, status FROM payments WHERE id = :payment_id FOR UPDATE;

UPDATE payments
SET status = 'canceled',
    confirmation_url = NULL,
    updated_at = now()
WHERE id = :payment_id
  AND order_id = :order_id
  AND status = 'manual_review';

UPDATE orders
SET status = 'new',
    updated_at = now()
WHERE id = :order_id
  AND status = 'payment_pending';

COMMIT;
```

Если `UPDATE orders` затронул 0 строк — не коммитить: статус заказа уже
другой, разбираться отдельно. После коммита покупатель может создать новый
платёж; partial unique больше не блокирует.

## 3. Исход B: возврат подтверждён в ЮKassa

Признак: платёж был, деньги возвращены продавцом/ops в кабинете ЮKassa
(вне платформы). Возврат не проходит через API.

Действия те же, что в исходе A: платёж `canceled`, заказ `new`, новый
платёж разрешён. В журнал добавить: «возврат выполнен в ЮKassa, refund id
…, дата …». Не вызывать refund из платформы.

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('order:' || :order_id, 0));
SELECT id, status FROM orders WHERE id = :order_id FOR UPDATE;
SELECT id, status FROM payments WHERE id = :payment_id FOR UPDATE;

UPDATE payments
SET status = 'canceled', confirmation_url = NULL, updated_at = now()
WHERE id = :payment_id AND order_id = :order_id AND status = 'manual_review';

UPDATE orders
SET status = 'new', updated_at = now()
WHERE id = :order_id AND status = 'payment_pending';

COMMIT;
```

## 4. Исход C: оплата подтверждена

Признак: в кабинете ЮKassa платёж `succeeded`, сумма и заказ совпадают.
Записать `provider_payment_id` и `paid_at` из кабинета.

```sql
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('order:' || :order_id, 0));

SELECT id, status FROM orders WHERE id = :order_id FOR UPDATE;
SELECT id, status FROM payments WHERE id = :payment_id FOR UPDATE;

UPDATE payments
SET status = 'succeeded',
    provider_payment_id = :provider_payment_id,
    paid_at = :paid_at,
    confirmation_url = NULL,
    updated_at = now()
WHERE id = :payment_id
  AND order_id = :order_id
  AND status = 'manual_review';

UPDATE orders
SET status = 'paid',
    updated_at = now()
WHERE id = :order_id
  AND status = 'payment_pending';

COMMIT;
```

`provider_payment_id` должен быть уникален (partial unique): если он уже
привязан к другой строке, транзакция упадёт — не подавлять ошибку,
разбираться с конфликтом вручную. `paid_at` — timestamp with time zone из
кабинета, не «сейчас».

## 5. Проверка после разбора

```sql
SELECT id, order_id, status, provider_payment_id, paid_at, updated_at
FROM payments WHERE id = :payment_id;

SELECT id, status, updated_at FROM orders WHERE id = :order_id;
```

Ожидаемо:

- A/B: `payments.status = 'canceled'`, `orders.status = 'new'`,
  `provider_payment_id` не менялся (может остаться прежним для истории);
- C: `payments.status = 'succeeded'`, `orders.status = 'paid'`,
  `provider_payment_id` и `paid_at` заполнены.

Проверить в UI: `/admin/orders/:order_id` — бейдж оплаты соответствует
исходу, у заказа отдельный статус; `/orders/:id` у покупателя — тот же
статус. Новый платёж после A/B создаётся, после C — 409
`order_already_paid`.

## 6. Логи и наблюдаемость

- В логах API искать `payment_id`/`order_id`; тела вебхука и PII там нет
  по дизайну. Если для разбора нужен запрос к провайдеру, токен не
  печатать.
- Запись в журнал инцидента: время, `payment_id`, `order_id`, исход
  (A/B/C), `provider_payment_id`, `paid_at`, кто выполнил, ссылка на
  backup. Без телефона и комментария покупателя.
- Метрики/алерты по manual_review — P3 до публичного запуска.

## 7. Если что-то пошло не так

- Транзакция не закоммичена — изменения откатываются, повторить после
  проверки предусловий.
- Ошибка unique по `provider_payment_id` — не подавлять; найти вторую
  строку, разобрать оба платежа, при необходимости эскалировать владельцу.
- Нужно откатить весь контур платежей — `payments-rollback.md`, не
  смешивать с ручным разбором.
