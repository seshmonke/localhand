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
  именованное, срок — до появления SAST в CI; не считать гейт пройденным.
- **Mutation (StrykerJS):** в B2 не добавляется по решению владельца;
  mutation score T2 ≥ 70% changed — после Q1.3 (nightly до активации).
  Property-based тесты покрывают инварианты денег/идемпотентности.

### Остаточные риски и P3

- Нет алертов и field RUM по платежам; SLO-дизайн есть, алерты — после
  активации observability (P3, owner exception до публичного запуска).
- Reconcile в процессе API; отдельный job и распределённый rate-limit —
  P3.
- Возвраты, 54-ФЗ/ККТ и юридический контур — вне change; до реальных
  денег P0 у владельца.
- Live smoke с тестовыми ключами ЮKassa — P3, не блокирует merge.
