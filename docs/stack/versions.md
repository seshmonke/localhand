# Версии инструментов

Проверено 2026-11-27 через `npm view <package> version`; точные версии
фиксирует `pnpm-lock.yaml`. Обновление — отдельным PR с `pnpm verify`.

## Среда

| Инструмент | Версия |
|---|---|
| Node.js | 26.13.1 |
| pnpm | 12.23.0 |
| Docker | 29.1.3 |
| Docker Compose | 2.40.3 |
| OpenSpec | 2.2.0 |

## Frontend

| Пакет | Версия |
|---|---|
| react / react-dom | 19.3.1 |
| vite | 8.4.0 |
| @vitejs/plugin-react | 6.3.0 |
| typescript | 7.0.2 |
| tailwindcss / @tailwindcss/vite | 4.3.5 |
| @base-ui/react | 1.9.0 |
| react-router | 8.5.3 |
| @tanstack/react-query | 5.108.4 |
| zod | 4.6.7 |
| lucide-react | 1.81.0 |
| motion | 14.14.0 |
| @fontsource-variable/* | 5.3.0 |
| storybook / @storybook/react-vite / addon-a11y | 10.6.9 |

## Backend

| Пакет | Версия |
|---|---|
| fastify | 5.12.8 |
| fastify-type-provider-zod | 7.0.0 |
| @fastify/cookie | 11.1.5 |
| @fastify/cors | 11.4.3 |
| @fastify/helmet | 13.2.0 |
| @fastify/jwt | 10.2.9 |
| @fastify/multipart | 10.1.9 |
| @fastify/rate-limit | 11.3.0 |
| drizzle-orm | 0.45.4 |
| drizzle-kit | 0.31.11 |
| pg | 8.23.1 |
| pg-boss | 12.40.0 |
| @aws-sdk/client-s3 / s3-request-presigner | 3.1178.0 |
| dotenv | 18.0.10 |
| tsx | 4.23.15 |

## Тесты и качество

| Пакет | Версия |
|---|---|
| vitest | 5.1.2 |
| @playwright/test | 1.65.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/jest-dom | 8.0.0 |
| @testing-library/user-event | 14.6.13 |
| jsdom | 31.0.1 |
| @axe-core/playwright | 4.14.1 |
| oxlint | 1.95.0 |
| prettier | 3.10.1 |

## Инфраструктура

| Компонент | Версия/условие |
|---|---|
| PostgreSQL | 18 |
| Selectel VM | Ubuntu 24.04 LTS |
| Caddy | 2.x |
| Selectel Token Factory | `deepseek-v4.1-flash-1017` |
