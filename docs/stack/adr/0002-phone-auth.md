# ADR 0002: телефонная авторизация и сессия

Статус: accepted.
Дата: 2026-11-27.
Владелец: Local Hand.

## Контекст

- 149-ФЗ (ч. 10 ст. 8) требует для авторизации на российском сайте
  российский способ входа. Для v1 выбран номер мобильного телефона:
  он уже нужен для связи продавца и покупателя, не требует аккаунтов
  иностранных провайдеров и работает без пароля.
- Телефон — персональные данные по 152-ФЗ. Обработка — в РФ, логи без
  ПДн, минимизация полей.
- Sprint 1: вход продавца на `/login`, сессия для seller admin;
  покупательская авторизация — Sprint 2; Telegram и иностранные
  провайдеры как логин не используются (`docs/legal/context.md`).
- v1 — один API-процесс (Fastify) + PostgreSQL на одном сервере, без
  Redis и отдельного session-store (`docs/stack/adr/0001-stack.md`).

## Решение

### OTP

- Код — 6 цифр, `crypto.randomInt`, TTL 5 минут, не более 5 попыток на
  код, одноразовое использование (`consumed_at`).
- В `otp_codes` хранится только HMAC-SHA256 от `OTP_SECRET` и строки
  `phone:code`; открытый код не сохраняется. Сравнение — через
  `timingSafeEqual`.
- `POST /auth/request-code` нормализует номер к `+7XXXXXXXXXX`, отвечает
  `200 {ok:true}` одинаково для нового и существующего номера и не
  раскрывает наличие аккаунта. Невалидный номер — `400`.
- `POST /auth/verify-code` при ошибке отвечает generic `401
  {error:"unauthorized"}`: нельзя отличить неверный код, просроченный,
  исчерпанные попытки и отсутствие OTP. При успехе создаёт `users` по
  телефону (`upsert`) и выдаёт сессию.
- Роль не приходит от клиента: продавец — тот, у кого есть строка в
  `sellers` с `user_id` из JWT.

### Сессия

- JWT HS256 (`@fastify/jwt`), `sub` = `users.id`, срок 7 дней.
- Cookie `lh_session`: `httpOnly`, `SameSite=Lax`, `Secure` в
  production, `Path=/`, `Max-Age=604800`.
- `GET /auth/me` читает cookie, проверяет подпись и срок, загружает
  пользователя. `401` без деталей — нет cookie, битый или просроченный
  JWT, либо пользователь не найден; сбой БД отдаёт generic `500
  {error:"internal_error"}`, как и другие внутренние ошибки auth-пути.
- `POST /auth/logout` очищает cookie. JWT остаётся криптографически
  валидным до истечения срока — это принятый trade-off stateless-схемы.
- CSRF: `SameSite=Lax` не отправляет cookie на cross-site POST/PATCH,
  CORS разрешает credentialed-запросы только с `WEB_ORIGIN`; тела
  мутаций — JSON. Отдельного CSRF-токена в v1 нет.

### Rate limit

- `request-code`: 5 запросов/мин на нормализованный телефон и
  20 запросов/мин на IP.
- `verify-code`: 10 запросов/мин на пару IP + телефон.
- Глобальный лимит выключен (`global:false`); превышение — `429
  {error:"rate_limited"}` без отправки нового кода.
- Хранилище `@fastify/rate-limit` — in-memory в процессе API. Для одного
  инстанса v1 этого достаточно; перезапуск сбрасывает счётчики, при
  нескольких инстансах нужен общий store (Redis/PostgreSQL) — P3.

### TRUST_PROXY

- IP для лимитов — `request.ip`. `X-Forwarded-For` принимается только
  от явно доверенного прокси.
- `TRUST_PROXY` — список IP/CIDR Caddy через запятую (например
  `172.28.0.2/32`). `TRUST_PROXY=true` отклоняется; в production без
  значения API не стартует. Вне production по умолчанию `false`.
- Ошибка конфигурации в одну сторону даёт всем один IP (лимит по IP
  становится общим), в другую — позволяет подменять IP заголовком.
  Поэтому значение задаётся только на деплое по `docs/stack/hosting.md`.

### SMS-провайдер

- Интерфейс `SmsProvider`; адаптеры: `dev` и `smsru`.
- `dev` возвращает `devCode` в ответе `request-code` только при
  `NODE_ENV !== production` и SMS не отправляет. В production
  `SMS_PROVIDER=dev` падает на старте (env-валидация и фабрика
  провайдера).
- `smsru` требует `SMSRU_API_ID`, вызывает `POST https://sms.ru/sms/send`
  с JSON-телом (`api_id`, `to`, `msg`, `json=1`), таймаут 5 секунд;
  успех — `status:"OK"` и `status_code:100`. Ключ передаётся в теле, а
  не в URL, чтобы не попасть в access-логи Caddy. Ключ — только env или
  секрет деплоя, не в репозитории.
- Реальный ключ и отправка SMS — перед прод-релизом; в preview и на
  стендах используется dev-адаптер. Адаптер `smsru` не передаёт
  `test=1`: тестовый режим SMS.ru задаётся вручную в запросе на стенде
  (или проверяется одним номером владельца), прод-код его не отправляет.

### ПДн и логи

- `users`: только `id`, `phone`, `created_at`. Другие поля не собираются
  «про запас».
- `otp_codes`: телефон, HMAC-хеш, TTL, попытки; открытого кода нет.
- Телефон и код не пишутся в логи, URL и ответы об ошибках. Ошибка
  auth-пути логируется как `{ code }` (диагностический код ошибки) и
  generic-сообщение; покрыто route-тестом и source-аудитом.
- Ответы на запрос кода и проверку кода не раскрывают существование
  аккаунта.
- IP не попадает в прикладные auth-логи и хранится в памяти
  rate-limiter. Стандартный access-лог Fastify (`incoming request`)
  содержит `remoteAddress`, метод, URL и статус; тела запросов, телефон
  и код в него не попадают. Retention access-логов — общая политика
  эксплуатации, не auth-кода.
- Очистка истёкших `otp_codes` и retention сессий/логов — P3; до
  публичного запуска нужен фоновый job (pg-boss) и политика retention.

## Альтернативы

- **Email + пароль.** Отклонено: больше ПДн и поддержки (сброс пароля,
  утечки), хуже для мобильного сценария; телефон уже нужен продукту.
- **Telegram `initData` как логин.** Отклонено: не входит в разрешённые
  149-ФЗ способы авторизации для РФ; Telegram остаётся каналом
  коммуникации.
- **Opaque-сессия в PostgreSQL.** Даёт отзыв токена и список устройств,
  но добавляет запись в БД на каждый запрос и схему хранения на v1.
  Вернуться при buyer-auth и требовании отзыва сессий.
- **JWT в `localStorage`.** Отклонено: доступен из JS, риск XSS.
- **Redis для OTP/лимитов.** Отклонено для v1: PostgreSQL и in-memory
  достаточно для одного инстанса; Redis — отдельный сервис и ops.
- **SMS Aero, Twilio и др.** Интерфейс `SmsProvider` позволяет добавить
  адаптер. SMS.ru выбран первым из-за простого HTTP API и работы в РФ;
  Twilio отклонён из-за зарубежной обработки данных.

## Последствия

- Плюсы: нет паролей и их восстановления; stateless-сессия не требует
  session-store; один вертикальный срез auth/shop/product проверен e2e.
- Минус: logout не отзывает JWT; украденная cookie действует до 7 дней.
  Компенсация — `httpOnly`, `Secure` в production, `SameSite=Lax`,
  отсутствие токена в JS/логах. Отзыв и короткий TTL + refresh —
  отдельное решение при появлении buyer-auth.
- Минус: in-memory rate limit не общий между инстансами и сбрасывается
  при рестарте. До масштабирования API — один инстанс.
- Минус: OTP-таблица растёт без очистки; нужен pg-boss job и retention.
- Минус: SMS стоит денег и зависит от баланса SMS.ru; ни ELK, ни
  отдельного мониторинга отправок в v1 нет — ошибки видны в логах API
  без ПДн.
- Риск SMS-абьюза: локальные лимиты по телефону/IP снижают, но не
  убирают расход. До публичного запуска — captcha на форме и передача
  IP пользователя в SMS.ru (параметр `ip`), сейчас не реализовано (P3).
- Ошибка `TRUST_PROXY` меняет смысл IP-лимитов; значение проверяется
  env-валидацией и деплой-чек-листом.

## Источники

- [149-ФЗ, ст. 8](https://www.consultant.ru/document/cons_doc_LAW_61798/)
- [152-ФЗ](https://www.consultant.ru/document/cons_doc_LAW_61801/)
- `docs/legal/context.md` — выжимка по 149-ФЗ/152-ФЗ и ПДн.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [MDN: Set-Cookie / SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value)
- [Fastify: trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy)
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [@fastify/jwt](https://github.com/fastify/fastify-jwt)
- [SMS.ru: отправка SMS HTTP-запросом](https://sms.ru/api/send)
- `docs/stack/adr/0001-stack.md`, `docs/stack/hosting.md` — стек и
  инфраструктура.
