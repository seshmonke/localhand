# Browser e2e (Playwright)

Сквозной браузерный сценарий buyer-core: каталог → товар → корзина →
checkout → заказ → `/orders`, затем вход продавца и заказ в
`/admin/orders`. Плюс axe light/dark на 320/1440 и LCP p75 на `/` и
`/checkout`.

## Предусловия

1. `pnpm dev` — web на `http://localhost:5173`, API на `:3000` с
   dev-адаптером SMS и миграцией `0003`.
2. Тестовая БД с миграциями (`pnpm db:migrate`) и вымышленные номера;
   тесты сами создают продавца, магазин, товары и заказы через API.
3. Если API стартует не через `.env`, задайте `DATABASE_URL`,
   `JWT_SECRET`, `OTP_SECRET` (не placeholders) в окружении команды
   `pnpm dev`.

Сервер автоматически не поднимается: тесты не управляют жизненным
циклом стека и не мешают уже запущенному dev-серверу.

## Запуск

```bash
pnpm test:e2e                 # все спеки против http://localhost:5173
pnpm --filter @localhand/web test:e2e e2e/buyer-flow.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 pnpm --filter @localhand/web test:e2e
```

`PLAYWRIGHT_BASE_URL` переключает baseURL, например на production
preview (`pnpm build` + `pnpm preview`, порт 4173) для честного LCP и
проверки собранного бандла.

## Артефакты

`apps/web/test-results/` (gitignored): видео, trace и скриншоты
упавших тестов, а также `axe-results.json` и `lcp-results.json`,
приложенные к отчёту Playwright. Явные скриншоты шагов лежат рядом с
тестом в `test-results/<spec>/`.

Тестовые данные — только вымышленные: телефоны `+7 999 …`, магазины
«E2E магазин …». Реальные ПДн в скриншоты и видео не попадают.

## Браузеры

`pnpm --filter @localhand/web exec playwright install chromium` — если
кэш Playwright пуст. Альтернатива для окружений без установки
браузеров: задать `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (см.
`playwright.config.ts` — `launchOptions.executablePath`) на локальный
Chromium/Chrome; абсолютный путь в репозиторий не коммитится.

## Почему `@axe-core/playwright`

`@axe-core/playwright@4.14.1` — официальная интеграция axe-core с
Playwright: сама внедряет движок в страницу и возвращает нарушения с
селекторами и impact. Версия совпадает с `axe-core@4.14.1`, который уже
приходит транзитивно через Storybook a11y, поэтому в проекте один
движок. Пакет — только `devDependency`: в runtime-бандл web не попадает,
размер продукта не меняет.
