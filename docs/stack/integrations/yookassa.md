# ЮKassa: платежи и Partner OAuth

Сверено: 27.11.2026.
API: `https://api.yookassa.ru/v3/`, OpenAPI 3.0.2.
OAuth: `https://yookassa.ru/oauth/v2/`.

## Модель

Платформа Local Hand регистрирует **OAuth-приложение** в Партнёрской
программе. Продавец при подключении выбирает свой магазин ЮKassa и
выдаёт приложению права. Платформа получает Bearer-токен и работает от
имени магазина; деньги покупателя идут продавцу, не на счёт платформы.

Это не Сплитование и не Безопасная сделка: там деньги/эскроу на стороне
платформы, что противоречит модели v1.

## OAuth: подключение магазина

| Шаг | Запрос/URL |
|---|---|
| 1. Регистрация приложения | [yookassa.ru/oauth/v2/client](https://yookassa.ru/oauth/v2/client) — получить `Client ID`/`Client Secret`, указать Callback URL и права |
| 2. Авторизация | `https://yookassa.ru/oauth/v2/authorize?client_id=<id>&response_type=code&state=<state>` |
| 3. Callback | `GET <callback>?code=<code>&state=<state>`; код живёт 5 минут |
| 4. Токен | `POST https://yookassa.ru/oauth/v2/token`, Basic `client_id:client_secret`, form `grant_type=authorization_code&code=<code>` |
| 5. Ответ | `{ "access_token": "...", "expires_in": 94607999 }`; использовать `expires_at` из ответа |
| 6. Проверка магазина | `GET /v3/me` с `Authorization: Bearer <token>` |
| 7. Отзыв | `POST https://yookassa.ru/oauth/v2/revoke_token`, Basic, `token=<token>` |

Права (scope) для v1:

- `checkout:payments_create`
- `checkout:payments_get`
- `checkout:payments_cancel`
- `checkout:refunds_create` и `checkout:refunds_get` — только если
  включаем API-возвраты; в v1 возврат в кабинете, можно не запрашивать.
- `checkout:get_fees` — если показываем комиссию продавцу.

`/v3/me` возвращает `account_id`, `status` (`enabled|disabled`),
`test`, `fiscalization`. В тестовом магазине `test=true`; боевой контур
обязан отклонять `test=true` (у нас `PAYMENTS_ENV=live`).

## Платёж

`POST /v3/payments`

```json
{
  "amount": { "value": "2500.00", "currency": "RUB" },
  "capture": true,
  "confirmation": {
    "type": "redirect",
    "return_url": "https://localhand.ru/orders/123?payment=return"
  },
  "description": "Заказ №123",
  "metadata": { "orderId": "123", "paymentId": "45" }
}
```

Заголовки:

- `Authorization: Bearer <oauth_token>`
- `Idempotence-Key: <uuid>` — официальное имя без `c`, до 64 символов,
  идемпотентность 24 часа. Внутренний API использует
  `Idempotency-Key`; адаптер переименовывает.
- `Content-Type: application/json`

Ответ — объект `Payment`:

- `status`: `pending|waiting_for_capture|succeeded|canceled`; при
  `capture:true` ожидаются `pending → succeeded|canceled`.
- `confirmation.confirmation_url` — URL hosted page; его отдаём
  покупателю.
- `test` — признак тестового платежа.
- `paid`, `amount`, `metadata`, `created_at`.

Проверка статуса: `GET /v3/payments/{payment_id}`.
Отмена: `POST /v3/payments/{payment_id}/cancel`.
Подтверждение (если capture=false): `POST /v3/payments/{payment_id}/capture`.
В v1 используем `capture:true`, `waiting_for_capture` не ожидается.

### HTTP 500

Официально: 500 не означает успех или неуспех; для платежей ЮKassa может
попытаться отменить операцию. Нельзя считать 500 «платёж не создан» и
создавать новый. Нужно:

1. Повторить запрос с тем же `Idempotence-Key` (вернёт исходный
   результат) или найти платёж по `metadata`/id.
2. Обработать `canceled` как отмену, `succeeded` как успех.
3. Только при явном 4xx (валидация/права) считать, что платежа нет.

Наш B1 на 5xx оставляет `pending` и повторяет тот же ключ; адаптер
обязан корректно обработать `canceled`/`succeeded` из повторного ответа,
а не уводить любой не-pending в `manual_review`.

## Вебхуки

При OAuth настройка в личном кабинете недоступна — только API:

- `POST /v3/webhooks` Bearer, `{ "event": "payment.succeeded", "url":
  "https://.../payments/yookassa/webhook" }`
- `GET /v3/webhooks`, `DELETE /v3/webhooks/{id}`
- Один webhook на событие на каждый OAuth-токен; события v1:
  `payment.succeeded`, `payment.canceled` (при необходимости
  `payment.waiting_for_capture`).
- Уведомления приходят только по объектам, созданным приложением.
- Тело: `{ type: "notification", event, object: Payment }`.
- Ответ 200 обязателен; иначе ЮKassa повторяет до 24 часов.
- Проверка подлинности: `GET /v3/payments/{id}` (наш основной способ)
  и/или IP allowlist:
  `185.71.76.0/27`, `185.71.77.0/27`, `77.75.153.0/25`,
  `77.75.156.11`, `77.75.156.35`, `77.75.154.128/25`,
  `2a02:5180::/32`.
- URL: HTTPS, порт 443/8443, TLS 1.2+.

## Тестовый контур

- Тестовый магазин: регистрация через `createTestShop=true`; деньги не
  переводятся, платежи имеют `test=true`.
- Нужен OAuth-токен тестового магазина; тестовые платёжные данные — по
  документации ЮKassa.
- У нас сейчас fake-провайдер; реальный адаптер включается только после
  тестовых ключей владельца.

## Маппинг на код

- Интерфейс: `apps/api/src/payments/provider.ts`.
  Нужно добавить реальный `YooKassaProvider`:
  `createConnection`, `exchangeCode`, `getAccountInfo`,
  `subscribeWebhooks`, `unsubscribeWebhooks`, `createPayment`,
  `getPayment`, `cancelPayment`, `revoke`.
- Env: `YOOKASSA_CLIENT_ID`, `YOOKASSA_CLIENT_SECRET`,
  `YOOKASSA_REDIRECT_URI`, `PAYMENTS_WEBHOOK_URL`,
  `PAYMENTS_TOKEN_KEYS`, `PAYMENTS_TOKEN_KEY_VERSION`,
  `PAYMENTS_STATE_SECRET`, `PAYMENTS_ENV=live|sandbox|test`.
  Сейчас `YOOKASSA_CLIENT_ID/SECRET` в `env.ts` отсутствуют — добавить
  вместе с адаптером.
- Webhook route уже `/payments/yookassa/webhook`; в OAuth-приложении
  указать тот же URL.
- `confirmationUrl` отдаём через `toOrderPayment`; проверка http(s) уже
  есть.

## Чек-лист перед live

- [ ] OAuth-приложение зарегистрировано, Callback URL совпадает.
- [ ] Права ровно необходимые; лишние не запрашиваем.
- [ ] Тестовый магазин: `/v3/me` → `test=true`, платёж → `test=true`.
- [ ] Webhook создан через API, приходит 200, повтор не дублирует.
- [ ] 500/таймаут: платёж находится и статус корректен, второй ссылки нет.
- [ ] Токен хранится зашифрованным, не в логах/ответах.
- [ ] 54-ФЗ/чеки/оферта закрыты владельцем.
