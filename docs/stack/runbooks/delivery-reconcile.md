# Runbook: reconcile доставки

Статус: ops-only. Reconcile — страховка на случай потерянного вебхука
CDEK. Он не создаёт отправления и не переводит `quoted` в `failed`.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/runbooks/delivery-cdek-webhook.md`,
`docs/stack/runbooks/delivery-manual-track.md`,
`docs/quality/threat-model.md` (D5, D6, D10, D15).

## Расписание и выборка

- Первый проход — на `onReady` API, далее каждые 60 секунд. Интервал —
  константа `DELIVERY_RECONCILE_INTERVAL_MS` в коде, не env; порог
  «старше 2 минут» — `DELIVERY_RECONCILE_AGE_MS`. Один таймер на
  процесс; проход не запускается повторно, пока предыдущий в полёте.
- Кандидаты: `order_deliveries.status IN ('created','in_transit')`,
  `provider_order_id IS NOT NULL`, и `last_status_at` старше 2 минут
  (если `last_status_at IS NULL` — `updated_at` старше 2 минут).
- Батч — 50 строк, порядок `updated_at ASC, id ASC`. Провайдер
  вызывается до короткой транзакции; медленный CDEK не держит row lock.
- На каждый кандидат: `getShipment(provider_order_id)`; статус
  маппится, применяется в транзакции с `FOR UPDATE`; старый/регрессивный
  статус не понижает текущий. Событие пишется с unique
  `(delivery_id, status_code, occurred_at)`.

## Touch и starvation

Если CDEK вернул ошибку, `null`, старый статус или конфликт, reconcile
делает **touch**: обновляет `order_deliveries.updated_at = now()` даже
без смены статуса. Поэтому проблемная строка уходит в конец очереди и не
занимает весь батч из 50. Тест:
`apps/api/src/delivery/delivery.reconcile.db.test.ts` — «does not starve
the 51st delivery behind 50 failing rows».

Если все 50 строк постоянно падают, 51-я ждёт следующего прохода. Это
нормальное поведение, а не потеря: проверять причину ошибок провайдера.

## Что смотреть

Логи API:

| Код | Значение | Действие |
|---|---|---|
| `delivery_reconcile_applied` | статус применён | Сверить `last_status_code`/`last_status_at` |
| `delivery_reconcile_failed` (message «row failed») | исключение на одной строке | Разобрать `delivery_id/order_id`; остальные строки продолжаются |
| `delivery_reconcile_provider_error` | `getShipment` упал | Проверить CDEK/OAuth/сеть; строка получила touch |
| `delivery_reconcile_failed` (message «pass failed») | упал весь проход | Проверить БД/процесс; следующий проход через 60 с |

Логи содержат `delivery_id`, `order_id`, `provider`, `status/code`;
без имени, телефона, адреса ПВЗ и raw payload. Проверка:
`apps/api/src/delivery/delivery.reconcile.edge.db.test.ts` — «delivers
shop B while shop A fails…» (asserts no PII in logs).

SQL для диагностики:

```sql
-- Застрявшие доставки: кандидаты reconcile.
SELECT id, order_id, status, provider_order_id, provider_number,
       last_status_code, last_status_at, updated_at
FROM order_deliveries
WHERE status IN ('created', 'in_transit')
  AND provider_order_id IS NOT NULL
  AND COALESCE(last_status_at, updated_at) < now() - interval '2 minutes'
ORDER BY updated_at ASC, id ASC
LIMIT 50;

-- Свежие события по доставке.
SELECT status_code, status_name, occurred_at, created_at
FROM delivery_events
WHERE delivery_id = <delivery_id>
ORDER BY occurred_at DESC, id DESC
LIMIT 20;

-- `quoted` без отправления: reconcile их не трогает.
SELECT id, order_id, status, updated_at
FROM order_deliveries
WHERE status = 'quoted'
ORDER BY updated_at ASC
LIMIT 50;
```

## Действия

1. **Провайдер недоступен/OAuth 401.** Проверить `CDEK_CLIENT_ID/SECRET`,
   `CDEK_API_URL`, статус CDEK. Не менять статусы SQL-ом.
2. **Одна строка падает, остальные идут.** Найти `delivery_id/order_id` в
   логах, проверить `provider_order_id` в кабинете CDEK. Если заказ
   удалён/чужой — ручной разбор с владельцем; manual — только по
   `delivery-manual-track.md`.
3. **Статус не приходит, но заказ у CDEK есть.** Дождаться следующего
   прохода; проверить `GET /v2/orders/{uuid}` вручную read-only. Не
   вставлять `delivery_events` SQL-ом.
4. **`quoted` висит > 24 часов.** Reconcile не меняет статус `quoted`
   автоматически, `failed` не ставится. UI показывает «Ожидает
   отправки»; создание отправления — отдельное действие продавца.
   Связаться с продавцом; manual не перезаписывает CDEK. Отдельного
   24-часового лога/бейджа нет — это backlog.
5. **Штатное выключение/рестарт.** Fastify `onClose` останавливает
   таймер, abort-сигнал прекращает проход между строками; дождаться
   завершения. Ручной запуск прохода в проде не предусмотрен — рестарт
   API делает `runNow`.

## Один инстанс

Reconcile живёт в процессе API, отдельного job нет. При двух инстансах
оба опрашивают CDEK и обновляют `updated_at`; статусы идемпотентны, но
нагрузка на провайдера удваивается. До распределённой блокировки (P3)
держать один API-процесс. Не запускать параллельно cron/скрипт,
который делает те же `getShipment`.

## Эскалация

- Потеря статусов > 30 минут: `#incident`, owner S3-2.
- Ошибки БД/транзакций reconcile: DevSecOps + backup перед действиями.
- Подозрение на дубль отправления: остановить retry/manual, проверить
  `im_number` в CDEK, разбор по `delivery-manual-track.md`.
