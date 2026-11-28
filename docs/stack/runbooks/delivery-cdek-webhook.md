# Runbook: вебхук СДЭК `ORDER_STATUS`

Статус: ops-only. Выполняет владелец или назначенный ops-инженер.
Вебхук — публичный endpoint без подписи CDEK; тело запроса считается
подсказкой, а не доверенным статусом. CDEK сам делает POST на наш
endpoint, а мы отвечаем `404`/`502` (или `200` на валидный/replay);
CDEK повторяет доставку по своей политике.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/runbooks/delivery-reconcile.md`,
`docs/stack/runbooks/delivery-manual-track.md`,
`docs/stack/runbooks/delivery-rollback.md`,
`docs/quality/threat-model.md` (D4, D5, D16).

## Когда применять

- Статус доставки не меняется после события CDEK.
- CDEK получает от нас `404`/`502` на свой POST и повторяет доставку.
- Нужно проверить подписку `ORDER_STATUS` на собственном аккаунте.
- После рестарта API в логе `delivery_webhook_subscription_failed`.

## Контракт endpoint

`POST /delivery/cdek/webhook`, `Content-Type: application/json`.

```json
{
  "type": "ORDER_STATUS",
  "uuid": "<provider order uuid>",
  "attributes": { "number": "order-7", "cdek_number": "1234567890", "code": "DELIVERED" }
}
```

Обработка:

1. Найти `order_deliveries` по `uuid` (`provider_order_id`). Нет строки —
   `404`, событие не создаётся.
2. Сверить `attributes.number` с `provider_number`/`order-{id}`, а
   `attributes.cdek_number` — с `provider_number`/`track_number`.
   Несовпадение — `404`.
3. Проверить заказ у CDEK: `GET /v2/orders/{uuid}`. Ошибка/таймаут —
   `502`; провайдер повторит доставку.
4. Применить статус идемпотентно: unique
   `(delivery_id, status_code, occurred_at)`. Валидный replay — `200`
   no-op; старый/регрессивный статус — `200` без записи.
5. Ответы: `400` — невалидное тело; `404` — неизвестный заказ/номер;
   `429` — больше 60 запросов в минуту с IP; `502` — проверка не удалась
   или провайдер выключен. Все ответы `no-store`.

Логи: `delivery_id`, `order_id`, `provider`, `status/code`; без имени,
телефона, адреса ПВЗ, raw payload и `payloadHash`. Телефон получателя
берётся из `orders.buyer_phone` — это snapshot на checkout, не сессия в
момент создания отправления.

`CDEK_WEBHOOK_URL` в `DELIVERY_ENV=test` может быть
`http://localhost:3000/delivery/cdek/webhook` (env-guard разрешает
localhost); в live — только `https`. Общая тестовая учётная запись для
проверки вебхука не подходит: у неё уже 4 подписки (см. ниже).

## Общая тестовая учётная запись

`docs/stack/integrations/cdek.md` фиксирует: общая тестовая учётная
запись CDEK уже имеет **четыре** подписки (проверено 27.11.2026). Её
подписки **не удалять, не изменять и не пересоздавать**. На ней
`ensureOrderStatusWebhook` сначала ищет подписку на текущий URL: при
совпадении — no-op; если совпадения нет и `webhooks.length >= 2`,
выбрасывается `DeliveryWebhookConflictError`, и API пишет
`delivery_webhook_subscription_failed reason=conflict`. Это ожидаемое
поведение, а не сбой приложения.

Для проверки вебхука нужен отдельный тестовый аккаунт CDEK с
собственными `client_id`/`client_secret` и одной подпиской на наш URL.
Действия с подписками ниже применимы только к такому отдельному
аккаунту.

## 1. Проверить подписку (только собственный аккаунт)

```bash
# Только чтение. Только для отдельного аккаунта, не для shared.
# Токен не печатать в тикете/чате.
curl -sS -H "Authorization: Bearer $CDEK_ACCESS_TOKEN" \
  "$CDEK_API_URL/v2/webhooks"
```

Ожидается одна подписка `type=ORDER_STATUS` с URL
`$CDEK_WEBHOOK_URL` (в test допустим
`http://localhost:3000/delivery/cdek/webhook`, в live — только https).
На обычном клиенте CDEK допускает **не более двух** подписок; у общей
тестовой учётной записи уже четыре, их не трогать.

- Совпадение по типу и URL — подписка есть, переходить к шагу 2.
- Подписки нет, всего 0–1 — при следующем старте API
  `ensureOrderStatusWebhook` создаст её; можно создать вручную тем же
  `POST /v2/webhooks`.
- Две чужие подписки на собственном аккаунте — API пишет
  `delivery_webhook_subscription_failed reason=conflict` и **не**
  создаёт третью. Удалить лишнюю можно только на своём аккаунте:

```bash
# Только собственный аккаунт. Никогда не выполнять для shared-аккаунта.
curl -sS -X DELETE -H "Authorization: Bearer $CDEK_ACCESS_TOKEN" \
  "$CDEK_API_URL/v2/webhooks/<uuid>"
```

Удалять только подтверждённо чужую/устаревшую подписку собственного
аккаунта. Не удалять подписку, которая указывает на текущий
`CDEK_WEBHOOK_URL`. Подписки общей тестовой учётной записи не удалять
ни при каких условиях.

## 2. Проверить локальный заказ

```sql
SELECT d.id AS delivery_id, d.order_id, d.provider, d.status,
       d.provider_order_id, d.provider_number, d.track_number,
       d.last_status_code, d.last_status_at, d.updated_at
FROM order_deliveries d
WHERE d.provider_order_id = '<uuid>';
```

Если строки нет — вебхук вернёт `404`: заказ не создан этим аккаунтом
или `uuid` чужой. Не создавать событие вручную.

## 3. Разобрать ответ

| Ответ | Причина | Действие |
|---|---|---|
| `400` | Тело не соответствует схеме | Проверить формат `ORDER_STATUS` у CDEK; не менять endpoint |
| `404` | Нет локального заказа или не совпал номер | Сверить `provider_order_id`/`number`; при потере — reconcile/manual |
| `429` | Больше 60 запросов/мин с IP | Проверить всплеск/абьюз; подождать, CDEK повторит |
| `502` | `GET /v2/orders/{uuid}` недоступен, OAuth/токен, провайдер выключен | Проверить CDEK, креды, `DELIVERY_PROVIDER`; не менять статус вручную |
| `200` | Валидный статус или replay | Сверить `last_status_code`/`last_status_at`; при необходимости — replay |

`502` не означает потерю заказа: reconcile 60 с опрашивает
`created|in_transit` старше 2 минут. Если статус так и не пришёл —
`delivery-reconcile.md`.

## 4. Replay

Повторная доставка того же события — штатный сценарий. CDEK повторяет
POST с тем же `uuid`/`code`; сервер вернёт `200`, повторно событие не
создаст. Если нужно проверить статус без вебхука, дождаться прохода
reconcile (`delivery-reconcile.md`); отдельного ручного запуска прохода
в проде нет.

Не вставлять события в `delivery_events` SQL-ом: unique-ключ и
`payload_hash` — внутренние, ручная запись обходит проверку провайдера.

## 5. Один инстанс

В v1 работает один API-процесс. `ensureOrderStatusWebhook` идемпотентен
по паре `ORDER_STATUS + URL`, но распределённой блокировки нет: при
одновременном холодном старте двух процессов возможна гонка и вторая
подписка на тот же URL (на обычном клиенте CDEK разрешает две; у shared
уже четыре — не трогать). Reconcile также запускается в каждом процессе.

До появления распределённой блокировки (P3) не масштабировать API
горизонтально с включённым CDEK. Если второй инстанс всё же поднят —
проверить `GET /v2/webhooks`, что подписка одна, и не удалять её при
остановке одного из процессов.

## 6. Что нельзя делать

- Логировать тело вебхука, телефон, имя, адрес и `payloadHash`.
- Менять `order_deliveries.status` SQL-ом в обход проверки CDEK.
- Создавать третью подписку при двух существующих на своём аккаунте.
- Удалять или изменять подписки общей тестовой учётной записи CDEK.
- Удалять свою подписку, пока API работает с CDEK: при следующем старте
  она создастся снова, а статусы за это время потеряются (reconcile
  подхватит, но позже).
- Включать live-контур с реальными ПДн без `DELIVERY_LIVE_PII=true` и
  юрпакета.

## Эскалация

- Провайдер недоступен > 15 минут: владелец/DevSecOps, проверить статус
  CDEK и лимиты.
- Конфликт подписок (shared-аккаунт с четырьмя или две чужие на своём):
  owner S3-2 + доступ к кабинету CDEK; shared-подписки не трогать.
- Утечка PII в логах/ответе: остановить трафик, `#incident`, ротация
  ключей, разбор по threat model.
