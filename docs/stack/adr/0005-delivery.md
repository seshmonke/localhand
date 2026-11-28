# ADR 0005: доставка СДЭК и провайдер-нейтральный контур

Статус: accepted.
Дата: 2026-11-28.
Владелец: Local Hand.
Связанные документы: `openspec/changes/07-delivery/`,
`docs/stack/integrations/cdek.md`,
`docs/stack/adr/0003-orders.md`,
`docs/stack/adr/0004-payments.md`,
`docs/quality/threat-model.md`,
`docs/stack/runbooks/delivery-cdek-webhook.md`,
`docs/stack/runbooks/delivery-reconcile.md`,
`docs/stack/runbooks/delivery-manual-track.md`,
`docs/stack/runbooks/delivery-rollback.md`.

## Контекст

- Sprint 3 закрывает money-path: покупатель выбирает ПВЗ, видит цену и
  срок доставки, оплачивает заказ; продавец создаёт отправление СДЭК или
  вводит трек вручную; покупатель и продавец видят трек и статус.
  Поведение — `openspec/changes/07-delivery/specs/delivery/spec.md`,
  решение — `openspec/changes/07-delivery/design.md`.
- СДЭК API v2 — внешний провайдер: OAuth client credentials, асинхронное
  создание заказа (`202`), вебхук `ORDER_STATUS`, не более двух подписок
  на обычного клиента, 200 RPS. Общая тестовая учётная запись уже имеет
  четыре подписки — это исключение, её подписки не трогать. Сверено
  27.11.2026, `docs/stack/integrations/cdek.md`.
- Владелец 27.11.2026 выбрал **один договор СДЭК на платформе**.
  Продавец не заключает отдельный договор и не вводит свои ключи: он
  указывает город отправки и ПВЗ сдачи в магазине, посылка сдаётся в
  ПВЗ платформенного аккаунта.
- Деньги за товар и доставку идут продавцу через ЮKassa; платформа не
  принимает их на свой счёт (`docs/stack/adr/0004-payments.md`). Доставка
  входит в `orders.total_kopecks` и оплачивается один раз вместе с
  товаром.
- v1 — один API-процесс Fastify + PostgreSQL 18, без Redis и отдельного
  job-сервера (`docs/stack/adr/0001-stack.md`). Reconcile и проверка
  подписки живут в процессе API.
- `DELIVERY_LIVE_PII=false` по умолчанию: реальные имена, телефоны и
  адреса запрещены до юрпакета и решения владельца. Test/fake-контуры
  работают только с вымышленными данными; live не стартует без
  `DELIVERY_LIVE_PII=true`.
- Ozon — второй перевозчик после MVP; контракт/B2B и новый API, поэтому
  сейчас нужен шов, а не второй адаптер.

## Решение

### Provider seam

- `DeliveryProvider` — единственная точка интеграции с перевозчиком:
  `listCities`, `listPoints`, `quote`, `listTariffs`, `createShipment`,
  `getShipment`, `findShipmentByNumber`, `ensureOrderStatusWebhook`.
  CDEK-специфичные поля и разбор вебхука остаются в адаптере
  (`apps/api/src/delivery/provider.ts`,
  `apps/api/src/delivery/cdek-provider.ts`).
- `fake` — детерминированный провайдер для test/e2e/preview без сети;
  `manual` — seller-side fallback, не участвует в quote/checkout.
- Заказ, UI и статусы хранят провайдер-нейтральный snapshot
  (`order_deliveries`): provider, status, город/ПВЗ, тариф, цена, срок,
  provider id/номер, carrier/track, последний статус. Ozon добавляется
  вторым адаптером и расширением enum провайдера, без переделки заказа.
- `DeliveryStatusSchema` не содержит статусов заказа `shipped/delivered`;
  lifecycle заказа — отдельный change `08`.

### Платформенный аккаунт СДЭК

- Один аккаунт и один договор. Продавец заполняет
  `shops.cdek_city_code`, `cdek_city_name`, `cdek_shipment_point`;
  очистка города обнуляет все три поля.
- Покупатель выбирает город и ПВЗ; quote подписывается HMAC
  (`DELIVERY_QUOTE_SECRET`), TTL 10 минут, состав корзины и цена
  фиксируются в токене. Checkout принимает только серверный quote;
  клиентская цена игнорируется.
- Продавец видит тарифы от города/ПВЗ магазина до ПВЗ покупателя и
  создаёт отправление только с оплаченным тарифом. Другой тариф или
  изменившаяся цена CDEK — `409 delivery_tariff_mismatch`, без изменения
  `price_kopecks` и `orders.total_kopecks`; разница разбирается вручную.
- `number=order-{id}` — идемпотентный ключ отправления; `shipment_point`
  — ПВЗ сдачи продавца; получатель — имя покупателя и телефон из
  `orders.buyer_phone` (snapshot на checkout), не из сессии в момент
  создания.
- CDEK `POST /v2/orders` асинхронный: `202` — внутренний ответ
  провайдера. Локальный API сохраняет provider id/номер, ставит delivery
  `created` и отвечает продавцу `201`; `202` не считается успешным
  заказом и не подменяет локальный статус.
- Ошибка/таймаут создания не переводит заказ в manual сразу: сначала
  reconcile по `im_number`, manual разрешён только при подтверждённом
  отсутствии заказа CDEK.

### Manual fallback

- Только для оплаченного заказа. При настроенном CDEK API проверяет
  отсутствие отправления через `GET /v2/orders?im_number=order-{id}`;
  сеть/5xx — `502 delivery_provider_error`, повтор после reconcile.
- Если CDEK-отправление существует, manual возвращает
  `409 delivery_already_exists` и не перезаписывает его. Повторный manual
  на уже заполненный трек — тот же `409`.
- Для paid-заказа без `order_deliveries` (создан до `0006`) CDEK create
  возвращает `409 delivery_snapshot_missing`; manual carrier/track
  доступен, потому что ПВЗ и получатель не сохранены.
- Manual ставит delivery `manual`, не меняет цену доставки, `orders.total`
  и оплаченный тариф; статусы заказа не меняются.
- Процедура — `docs/stack/runbooks/delivery-manual-track.md`.

### Деньги

- Платформа не принимает деньги и не делает возвраты. `orders.total`
  включает доставку; оплата идёт продавцу через ЮKassa по ADR 0004.
- `orders.delivery_kopecks` — snapshot для оплаты;
  `order_deliveries.price_kopecks` — источник цены доставки на момент
  checkout. Инвариант `total = items + delivery` проверяется сервисом и
  тестами; manual цену не меняет.
- Расчёты с СДЭК идут по договору платформы и не являются деньгами
  покупателя на платформе. 54-ФЗ/ККТ и возвраты — вне этого change.

### PII и legal gate

- PII: `recipient_name`, `recipient_phone`, адрес ПВЗ. Логи содержат
  только order/delivery id, provider, статус/код; без имени, телефона,
  адреса, raw payload и `payloadHash`. Ответы доставки — `no-store`,
  authz buyer/seller, чужой заказ — `404`.
- `DELIVERY_LIVE_PII=false` — fail-closed. `DELIVERY_ENV=live` без
  `DELIVERY_LIVE_PII=true` — startup error; `test` требует
  `api.edu.cdek.ru` или `localhost` (локальный стенд). В `test`
  `CDEK_WEBHOOK_URL` может быть `http://localhost:3000/delivery/cdek/webhook`;
  в `live` — только `https` (localhost — локальное исключение). `fake` в
  live запрещён; production-preview допускает только fake, пока live PII
  выключен.
- Реальные ключи, договор, 54-ФЗ и юрпакет — внешние зависимости
  владельца. До их закрытия live-контур и реальные ПДн не включаются.

### Вебхук и reconcile

- `POST /delivery/cdek/webhook` без подписи CDEK: тело — подсказка,
  сервер проверяет заказ через `GET /v2/orders/{uuid}` и сверяет
  `number`/`cdek_number`. Неизвестный заказ — `404`, невалидное тело —
  `400`, ошибка проверки/провайдер выключен — `502`; replay — `200`
  no-op. Лимит 60/мин на IP, `no-store`.
- Идемпотентность события — unique
  `(delivery_id, status_code, occurred_at)`; provider event id у CDEK нет,
  `status_date_time` нормализуется.
- `ensureOrderStatusWebhook` при старте: существующая подписка на тот же
  URL — no-op; нет подписки — создать; одна чужая — создать вторую; две
  чужие — не создавать третью, писать ops-ошибку. v1 — один API-процесс;
  распределённой блокировки подписки нет.
- Общая тестовая учётная запись CDEK уже имеет четыре подписки; её
  подписки не удалять и не изменять. Конфликт возникает только если
  среди них нет совпадения с текущим `CDEK_WEBHOOK_URL`; при совпадении
  `ensureOrderStatusWebhook` — no-op. Иначе API пишет
  `delivery_webhook_subscription_failed reason=conflict`; для проверки
  вебхука нужен отдельный тестовый аккаунт.
- Reconcile: на старте и каждые 60 секунд (константы
  `DELIVERY_RECONCILE_INTERVAL_MS`/`DELIVERY_RECONCILE_AGE_MS`, не env),
  батч 50, кандидаты `created|in_transit` с provider id и `lastStatusAt`
  старше 2 минут. Ошибка/пустой ответ/регресс/конфликт обновляют
  `updated_at` (touch), чтобы строка не застряла за батчем. `quoted` не
  переводится в `failed` автоматически; UI показывает «Ожидает
  отправки», а создание отправления — отдельное действие продавца.
  Отдельное 24-часовое напоминание — backlog, в change не реализовано.
  Процедура — `docs/stack/runbooks/delivery-reconcile.md`.

### Ozon и другие перевозчики

- Ozon — отдельный PBI после MVP: договор/B2B, новый API, отдельный
  threat model и contract-тесты. Сейчас в enum только `cdek|manual|fake`.
- Добавление Ozon не меняет checkout-контракт и snapshot: новый адаптер
  реализует `DeliveryProvider`, миграция расширяет enum, UI получает
  provider-neutral поля.

## Альтернативы

- **Договор СДЭК у каждого продавца.** Отклонено: продавец вводит свои
  ключи, платформа не контролирует тариф и статусы, выше радиус утечки;
  owner decision 27.11.2026 — платформенный аккаунт.
- **Доставка до двери сразу.** Отклонено: адрес — дополнительные ПДн и
  юрпакет; v1 — PVZ-only.
- **Manual на checkout.** Отклонено: нет цены и срока, ломается
  money-path и quote; manual — только seller fallback после оплаты.
- **Цена доставки от клиента.** Отклонено: подмена суммы; только
  подписанный серверный quote.
- **Ozon сейчас.** Отклонено: контракт/B2B и новый API; после MVP.
- **Polling вместо вебхука.** Отклонено как единственный механизм:
  вебхук — основной путь, reconcile — страховка.
- **Автоматическое создание отправления.** Отклонено: тариф и ПВЗ сдачи
  выбирает продавец; автоматический create создаёт дубли и неверные
  тарифы.
- **Автоматический `failed` для `quoted`.** Отклонено: продавец может
  быть недоступен; статус заказа не должен ломаться из-за таймера.
- **Деньги на счёте платформы.** Отклонено ADR 0004: расчётный счёт,
  54-ФЗ/ККТ, платёжный агент.

## Последствия

- Плюсы: один договор и один контур ключей; продавец не работает с API
  CDEK; цена доставки подписана и входит в оплату; Ozon подключается
  адаптером; вебхук и reconcile закрывают потерю статусов; PII
  fail-closed.
- Минусы: платформа зависит от договора CDEK и его тестового контура;
  до договора live недоступен, остаются test/fake/manual. Reconcile и
  подписка живут в одном процессе; отдельный job и распределённая
  блокировка — P3. In-memory rate-limit сбрасывается при рестарте.
- Минусы: у CDEK нет event id, поэтому идемпотентность держится на
  `(status_code, occurred_at)`; два события с разным временем — два ряда.
  Асинхронный `202` и таймаут create требуют reconcile перед повтором и
  manual.
- Риск: ошибка ops при ручном треке или разборе тарифа. Митигация —
  runbook, `409` вместо перезаписи, read-only проверки и backup.
- Риск: PII получателя в БД и выгрузках. Митигация — no-store, authz,
  логи без PII, `DELIVERY_LIVE_PII=false`, retention/анонимизация до
  публичного запуска.
- Откат: `docs/stack/runbooks/delivery-rollback.md` — сначала выключить
  провайдера и остановить reconcile/вебхуки, затем backup/выгрузка и down
  SQL. `orders.total` не пересчитывается; оплаченные заказы остаются
  `paid`, трек передаётся вручную.

## Источники

- `openspec/changes/07-delivery/design.md`,
  `openspec/changes/07-delivery/specs/delivery/spec.md`.
- `apps/api/src/delivery/provider.ts`,
  `apps/api/src/delivery/cdek-provider.ts`,
  `apps/api/src/delivery/shipment.service.ts`,
  `apps/api/src/delivery/delivery.reconcile.ts`,
  `apps/api/src/app.ts`.
- `packages/shared/src/contracts/delivery.ts`.
- `docs/stack/integrations/cdek.md` — OAuth, calculator, async order,
  webhooks, лимиты.
- `docs/quality/threat-model.md` — раздел «Доставка».
- `docs/stack/runbooks/delivery-cdek-webhook.md`,
  `docs/stack/runbooks/delivery-reconcile.md`,
  `docs/stack/runbooks/delivery-manual-track.md`,
  `docs/stack/runbooks/delivery-rollback.md`.
- [СДЭК API v2](https://apidoc.cdek.ru/) — заказы, вебхуки, ограничения.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  — что не попадает в логи.
