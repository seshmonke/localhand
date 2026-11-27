# Browser e2e (Playwright)

Сквозной браузерный сценарий buyer-core: каталог → товар → корзина →
checkout → заказ → `/orders`, затем вход продавца и заказ в
`/admin/orders`. Плюс axe light/dark на 320/1440 и lab-замер LCP на `/`
и `/checkout`.

## CI и границы гейта

**Browser e2e не входит в CI и не запускается из `pnpm verify`.** В CI
выполняется только API e2e: DB-тесты API (включая
`apps/api/src/e2e/buyer-flow.db.test.ts`) при заданном
`DATABASE_URL_TEST`. Browser e2e — **локальный ручной гейт**:

```bash
pnpm test:e2e
```

Причина: Playwright-браузеры, видео и поднятый web+API стоят дорого и
нестабильны в общем CI; стек поднимается вручную. Ограничение: результат
`pnpm test:e2e` — локальное evidence (лог прогона + скриншоты шагов;
video/trace/скриншоты падений), а не CI-доказательство и не блокер
merge. Не выдавать локальный прогон за CI.

## Предусловия

1. `pnpm dev` — web на `http://localhost:5173`, API на `:3000` с
   миграцией `0003`.
2. API обязан работать с `SMS_PROVIDER=dev`: e2e preflight делает
   `GET /api/health` и требует `smsProvider: "dev"` **до** первого
   `request-code`. Иначе прогон падает с понятной ошибкой: иначе тест
   отправит реальные SMS или не получит dev-код. Поле health — не
   секрет, это конфигурация.
3. Тестовая БД с миграциями (`pnpm db:migrate`) и вымышленные номера;
   тесты сами создают продавца, магазин, товары и заказы через API.
4. Если API стартует не через `.env`, задайте `DATABASE_URL`,
   `JWT_SECRET`, `OTP_SECRET` (не placeholders) и `SMS_PROVIDER=dev` в
   окружении команды `pnpm dev`.

Сервер автоматически не поднимается: тесты не управляют жизненным
циклом стека и не мешают уже запущенному dev-серверу.

## Запуск

```bash
pnpm test:e2e                 # все спеки против http://localhost:5173
pnpm --filter @localhand/web test:e2e e2e/buyer-flow.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 pnpm --filter @localhand/web test:e2e
```

`PLAYWRIGHT_BASE_URL` переключает baseURL, например на preview
(`pnpm build` + `pnpm preview`, порт 4173) для проверки собранного
бандла и lab-замера на нём.

## LCP: lab smoke, не field p75

`perf.spec.ts` измеряет LCP через PerformanceObserver на loopback
(`localhost`/`127.0.0.1`) в headless Chromium **без CPU/network
throttling** и **без реальных изображений** (placeholder-блоки).
Пять прогонов дают lab-число для регрессии бандла/рендера. Это **не**
field p75 и **не** DoD-метрика «средний мобильный»; field p75 требует
RUM или Lighthouse с CPU/network throttling на реальном стенде —
отдельный P3 в `docs/tasks/backlog.md`. Бюджет 2,5 с здесь — lab smoke,
а не замена DoD.

## Артефакты

`apps/web/test-results/` (gitignored): при падении — video, trace и
скриншот; при успехе — явные скриншоты шагов из `buyer-flow.spec.ts`,
а также `axe-results.json` и `lcp-results.json`, приложенные к отчёту
Playwright. Лог прогона сохраняйте отдельно (например,
`pnpm test:e2e > e2e.log 2>&1`) — это основное evidence локального
гейта.

Тестовые данные — только вымышленные: телефоны `+7 999 …`, магазины
«E2E магазин …». Реальные ПДн в скриншоты и видео не попадают.

## Типы e2e

`apps/web/tsconfig.e2e.json` покрывает `e2e/**/*.ts` и
`playwright.config.ts` с `types: ["node"]`. Типы проверяются в общем
`pnpm --filter @localhand/web typecheck` и отдельно:

```bash
pnpm --filter @localhand/web typecheck:e2e
```

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
