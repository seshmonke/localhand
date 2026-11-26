# Design

## Context

См. `proposal.md` — Why. Текущее состояние: монорепозиторий с Fastify
API, React SPA, Drizzle/PostgreSQL, healthcheck и локальным preview.
Auth, оплаты и админки ещё нет. Контракты — Zod в `packages/shared`.

## Goals / Non-Goals

**Goals:**

- Доказать сквозной путь PostgreSQL → API → React на реальном preview.
- Зафиксировать минимальные доменные сущности продавца, магазина и
  товара до auth/оплаты.
- Скрывать черновики на уровне запросов, а не UI.
- Оставить контракты пригодными для будущих auth/админки.

**Non-Goals:**

- Auth, роли, корзина, чекаут, оплата, доставка, цифровые товары,
  AI-агент.
- Загрузка фото в S3; в срезе — плейсхолдер/внешний URL.
- Пагинация, поиск и фильтры сверх базового списка.
- Полный дизайн всех экранов и десктопная админка.

## Decisions

### Схема БД

- `sellers`: id, display_name, created_at.
- `shops`: id, seller_id (unique), slug (unique), name, description,
  status (`draft | published | blocked`), created_at, updated_at.
- `products`: id, shop_id, name, description, price_kopecks, image_url,
  status (`draft | published | hidden`), created_at, updated_at.

Один продавец — один магазин в v1: упрощает slug/URL и будущую админку.
Деньги — integer в копейках. Enum — pgEnum, значения из
`packages/shared`, чтобы API и UI не расходились.

Альтернатива: отдельная таблица вариантов/остатков. Отклонено для
скелета: товар без вариантов достаточен, варианты — следующий change.

### Публичность

Запросы фильтруют `shops.status = published` и
`products.status = published`. UI не решает, что показывать; API не
отдаёт черновики даже по прямому id/slug.

### API

- `GET /catalog/products` — опубликованные товары, лимит 100, сортировка
  по `created_at desc`.
- `GET /shops/:slug` — магазин + его опубликованные товары; 404, если
  магазин не опубликован.
- `GET /products/:id` — товар + магазин; 404, если товар/магазин не
  опубликован.
- Ошибка — `{ error: "not_found" }` с 404; остальные — стандартный
  Fastify error.

Контракты Zod в `packages/shared/src/contracts/storefront.ts`; ответы
валидируются `fastify-type-provider-zod`.

### Web

- react-router: `/` — маркетплейс, `/shops/:slug` — магазин,
  `/products/:id` — товар.
- TanStack Query: запросы к `/api/*`; loading/empty/error состояния.
- `ProductCard` — общий компонент; ссылка на товар, цена, магазин.
- `preview.proxy` в Vite — тот же `/api`, что dev; прод — Caddy.
- Mobile-first; на десктопе сетка 4 колонки, на мобильном 2.

### Seed

Идемпотентный `pnpm db:seed`: один seller, shop `local-hand-demo`,
3–5 товаров. Повторный запуск обновляет, не плодит дубли.

## Risks / Trade-offs

- Схема изменится с auth/вариантами → миграции и контракты; не
  строить UI на деталях, которых нет в контракте.
- `image_url` без S3 → внешние ссылки/плейсхолдер; заменить на S3
  ключи в change с загрузкой фото.
- Нет пагинации → лимит 100; при росте каталога добавить cursor.
- Preview без remote VM → проверяем локально; remote preview появится
  после домена/сервера.
- Нет e2e → API-тесты + компонентные тесты; Playwright добавить, когда
  появится стабильный preview-URL.

## Migration Plan

1. Сгенерировать миграцию `pnpm db:generate`.
2. Применить `pnpm db:migrate`, засеять `pnpm db:seed`.
3. Собрать и открыть preview, проверить каталог/магазин/товар.
4. Откат: миграции Drizzle без down; для локальной БД — пересоздать
   volume, для прода — восстановить бэкап и откатить коммит.

## Open Questions

Нет блокирующих. Загрузка фото, варианты товара и пагинация — отдельные
changes.
