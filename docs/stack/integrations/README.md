# Интеграции: платежи и логистика

Статус: **version lock** на 27.11.2026. Источники — официальные
документация и OpenAPI-спецификации; ссылки и хеши —
[versions.json](versions.json).

Проверка актуальности:

```bash
pnpm integrations:check
```

Команда скачивает обе спецификации, считает SHA-256 и падает, если
версия/спецификация изменилась. Запускать перед планированием спринта,
после изменения интеграции и раз в месяц. Дополнительно drift ловит
еженедельный workflow
[`integrations-check.yml`](../../../.github/workflows/integrations-check.yml)
(и вручную через `workflow_dispatch`).

## Что входит в v1

| Инструмент | Роль | Версия | Контур | Статус |
|---|---|---|---|---|
| **ЮKassa Партнёрская программа (OAuth)** | продавец подключает свой магазин; деньги идут продавцу | API `v3`, OpenAPI 3.0.2 | тестовый магазин → боевой | foundation/fake в коде; реальный адаптер — после ключей |
| **СДЭК API** | расчёт, заказ, трек, статусы | API `v2`, OpenAPI 3.0.1 | `api.edu.cdek.ru` → `api.cdek.ru` | не начат (S3-2) |

## Что не входит в v1

- **ЮKassa Сплитование платежей** — платформа принимает деньги и
  распределяет; противоречит модели «деньги продавцу».
- **ЮKassa Безопасная сделка** — эскроу; non-goal v1.
- **ЮKassa Выплаты** — отдельный контур, не нужен, пока деньги идут
  напрямую продавцу.
- **Возвраты через API** — v1: возврат делает продавец/ops в кабинете
  ЮKassa; API-возвраты — отдельный change.
- **Ozon Доставка** — вторая логистика после v1, отдельное решение.
- **Чеки 54-ФЗ** — зависят от фискализации магазина у ЮKassa; тестовый
  контур без чеков, боевой — после юридического пакета.

## Принятые решения

1. **ЮKassa Partner OAuth, не Basic Auth на каждого продавца.**
   Платформа регистрирует OAuth-приложение, продавец авторизует свой
   магазин, платформа хранит ограниченный Bearer-токен. Секретные ключи
   магазина не сохраняются.
2. **Вебхуки ЮKassa — через API `/v3/webhooks`**, потому что при OAuth
   настройка в личном кабинете недоступна. Один webhook на событие на
   каждый токен.
3. **СДЭК — API v2, тестовый контур `api.edu.cdek.ru`.**
   Договор и боевые ключи — у владельца; тестовая учётная запись из
   официальной документации общая и не предназначена для реальных
   отправлений.
4. **Никаких реальных ключей/денег/адресов в репозитории.**
   Тестовые данные только вымышленные; ключи — env/секреты.

## Что нужно от владельца

### ЮKassa

- [ ] Доступ к Партнёрской программе / OAuth-приложению.
- [ ] Зарегистрировать OAuth-приложение, получить `Client ID` и
      `Client Secret`.
- [ ] Указать Callback URL (наш `YOOKASSA_REDIRECT_URI`) и права:
      создание/просмотр/отмена платежей, возвраты (если включаем).
- [ ] Создать тестовый магазин и провести тестовый платёж.
- [ ] Юридическое решение по 54-ФЗ/чекам и оферте.

### СДЭК

- [ ] Договор с СДЭК (без него боевые ключи не выдаются).
- [ ] Боевые `client_id`/`client_secret` в секретах.
- [ ] Подтвердить тестовый контур и разрешённые тестовые отправления.
- [ ] Юридическое решение по сбору адреса/телефона получателя.

## Обязательные env (когда включаем реальный контур)

```text
PAYMENTS_PROVIDER=yookassa
PAYMENTS_ENV=sandbox|live
YOOKASSA_CLIENT_ID=...
YOOKASSA_CLIENT_SECRET=...
YOOKASSA_REDIRECT_URI=https://.../seller/payments/callback
PAYMENTS_WEBHOOK_URL=https://.../payments/yookassa/webhook
PAYMENTS_TOKEN_KEYS=...
PAYMENTS_TOKEN_KEY_VERSION=1
PAYMENTS_STATE_SECRET=...
CDEK_CLIENT_ID=...
CDEK_CLIENT_SECRET=...
CDEK_API_URL=https://api.edu.cdek.ru   # prod: https://api.cdek.ru
CDEK_WEBHOOK_URL=https://.../payments/cdek/webhook
```

`YOOKASSA_CLIENT_ID/SECRET` и `CDEK_*` пока не входят в `env.ts`:
добавить вместе с реальными адаптерами, не в fake-контуре.

## Разрывы, которые нельзя забыть

- **ЮKassa `Idempotence-Key`**: официальный заголовок без `c`; наш
  внутренний API использует `Idempotency-Key`. Адаптер обязан
  переименовать.
- **ЮKassa HTTP 500 неоднозначен**: операция могла выполниться или
  автоотмениться. Нельзя просто повторять create; нужно получить
  результат по тому же `Idempotence-Key` / `GET /v3/payments/{id}` и
  обработать `canceled`/`succeeded`, иначе возможен неверный статус.
- **`waiting_for_capture`**: мы создаём платёж с `capture: true`, поэтому
  этот статус не ожидается; если появится — это ошибка конфигурации.
- **OAuth-токен**: `expires_in` в ответе (~94 607 999 с), текст доки
  говорит «5 лет». Хранить `expires_at` из ответа, не хардкодить.
- **СДЭК создаёт заказ асинхронно**: `202 ACCEPTED`, затем polling
  `GET /v2/orders/{uuid}`; первый poll — через 2–3 с, обработка до
  30–60 с. Нельзя считать `202` успешным заказом.
- **СДЭК: не более двух webhook-подписок** на обычного клиента;
  общая тестовая учётная запись уже имеет 4, её подписки трогать
  нельзя — для тестов webhook нужен собственный аккаунт.
- **СДЭК webhook без подписи** в документации: проверять событие
  запросом `GET /v2/orders/{uuid}` и сверять `cdek_number`/`number`.
- **СДЭК 200 RPS** — гарантированный порог; выше — без гарантий.
- **Адрес/телефон получателя** — PII; до юридического пакета только
  вымышленные тестовые данные.

## Источники

- [ЮKassa API](https://yookassa.ru/developers/api) — `v3`, OpenAPI.
- [ЮKassa: формат взаимодействия](https://yookassa.ru/developers/using-api/interaction-format)
- [ЮKassa: webhooks](https://yookassa.ru/developers/using-api/webhooks)
- [ЮKassa: Partner OAuth](https://yookassa.ru/developers/solutions-for-platforms/partners-api/oauth/basics)
- [ЮKassa: получение токена](https://yookassa.ru/developers/solutions-for-platforms/partners-api/oauth/obtain-token)
- [ЮKassa: тестирование OAuth](https://yookassa.ru/developers/solutions-for-platforms/partners-api/testing)
- [СДЭК: портал API](https://apidoc.cdek.ru/)
- [СДЭК OpenAPI](https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration)

Дата сверки: 27.11.2026. При изменении спецификации `pnpm
integrations:check` упадёт — обновить `versions.json` и этот документ,
затем проверить реализацию.
