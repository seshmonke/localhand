# Runbook: ручной трек доставки

Статус: seller + ops. Продавец вводит перевозчика и трек только для
оплаченного заказа и только когда CDEK-отправления точно нет. Ручной
трек не заменяет CDEK-отправление и не меняет деньги.

Роли:

- **Продавец** работает только через `/admin/orders/:id` и API. У
  продавца нет `$CDEK_ACCESS_TOKEN`; API сам проверяет отсутствие
  CDEK-заказа.
- **Ops** выполняет read-only проверки CDEK/SQL и разбор инцидентов.
  Токен CDEK есть только у ops и только для собственного аккаунта.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/runbooks/delivery-cdek-webhook.md`,
`docs/stack/runbooks/delivery-reconcile.md`,
`docs/quality/threat-model.md` (D6, D7, D12).

## Когда разрешён

| Условие | Manual |
|---|---|
| Заказ не оплачен | Запрещён: `409 delivery_not_paid` |
| `DELIVERY_PROVIDER=manual` | Разрешён: API-проверка CDEK не нужна |
| CDEK настроен, отправления нет | Разрешён после серверной проверки `GET /v2/orders?im_number=order-{id}` |
| CDEK настроен, `GET` вернул 5xx/timeout | Запрещён до reconcile: `502 delivery_provider_error` |
| CDEK-отправление уже есть (`provider_order_id`) | Запрещён: `409 delivery_already_exists` |
| Уже есть manual carrier/track | Запрещён: `409 delivery_already_exists` |
| Paid-заказ без `order_deliveries` (до `0006`) | Разрешён: ПВЗ/получатель не сохранены, CDEK create вернёт `409 delivery_snapshot_missing` |

`number` для поиска — `order-{id}` (тот же, что в CDEK create).
`im_number` — query-параметр `GET /v2/orders`, в теле create его нет.
Проверку выполняет API; продавцу не нужен доступ к CDEK.

## Как выполнить (продавец)

1. Открыть `/admin/orders/:id`, убедиться, что заказ `paid` и у доставки
   нет CDEK-номера/трека.
2. Нажать «Ручной трек». API сам:
   - проверяет paid-гейт;
   - при настроенном CDEK ищет `order-{id}` через
     `GET /v2/orders?im_number=...`;
   - при 5xx/timeout возвращает `502`, не создавая manual;
   - при существующем CDEK/manual возвращает `409`.
3. Ввести carrier (`1..80` символов) и track (`1..64`, только
   `A-Za-z0-9-`). API сохранит delivery `manual`, track и событие
   `MANUAL`; цена доставки, `orders.total` и оплаченный тариф не
   меняются.
4. Покупатель видит трек на `/orders/:id`; продавец — на
   `/admin/orders/:id`.

## Проверка ops (опционально)

Только для ops с доступом к **собственному** тестовому аккаунту CDEK.
Не использовать токен/подписки общей тестовой учётной записи: у неё
уже четыре подписки, их не трогать (`docs/stack/integrations/cdek.md`).

```bash
# read-only; только ops, только собственный аккаунт.
curl -sS -H "Authorization: Bearer $CDEK_ACCESS_TOKEN" \
  "$CDEK_API_URL/v2/orders?im_number=order-<id>"
```

Пустой список/`404` — заказа нет, manual разрешён. Заказ есть — не
вводить manual; дождаться reconcile/webhook. Если проверка не нужна,
полагаться на ответ API: продавец не обходит серверную проверку.

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
  `status`. Телефон получателя — snapshot `orders.buyer_phone`.
- Не отправлять скриншоты с ПДн в публичные каналы; тестовые данные —
  только вымышленные.
- `payloadHash` и raw payload остаются внутренними; в API и UI не
  выводятся.

## Проверка после manual (ops)

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
