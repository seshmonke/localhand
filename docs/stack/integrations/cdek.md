# СДЭК: API v2

Сверено: 27.11.2026.
API: `https://api.cdek.ru` (prod), `https://api.edu.cdek.ru` (test).
OpenAPI: 3.0.1, клиентский протокол `1.0.0`, 41 path.
Портал: [apidoc.cdek.ru](https://apidoc.cdek.ru/).

## Модель

СДЭК — логистика v1: расчёт стоимости/сроков, создание заказа,
трек-номер и статусы. Договор с СДЭК обязателен; без него боевые
`client_id`/`client_secret` не выдаются.

Тестовая среда — отдельный хост `api.edu.cdek.ru`. В официальной
документации опубликована общая тестовая учётная запись; она не имеет
договора, не отображается в ЛК и не предназначена для реальных
отправлений. Мы использовали её только для проверки OAuth/калькулятора
и GET-запросов; для заказов нужен собственный тестовый/боевой аккаунт.

## Авторизация

```http
POST /v2/oauth/token?grant_type=client_credentials&client_id=<id>&client_secret=<secret>
Content-Type: application/x-www-form-urlencoded
```

- Параметры — **query string**, не JSON body.
- Ответ: `access_token` (JWT), `token_type: bearer`,
  `expires_in` (~3599 с), `scope` (`location:all order:all payment:all`).
- Далее: `Authorization: Bearer <access_token>`.
- Тестовый OAuth проверен 27.11.2026: HTTP 200, token obtained,
  calculator вернул тарифы Москва → Санкт-Петербург.
- 200 RPS — гарантированный порог; выше — без гарантий.

## Калькулятор

`POST /v2/calculator/tarifflist`

```json
{
  "type": 1,
  "from_location": { "code": 44 },
  "to_location": { "code": 137 },
  "packages": [
    { "weight": 1000, "length": 20, "width": 15, "height": 10 }
  ]
}
```

- `weight` — граммы; габариты — сантиметры.
- `from_location`/`to_location`: `code` города СДЭК, либо `postal_code`,
  `city`, `address`, `country_code`, координаты.
- Ответ: `tariff_codes[]` с `tariff_code`, `tariff_name`,
  `delivery_sum`, `period_min/max`, `calendar_min/max`,
  `delivery_date_range`.
- Конкретный тариф: `POST /v2/calculator/tariff` с `tariff_code`.
- Справочники: `/v2/location/cities`, `/v2/location/suggest/cities`,
  `/v2/deliverypoints`.

## Заказ

`POST /v2/orders` — **асинхронный**:

- Ответ `202` и `requests[].state`: `ACCEPTED|WAITING|SUCCESSFUL|INVALID`.
  `WAITING` — нормальное нетерминальное состояние, poll до
  терминального.
- `ACCEPTED` не означает, что заказ создан; нужен polling
  `GET /v2/orders/{uuid}` или `GET /v2/orders?im_number=...`.
- Первый poll — через 2–3 с; обработка может занять 30–60 с.
- Ошибка `INVALID` содержит `errors[].code` и сообщение. Поле
  `number` — номер заказа в нашей ИС (уникален в пределах договора);
  `im_number` — query-параметр поиска `GET /v2/orders`, равный
  `number`; в `POST /v2/orders` его нет (в преалерте `im_number` —
  отдельное поле). Перед повторным созданием с новым
  `number` — reconcile по существующему заказу, чтобы не сделать
  дубль.
- Данные заказа: `tariff_code`, `recipient` (имя, телефон, адрес/ПВЗ),
  `packages` (вес/габариты/позиции), `from_location`/`sender`,
  `delivery_point` или `to_location`, `number` (наш номер заказа).
- Для интернет-магазина `number` — номер заказа в нашей ИС; уникален
  среди активных заказов (финальные `DELIVERED`/`NOT_DELIVERED` не
  блокируют повтор).
- Печатные формы: `/v2/print/orders`, `/v2/print/barcodes`.
- Отмена/удаление: `DELETE /v2/orders/{uuid}` (пока нет движения груза),
  отказ получателя — `/v2/orders/{uuid}/refusal`.

## Вебхуки

`POST /v2/webhooks`

```json
{ "type": "ORDER_STATUS", "url": "https://.../delivery/cdek/webhook" }
```

- Типы: `ORDER_STATUS`, `ORDER_MODIFIED`, `PRINT_FORM`, `RECEIPT`,
  `DOWNLOAD_PHOTO`, `PREALERT_CLOSED`, `ACCOMPANYING_WAYBILL`,
  `OFFICE_AVAILABILITY`, `DELIV_PROBLEM`, `DELIV_AGREEMENT`,
  `COURIER_INFO`.
- **Не более двух подписок на обычного клиента.** Не создавать дубли.
  Общая тестовая учётная запись уже имеет 4 подписки (проверено
  27.11.2026); её подписки не трогать, для тестов webhook нужен
  собственный аккаунт.
- `GET /v2/webhooks`, `GET/DELETE /v2/webhooks/{uuid}`.
- Тело `ORDER_STATUS`:

```json
{
  "type": "ORDER_STATUS",
  "date_time": "2023-11-28T07:44:45+0000",
  "uuid": "<order_uuid>",
  "attributes": {
    "is_return": false,
    "cdek_number": "1100285492",
    "number": "17011574744791",
    "code": "RECEIVED_AT_SHIPMENT_WAREHOUSE",
    "status_code": "3",
    "status_date_time": "2023-11-28T07:44:45+0000",
    "city_name": "Новосибирск",
    "city_code": "270",
    "deleted": false
  }
}
```

- Подписи/HMAC в документации нет. Проверять событие запросом
  `GET /v2/orders/{uuid}` и сверять `cdek_number`/`number`.
- Ответ 200; лимиты повторной доставки — по порталу (обновлялись
  13.10.2025), точное число проверять перед реализацией.
- Тестовая учётная запись общая: её существующие подписки не трогать.

## Тестовый контур: что проверено

27.11.2026 на `api.edu.cdek.ru`:

- OAuth `client_credentials` → 200, Bearer JWT, `scope=location:all
  order:all payment:all`.
- `GET /v2/location/cities?city=Москва` → код 44.
- `POST /v2/calculator/tarifflist` Москва 44 → СПб 137, 1 кг,
  20×15×10 → 200, тарифы с `delivery_sum` и сроками.
- `GET /v2/webhooks` → 200 (видны общие подписки тестового аккаунта;
  не изменяли).
- `GET /v2/orders?im_number=LOCALHAND-TEST-NONE` → 400
  `v2_entity_not_found_im_number` (ожидаемо).
- `POST /v2/orders` не создавали: тестовая учётная запись общая,
  реальные отправления не нужны.

## Маппинг на код

S3-2 ещё не реализован. Понадобится:

- `apps/api/src/delivery/cdek/` — OAuth client, calculator, orders,
  webhooks, status mapper.
- Поля товара: `weight_g`, `length_cm`, `width_cm`, `height_cm`
  (nullable; обязательны для физического товара).
- Адрес/ПВЗ получателя: `city_code`, `postal_code`, `address`,
  `delivery_point`, имя/телефон; PII — после юрпакета, в тестах
  вымышленные.
- Заказ: `number` = `orders.id`/shop prefix, уникален среди активных
  заказов; `im_number` — только поиск (кроме преалерта), равен
  `number`; хранить
  `cdek_order_uuid`, `cdek_number`, `status_code`,
  `status_date_time`.
- Калькулятор: сохранять выбранный `tariff_code`, `delivery_sum`,
  `period_min/max` snapshot.
- Вебхук: один `ORDER_STATUS` на клиента; проверять через GET; не
  создавать вторую подписку.
- Асинхронность: не считать `202` успехом; polling с backoff, timeout
  60 с; отдельный reconcile.
- Ошибки: `v2_entity_not_found_im_number`, `INVALID` с errors;
  retry только на 5xx/сеть, не на валидацию.

## Чек-лист перед S3-2

- [ ] Договор СДЭК и боевые ключи у владельца.
- [ ] Тестовый аккаунт для заказов (не общий публичный).
- [ ] Подтверждены габариты/вес товаров и адрес/ПВЗ.
- [ ] Один webhook `ORDER_STATUS`, проверка через GET.
- [ ] Асинхронный заказ + polling, без `202 = success`.
- [ ] 200 RPS и retry-политика.
- [ ] Юридическое решение по адресу/телефону (152-ФЗ).
