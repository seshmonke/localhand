# Design

## Context

См. `proposal.md` — Why. Есть `sellers`, `shops`, `products` и публичная
витрина. Auth, seller admin и запись товаров отсутствуют. Sprint 1
добавляет их одним вертикальным срезом; оплата/доставка/фото — вне.

## Goals / Non-Goals

**Goals:**

- OTP-вход по российскому номеру и сессия.
- Один магазин на продавца, slug и публикация.
- CRUD и публикация товаров только своего магазина.
- Seller admin UI, mobile + desktop.
- Authz и security-гейты.

**Non-Goals:**

- Buyer-auth, корзина, оплата, доставка, цифровые товары, AI.
- S3-загрузка фото; `imageUrl` или плейсхолдер.
- Owner-admin, модерация, жалобы.
- Реальный SMS-провайдер в preview.

## Decisions

### Модель пользователя и продавца

- `users`: id, phone (unique), created_at.
- `sellers.user_id`: nullable unique FK на `users`; у demo-продавца будет
  demo-user. Новый продавец всегда создаётся с `user_id`; nullable —
  только для обратной совместимости seed.
- JWT `sub` = `users.id`; seller резолвится по `sellers.user_id`.
- Один пользователь — один магазин в v1.

Альтернатива: телефон прямо в `sellers` без `users` — отклонено, потому
что позже появятся покупатели и админы с той же сессией.

### OTP

- `otp_codes`: id, phone, code_hash, expires_at, attempts, consumed_at,
  created_at; индекс `(phone, created_at)`.
- Код 6 цифр, TTL 5 минут, максимум 5 попыток; хранится HMAC-SHA256 с
  `OTP_SECRET`, не открытым текстом.
- `/auth/request-code` — 5 запросов/мин на телефон и 20 запросов/мин на
  IP; всегда 200 для валидного номера; ответ не раскрывает, есть ли
  аккаунт.
- `/auth/verify-code` — 401 без деталей; при успехе создаёт `users`,
  если нет, и выдаёт cookie.
- Dev-адаптер возвращает `devCode` только при `NODE_ENV !== production`;
  production с `SMS_PROVIDER=dev` падает на старте.
- SMS-адаптер: интерфейс `SmsProvider`; первый реальный — SMS.ru по env
  `SMSRU_API_ID`; ключ только в env/секретах.

### Сессия

- `@fastify/jwt`, httpOnly cookie `lh_session`, `secure` в production,
  `sameSite=lax`, TTL 7 дней.
- `/auth/me`, `/auth/logout`; без cookie защищённые роуты — 401.
- Роль не выбирается клиентом: продавец — тот, у кого есть `sellers`.

### Магазин

- Создание: имя 1–80, slug 3–40 `[a-z0-9-]`, описание ≤ 2000.
- Slug уникален; резерв: `admin`, `api`, `auth`, `login`, `shops`,
  `products`, `catalog`, `static`, `assets`.
- Статус: `draft | published | blocked`; продавец может `draft`/
  `published`, `blocked` — только платформа (в этом спринте не
  реализуется).
- Чужой магазин → 404, не 403, чтобы не раскрывать существование.

### Товары

- Поля: имя 1–120, описание ≤ 2000, цена integer ≥ 0 копеек,
  `imageUrl` ≤ 2000 или null, статус `draft | published | hidden`.
- Создание — draft; публикация доступна, если магазин published.
- Чужой товар → 404.
- Список продавца — все статусы, сортировка по `updated_at desc`.

### UI

- Маршруты: `/login`, `/admin`, `/admin/shop`, `/admin/products`,
  `/admin/products/new`, `/admin/products/:id`.
- Гард: `/auth/me`; при 401 — редирект на `/login?next=...`.
- Mobile: формы в одну колонку, таблица товаров — карточками.
- Desktop: sidebar, таблица, split-view формы.
- Компоненты — `packages/ui`/web; сначала Storybook не обязателен для
  каждого, но a11y и состояния обязательны.

### Контракты

`packages/shared`: `auth.ts`, `seller.ts`, `product-admin.ts`.
Ответы валидируются Zod; ошибки — `{ error: string }` с 400/401/404/409/
429.

### Тесты

- Unit: OTP hash/TTL, slug, price.
- Route: `fastify.inject` с mocked services/DB; authz 401/404.
- Web: login/onboarding/product form states.
- E2E: dev OTP → shop → product → published → marketplace (Playwright,
  когда preview стабилен; иначе smoke вручную + evidence).

## Risks / Trade-offs

- SMS-провайдер и его ключ → dev-адаптер в preview, реальный adapter
  готов, прод-ключ перед релизом.
- OTP-абьюз → rate-limit, TTL, attempts, generic errors.
- `sellers.user_id` nullable → только demo; новые всегда с user_id,
  позже NOT NULL отдельной миграцией.
- Нет загрузки фото → image URL/плейсхолдер; S3 — следующий change.
- Seller admin UI большой → 4–6 циклов, UI-задачи в конце; при
  перерасходе режем настройки магазина, не authz.
- Публичный репозиторий → только фейковый телефон demo, никаких ПДн.

## Migration Plan

1. Миграция `users`, `otp_codes`, `sellers.user_id`.
2. Seed demo-user и привязка demo-продавца — отложено до S1-5 (не
   входило в AC S1-1/S1-2; задача в бэклоге).
3. Применить, проверить storefront не сломан.
4. Откат: миграции Drizzle без down; для локальной БД — volume, для
   прода — бэкап и revert.

## Open Questions

- Какой SMS-провайдер первым: SMS.ru или SMS Aero; нужен аккаунт/ключ
  перед прод-релизом. На поведение спринта не влияет.
- Финальные тексты оферты/ПДн — отдельный юридический пакет.
