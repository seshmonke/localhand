# Runbook: ручной трек доставки

Статус: seller/ops. Продавец вводит перевозчика и трек только для
оплаченного заказа и только когда CDEK-отправления точно нет. Ручной
трек не заменяет CDEK-отправление и не меняет деньги.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/runbooks/delivery-cdek-webhook.md`,
`docs/stack/runbooks/delivery-reconcile.md`,
`docs/quality/threat-model.md` (D6, D7, D12).

## Когда разрешён

| Условие | Manual |
|---|---|
| Заказ не оплачен | Запрещён: `409 delivery_not_paid` |
| `DELIVERY_PROVIDER=manual` | Разрешён: API-проверка CDEK не нужна |
| CDEK настроен, отправления нет | Разрешён после `GET /v2/orders?im_number=order-{id}`, если заказ не найден |
| CDEK настроен, `GET` вернул 5xx/timeout | Запрещён до reconcile: `502 delivery_provider_error` |
| CDEK-отправление уже есть (`provider_order_id`) | Запрещён: `409 delivery_already_exists` |
| Уже есть manual carrier/track | Запрещён: `409 delivery_already_exists` |
| Paid-заказ без `order_deliveries` (до `0006`) | Разрешён: ПВЗ/получатель не сохранены, CDEK create вернёт `409 delivery_snapshot_missing` |

`number` для поиска — `order-{id}` (тот же, что в CDEK create).
`im_number` — query-параметр `GET /v2/orders`, в теле create его нет.

## Как выполнить

1. Открыть `/admin/orders/:id`, убедиться, что заказ `paid` и у доставки
   нет CDEK-номера/трека.
2. Проверить CDEK (read-only):

```bash
curl -sS -H "Authorization: Bearer $CDEK_ACCESS_TOKEN" \
  "$CDEK_API_URL/v2/orders?im_number=order-<id>"
```

Пустой список/`404` — заказа нет, manual разрешён. Заказ есть — не
вводить manual; дождаться reconcile/webhook.

3. Ввести carrier (`1..80` символов) и track (`1..64`, только
   `A-Za-z0-9-`). API сохранит delivery `manual`, track и событие
   `MANUAL`; цена доставки, `orders.total` и оплаченный тариф не
   меняются.
4. Покупатель видит трек на `/orders/:id`; продавец — на
   `/admin/orders/:id`.

## Ошибки

| Ответ | Причина | Действие |
|---|---|---|
| `400` | Пустой/длинный carrier, неверный формат track | Исправить ввод; пробелы/кириллица в track запрещены |
| `401` | Нет сессии | Войти продавцом |
| `404` | Чужой/неизвестный заказ | Не повторять; проверить магазин |
| `409 delivery_not_paid` | Заказ не оплачен | Ждать оплату; manual не создаёт деньги |
| `409 delivery_already_exists` | Уже есть CDEK/manual трек | Не перезаписывать; открыть историю событий |
| `409 delivery_snapshot_missing` | Старый paid-заказ без snapshot | Manual разрешён; CDEK create недоступен |
| `502 delivery_provider_error` | CDEK недоступен/таймаут при проверке | Повторить после reconcile; не обходить API |

Повторный PATCH не «обновляет» трек: ручное изменение существующего
трека не предусмотрено. Если трек ошибочный — остановить отправку,
эскалировать owner S3-2; не править БД напрямую.

## PII и логи

- Ручной трек доступен только продавцу этого заказа; чужой — `404`,
  без раскрытия существования.
- Имя/телефон получателя и адрес ПВЗ в лог не пишутся; carrier/track
  тоже не логируются значениями — только `delivery_id`, `order_id`,
  `status`.
- Не отправлять скриншоты с ПДн в публичные каналы; тестовые данные —
  только вымышленные.
- `payloadHash` и raw payload остаются внутренними; в API и UI не
  выводятся.

## Проверка после manual

```sql
SELECT d.id, d.order_id, d.provider, d.status, d.carrier, d.track_number,
       d.last_status_code, d.last_status_at, d.updated_at,
       o.status AS order_status, o.total_kopecks, o.delivery_kopecks
FROM order_deliveries d
JOIN orders o ON o.id = d.order_id
WHERE d.order_id = <order_id>;
```

Ожидается: `provider=manual`, `status=manual`, заполнен `track_number`,
`order_status=paid`, `total_kopecks` и `delivery_kopecks` не изменились.
`delivery_events` содержит одно событие `MANUAL`.

## Эскалация

- CDEK-заказ найден после manual: остановить отправку, owner S3-2,
  ручной разбор; не создавать второе отправление.
- Ошибка в track/carrier: owner S3-2; правка только через согласованную
  ops-процедуру, не SQL-ом.
- Утечка ПДн: `#incident`, остановить трафик, разбор по threat model.
