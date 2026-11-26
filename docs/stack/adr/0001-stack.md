# ADR 0001: стек и инфраструктура Local Hand

Статус: accepted.
Дата: 2026-11-27.
Владелец: Local Hand.

## Контекст

Local Hand — маркетплейс + конструктор магазинов для секонд-хенда и
локальных брендов. v1: вся Россия, покупатель — главный пользователь,
оплата на сайте продавцу через ЮKassa, доставка СДЭК, цифровые товары,
AI-агент для покупателя/продавца/админа. Соло-разработка + AI-агенты,
4–8 часов в день, без отдельного бюджета. Данные граждан РФ — по 152-ФЗ.

Нужен стек, который:
- быстро запускается и не требует команды DevOps;
- переиспользует проверенный опыт `eztgshop`/`plugmoney`/`clout-cloud`;
- даёт типы от БД до UI;
- поддерживает SEO-лендинг, SPA-кабинет и API;
- не запирает в зарубежной инфраструктуре.

## Решение

### Монорепозиторий

- Node.js 26.13.1, pnpm 12.23.0.
- `apps/web` — React SPA + лендинг.
- `apps/api` — Fastify API, фоновые задачи pg-boss.
- `packages/shared` — Zod-контракты, доменные типы, общие правила.
- `packages/ui` — Base UI + shadcn-подход, общие компоненты.
- `packages/config` — общие конфиги (по мере роста).

### Frontend

- React 19.3.1, react-dom 19.3.1.
- Vite 8.4.0, `@vitejs/plugin-react` 6.3.0.
- TypeScript 6.0.3 — последняя версия, поддерживаемая
  `typescript-eslint` 8.74. TypeScript 7.0.2 — самая свежая, но
  `typescript-eslint` на ней падает; вернёмся к 7 после поддержки в
  линтере.
- Tailwind CSS 4.3.5, `@tailwindcss/vite` 4.3.5.
- Base UI 1.9.0 — поведение и доступность; shadcn-словарь ролей и
  стилизация поверх.
- react-router 8.5.3.
- TanStack Query 5.108.4 — серверное состояние.
- Zod 4.6.7 — контракты, общие с API.
- Шрифты self-hosted: Unbounded, Golos Text, Martian Mono
  (`@fontsource-variable/*` 5.3.0).
- Storybook 10.6.9 + a11y — витрина компонентов до приложения.
- Адаптивность: mobile-first, но десктоп — полноценная раскладка
  (многоколоночный каталог, постоянная навигация/фильтры, таблицы,
  hover/focus, клавиатура), а не растянутый мобильный экран. Один
  React-код, разные раскладки по брейкпоинтам.

### Backend

- Fastify 5.12.8.
- `fastify-type-provider-zod` 7.0.0 — валидация и сериализация по Zod.
- Drizzle ORM 0.45.4 + Drizzle Kit 0.31.11, PostgreSQL 18.
- `pg` 8.23.1.
- pg-boss 12.40.0 — фоновые задачи в том же процессе/БД.
- S3: `@aws-sdk/client-s3` 3.1178.0,
  `@aws-sdk/s3-request-presigner` 3.1178.0.
- Auth: `@fastify/jwt` 10.2.9, `@fastify/cookie` 11.1.5,
  `@fastify/rate-limit` 11.3.0, `@fastify/helmet` 13.2.0,
  `@fastify/cors` 11.4.3, `@fastify/multipart` 10.1.9.
- ЮKassa и СДЭК — прямые REST-вызовы через `fetch` + Zod-схемы, без
  тяжёлых SDK; вебхуки идемпотентны по внешнему ID.
- LLM: DeepSeek V4.1 Flash через Selectel Token Factory
  (`deepseek-v4.1-flash-1017`, OpenAI-совместимый API). Провайдер
  абстрагирован; запасной — Cloud.ru, затем YandexGPT/GigaChat.

### Тесты и качество

- Vitest 5.1.2 — unit/integration.
- `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 8.0.0,
  `@testing-library/user-event` 14.6.13, jsdom 31.0.1.
- Playwright 1.65.1 — e2e и a11y (`@axe-core/playwright` 4.14.1).
- ESLint 10.15.0, typescript-eslint 8.74.0, eslint-plugin-react-hooks
  7.1.1, eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-storybook 10.6.9,
  eslint-config-prettier 10.1.8.
- Prettier 3.10.1.
- `pnpm verify` = typecheck + lint + format:check + test + build +
  `openspec validate --all --strict`.

### Инфраструктура v1

- **Selectel**: один облачный сервер (2 vCPU, 4 ГБ RAM, 40–60 ГБ NVMe,
  Ubuntu 24.04 LTS).
- Docker Compose: Caddy + web + api + PostgreSQL 18.
- **Selectel S3**: медиа, цифровые товары, шифрованные бэкапы БД.
- **Selectel Token Factory**: LLM по токенам.
- PostgreSQL — self-hosted на VM; managed PostgreSQL с репликой —
  следующий этап, не v1.
- Нет Kubernetes, Redis, балансировщика, CDN, отдельного worker-сервера.
- Домен и DNS — у регистратора/Selectel; TLS — Caddy + Let's Encrypt.
- CI/CD — GitHub Actions, образы в GHCR, деплой по SSH на VM.
- Бэкапы: nightly `pg_dump` + GPG, retention 7 daily + 4 weekly,
  weekly restore check.

## Альтернативы

- **Next.js/Remix вместо Vite SPA + Fastify.** Отклонено: две разные
  поверхности (лендинг + кабинет), SEO-лендинг можно пререндерить, а
  API всё равно нужен отдельно; SPA + Fastify проще для команды агентов
  и переиспользует `eztgshop`.
- **Radix UI / старый shadcn.** Отклонено: Base UI 1.9 — актуальная
  основа shadcn, лучше поддержка composition и доступности.
- **Prisma.** Отклонено: тяжелее, меньше контроля над SQL; Drizzle уже
  проверен в `eztgshop`/`plugmoney`.
- **Yandex Cloud.** Отклонено владельцем.
- **Hostkey.** Хорошая альтернатива для VPS/выделенных серверов, но
  managed PostgreSQL, S3 и Token Factory в Selectel дают меньший объём
  ops и один договор. Hostkey остаётся запасным вариантом для GPU/сырого
  железа.
- **Managed PostgreSQL сразу.** Отклонено для v1: 10 заказов/мес не
  оправдывают стоимость; бэкапы и restore-check обязательны.
- **Прямой DeepSeek API.** Отклонено для ПДн: данные уходят за пределы
  РФ; Selectel Token Factory обрабатывает запросы в РФ.

## Последствия

- Один сервер — единая точка отказа; принято для v1, закрывается
  бэкапами и быстрым восстановлением.
- Docker Compose на VM проще Kubernetes, но требует дисциплины
  обновлений и мониторинга.
- Self-hosted PostgreSQL требует регулярных бэкапов и restore-check;
  без них решение не считается рабочим.
- Base UI + shadcn-подход требует своего стандарта компонентов, иначе
  стили расползутся.
- Mobile-first + полноценный десктоп означает две раскладки на каждый
  экран: проверять 320/390/768/1024/1440 и не считать «на телефоне
  работает» достаточным.
- AI-агент зависит от Selectel Token Factory; адаптер и fallback
  обязательны.
- Стек переиспользует проверенные версии `clout-cloud`/`eztgshop`, но
  версии зафиксированы `pnpm-lock.yaml` и проверяются `pnpm verify`.

## Источники

- `docs/stack/versions.md` — точные версии на 2026-11-27.
- `docs/stack/hosting.md` — инфраструктура v1.
- `docs/stack/llm.md` — LLM-провайдер.
- `docs/concept/product.md` — продукт и скоуп.
- `docs/legal/context.md` — 152-ФЗ, 149-ФЗ, 289-ФЗ.
