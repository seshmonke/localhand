# Threat model

Документ фиксирует модель угроз по T2-контурам. Раздел «Платежи» обязателен
для change `06-payments` (деньги, внешний провайдер, authz).
Обновляется Architects/DevSecOps при изменении границ; найденная угроза без
митигации становится P1/P2-долгом с owner и сроком.

Связанные документы: `docs/stack/adr/0004-payments.md`,
`docs/stack/runbooks/payments-manual-review.md`,
`docs/quality/methodologies.md`, `docs/quality/dod.md`.

## Легенда

- **Актив** — что защищаем.
- **Вектор** — как атакующий может воздействовать.
- **Митигация** — что уже есть в коде/процессе.
- **Остаточный риск** — что остаётся и когда закрывается.

## Платежи (06-payments)

### Границы доверия

1. Браузер покупателя ↔ API: cookie-сессия `lh_session`, `Idempotency-Key`,
   `GET /orders/:id/payment`, `POST /orders/:id/payments`.
2. Браузер продавца ↔ API: cookie-сессия, OAuth consent/callback,
   `GET/DELETE /seller/payments/account`, `POST /seller/payments/connect`.
3. API ↔ ЮKassa: OAuth exchange, create/get payment, webhook subscription,
   вебхук без cookie.
4. API ↔ PostgreSQL: `seller_payment_accounts` (зашифрованный токен),
   `payments` (суммы, статусы, provider id), `orders` (PII).
5. Логи/ошибки: структурные логи без PII/токена/тела.

### Активы

- OAuth-токен продавца (`access_token`) и ключ шифрования keyring.
- `state` OAuth (HMAC + TTL + seller_id), одноразовый `code`.
- Confirmation URL платежа (hosted page ЮKassa).
- `Idempotency-Key` и сумма/валюта/orderId платежа.
- Статусы платежа/заказа и `provider_payment_id`.
- ПДн заказа: телефон покупателя, комментарий; платёжные карты платформа
  не получает.

### Угрозы и митигации

| # | Угроза | Вектор | Митигация | Остаточный риск |
|---|--------|--------|-----------|-----------------|
| P1 | Кража/подмена confirmation URL | Ссылка в логах, кэше, ответе чужому | URL только в `pending`, `no-store` на всех ответах платежей, buyer/seller authz, seller-ответ без URL, логи без URL | Ссылка у покупателя в браузере; провайдерская страница одноразовая |
| P2 | Перехват/повтор OAuth `code` | Callback URL, история, referer | `code` одноразовый у провайдера, exchange только server-side, `state` проверяется до exchange, повторный `state` отклоняется (`consumedStates`) | Компрометация браузера продавца |
| P3 | CSRF на подключение чужого аккаунта | Подсунутый `state`/callback | HMAC `state` с `seller_id`, TTL 10 мин, сравнение с сессией продавца, одноразовость, `SameSite` cookie | XSS на домене платформы (общий риск) |
| P4 | Утечка токена из БД/логов/ответа | Дамп БД, лог, ошибка, UI | AES-256-GCM, keyring + версия, токен только на сервере, маскированный account id в UI, логи без токена, redaction-тесты | Компрометация ключа шифрования раскрывает токены; ротация keyring |
| P5 | Поддельный вебхук | Прямой POST на публичный URL | Тело — только подсказка; серверный `getPayment` по `provider_payment_id`, неизвестный платёж → 503, `bodyLimit`, rate-limit 60/мин, без cookie | DoS на публичный URL; rate-limit in-memory |
| P6 | Replay вебхука / двойное списание | Повторная доставка, гонка | Терминальный платёж — no-op 200; order-lock; partial unique active/`provider_payment_id`; `Idempotency-Key` + provider idempotency; amount/currency/order match | Провайдер может прислать событие позже; reconcile сверяет |
| P7 | Mismatch суммы/валюты/заказа | Подмена тела, баг провайдера | Проверка `getPayment`, mismatch → `manual_review`, заказ не становится `paid`; ручной разбор по runbook | Ops-ошибка при ручном разборе; транзакция + backup |
| P8 | Оплата после `paid` / второй платёж | Повторный create, гонка | `paid` → 409 `order_already_paid`; активный/спорный платёж → 409; partial unique; replay по ключу | Нет |
| P9 | Неизвестный статус/потерянный вебхук | Провайдер недоступен, 5xx | `pending` + reconcile 60 с; 15 мин без provider id → `manual_review` (не `failed`); 3 неудачи → `manual_review` | Reconcile в одном процессе; рестарт подхватывает pending |
| P10 | Злоупотребление `manual_review` | ops меняет статус без проверки | Runbook: три исхода, SQL/ops-only, блокировки, backup, запись в журнал; новый платёж и disconnect заблокированы | Нет второго approver в v1; P3 |
| P11 | Возвраты вне скоупа | UI/API обещает refund | Refund API/UI нет; для `paid` — 409; возврат только в кабинете ЮKassa; ADR/runbook фиксируют границу | Продавец может вернуть деньги вне платформы; заказ остаётся `paid` по данным платформы |
| P12 | PII/адрес в платежах | Логи, ответы, скриншоты | Платёжные ответы без телефона/комментария; `no-store`; логи `payment_id/order_id/status/code`; адрес не собирается; e2e — вымышленные данные | Телефон/комментарий остаются в заказе по дизайну ADR 0003 |
| P13 | Перебор/DoS create | Много `POST /orders/:id/payments` | Rate-limit 5/мин на buyer, authz 404 на чужой заказ, zero amount 409 | In-memory лимит сбрасывается при рестарте; несколько инстансов — P3 |
| P14 | Отключение аккаунта при активных платежах | DELETE во время оплаты | 409 при `pending`/`manual_review`, seller-scoped advisory lock, `FOR UPDATE` | Нет |
| P15 | Тестовый аккаунт в live | `isTest` от провайдера | `PAYMENTS_ENV=live` запрещает `isTest` и fake; startup fail на неполном конфиге; live redirect/webhook только https | Ошибка конфигурации деплоя; CI-тесты env |
| P16 | Утечка ключей/секретов в репозиторий | Коммит `.env`, лог | Секреты только в env, `.env.example` без значений, `check:public`, secret scanning | Ротация при инциденте |

### Проверки (где доказано)

- `apps/api/src/payments/payments.flow.db.test.ts`: authz 404 (buyer/seller),
  replay, 409 active/manual, webhook spoof/unknown 503, amount mismatch →
  manual_review, canceled, reconcile orphan, no-store, rate-limit.
- `apps/api/src/payments/token-crypto.test.ts`: roundtrip, tamper tag,
  неизвестная версия, ротация keyring.
- `apps/api/src/payments/state.test.ts`: HMAC, TTL, чужой seller.
- `apps/api/src/payments/log-redaction.test.ts`: токен/тело/телефон не в
  логах.
- `apps/web/src/pages/OrderPage.test.tsx`,
  `SellerPaymentsCard.test.tsx`: состояния оплаты, 409-refetch, отсутствие
  PII/технических кодов в UI.
- `apps/web/e2e/payments-flow.spec.ts`: fake connect → pay → webhook →
  paid; 409 retry; manual_review UI.
- `apps/web/e2e/payments-a11y.spec.ts`: axe light/dark 320/1440.

### Инструментальные ограничения (owner exception)

- **SAST:** `semgrep` и `codeql` в окружении спринта недоступны. Тяжёлые
  тулзы в PR B2 не добавляются; ручной source-аудит и property-тесты
  выполнены, SAST/CodeQL — P3 до активации T2-гейтов (Q1.x). Исключение
  именованное, подтверждено владельцем 27.11.2026, срок — Q1.4/до
  появления SAST в CI; не считать гейт пройденным.
- **Mutation (StrykerJS):** в B2 не добавляется по решению владельца;
  mutation score T2 ≥ 70% changed — после Q1.3 (nightly до активации);
  отсрочка подтверждена владельцем 27.11.2026.
  Property-based тесты покрывают инварианты денег/идемпотентности.

### Остаточные риски и P3

- Нет алертов и field RUM по платежам; SLO-дизайн есть, алерты — после
  активации observability (P3, owner exception до публичного запуска).
- Reconcile в процессе API; отдельный job и распределённый rate-limit —
  P3.
- Возвраты, 54-ФЗ/ККТ и юридический контур — вне change; до реальных
  денег P0 у владельца.
- Live smoke с тестовыми ключами ЮKassa — P3, не блокирует merge.

## Доставка (07-delivery)

Раздел обязателен для change `07-delivery` (PII получателя, внешний
провайдер CDEK, деньги в total, публичный webhook). Tier T2.

Связанные документы: `docs/stack/adr/0005-delivery.md`,
`docs/stack/integrations/cdek.md`,
`docs/stack/runbooks/delivery-rollback.md`,
`openspec/changes/07-delivery/design.md`.

### Границы доверия

1. Браузер покупателя ↔ API: города/ПВЗ, `POST /delivery/quote`,
   checkout с подписанным `quoteToken`, `/orders/:id/delivery`.
2. Браузер продавца ↔ API: тарифы, создание отправления, manual-трек,
   город/ПВЗ магазина, габариты товара.
3. API ↔ CDEK: OAuth (client credentials), calculator, create/get
   order, webhooks.
4. API ↔ PostgreSQL: `order_deliveries` (имя/телефон получателя,
   адрес ПВЗ), `delivery_events`, `orders.delivery_kopecks`.
5. Логи: только order/delivery id, provider, статус/код; без имени,
   телефона, адреса и raw payload.

### Активы

- `recipient_name`, `recipient_phone`, адрес ПВЗ покупателя.
- `quoteToken` (HMAC, TTL 10 мин, hash состава корзины).
- `CDEK_CLIENT_ID/SECRET`, Bearer-токен, `DELIVERY_QUOTE_SECRET`.
- `provider_order_id`/`provider_number`, трек и статусы.
- `orders.total_kopecks` с доставкой; `delivery_kopecks`.

### Угрозы и митигации

| # | Угроза | Вектор | Митигация | Остаточный риск |
|---|--------|--------|-----------|-----------------|
| D1 | Подмена цены доставки | Правка тела checkout | Цена только из HMAC `quoteToken`; TTL 10 мин; hash productIds/city/point; stale → 409; клиентская цена игнорируется | Компрометация `DELIVERY_QUOTE_SECRET`; ротация секрета |
| D2 | Подмена ПВЗ/города | pointCode от другого города | Проверка `point.city_code == cityCode` на quote и checkout; 409 `delivery_point_invalid` | Ошибка кэша городов; TTL кэша |
| D3 | Утечка ПII получателя | Логи, ответы, кэш, URL | `no-store`, buyer/seller authz 404, логи без имени/телефона/адреса, PII не в query, redaction-тест | Телефон/имя остаются в заказе по дизайну; удаление по runbook |
| D4 | Поддельный webhook CDEK | Прямой POST на публичный URL | Нет подписи у CDEK: серверный `GET /v2/orders/{uuid}`, сверка `number`/`cdek_number`; неизвестный → 404; rate-limit 60/мин; no-store | DoS публичного URL; in-memory limiter |
| D5 | Повтор/дубль события | Retry провайдера, гонка | Unique `(delivery_id,status_code,occurred_at)`; нормализация `status_date_time`; replay — no-op | Нет provider event id; два события с разным временем — два ряда (допустимо) |
| D6 | Дубль отправления | Timeout/5xx на create, повтор, manual | `number=order-{id}`; перед retry/manual — reconcile по `im_number`; manual только если CDEK-заказа точно нет; 409 `delivery_already_created` | CDEK может принять заказ после timeout; reconcile закрывает |
| D7 | Создание отправления без оплаты | Прямой API-вызов | `paid`-гейт на create/manual/tariffs; 409 `delivery_not_paid`; seller-scoped authz | Нет |
| D8 | Чужой заказ/доставка | Перебор id | Buyer own order, seller own shop; чужие → 404; нет утечки существования | Нет |
| D9 | Реальные ПДн в test/preview | Preview с реальной сессией | `DELIVERY_LIVE_PII=false` default; live требует явного env + юрпакет; тестовые данные; redaction-тест | Ошибка конфигурации; startup guard |
| D10 | Превышение лимитов CDEK | Массовые quote/create | Quote 30/мин IP, webhook 60/мин, outbound token bucket 200 RPS, timeout 10 s | Распределённый лимит — P3 |
| D11 | Неизвестный статус теряется | Новый код CDEK | Сохраняем raw `status_code`, ставим `in_transit`, безопасный лог | Неверная интерпретация; ручная проверка |
| D12 | PII в manual-треке | Произвольный carrier/track | Zod длина/формат, без логов значения, только seller own order | Нет |
| D13 | Расхождение `orders.delivery_kopecks` и `order_deliveries.price_kopecks` | Баг/ручная правка | Один источник — `order_deliveries.price_kopecks` на момент checkout; snapshot в заказе; invariant-тест `total = items + delivery`; manual цену не меняет | Исторические заказы с delivery 0 — допустимо |

### Проверки (где доказано)

- `apps/api/src/delivery/*.test.ts`: quote token HMAC/TTL/hash, point-city,
  volumetric weight, stale 409, multi-shop, dimensions/city 409.
- `apps/api/src/delivery/cdek-*.test.ts`: OAuth cache, fixture
  contract create/quote, 202+poll, status mapping, unknown code.
- `apps/api/src/delivery/*.flow.db.test.ts`: paid-гейт, дубль create,
  webhook spoof/unknown/replay, reconcile `created|in_transit`, manual
  после терминального отказа, PII redaction, no-store, authz 404.
- `apps/web/e2e/delivery-*.spec.ts`: PVZ checkout → paid → create/manual →
  track; axe light/dark 320/1440.
- Property: `total = items + delivery`, quote TTL, event idempotency,
  volumetric `max(weight, L*W*H/5000)`.

### Инструментальные ограничения (owner exception)

- **Mutation/SAST:** как в платежах — до Q1.3/Q1.4, именованное
  исключение владельца 27.11.2026; contract/property/threat model в этом
  PBI обязательны.
- **Alert/RUM:** SLO-дизайн есть, алерты/field RUM — до публичного
  запуска (owner exception).

### Остаточные риски

- Договор CDEK не заключён: test/fake сейчас, live — после договора и
  `DELIVERY_LIVE_PII=true` с юрпакетом (P0 у владельца).
- Ozon — второй адаптер после MVP; отдельный threat model при включении.
- Reconcile в процессе API; отдельный job — P3.
