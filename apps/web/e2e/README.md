# Browser e2e (Playwright)

Сквозной браузерный сценарий buyer-core: каталог → товар → корзина →
checkout → заказ → `/orders`, затем вход продавца и заказ в
`/admin/orders`. Плюс axe light/dark на 320/1440 и lab-замер LCP на `/`
и `/checkout`.

Спринт 3 добавил оплату (`payments-flow.spec.ts`, `payments-a11y.spec.ts`):
продавец подключает fake-провайдера через `/dev/payments/connect`,
покупатель платит через `/dev/payments/:id/complete`, вебхук переводит
заказ в `paid`, продавец видит оплату; отдельно проверяются 409-retry и
UI `manual_review`. Для этих спеков API обязан работать с fake-провайдером:

```bash
PAYMENTS_PROVIDER=fake PAYMENTS_ENV=test PAYMENTS_FAKE_ENABLED=true \
PAYMENTS_STATE_SECRET=... PAYMENTS_TOKEN_KEYS='{"1":"..."}' \
PAYMENTS_TOKEN_KEY_VERSION=1 \
PAYMENTS_WEBHOOK_URL=http://localhost:3000/payments/yookassa/webhook
```

Dev-страницы `/dev/payments/*` собираются только в dev-сборке web; в
production-бандле их нет. На preview проверяются обычные страницы оплаты
(карточка продавца, заказ, списки) — `payments-a11y.spec.ts`; сам fake-флоу
запускается против dev 5173.

## Доставка (S3-2, PR A)

`delivery-flow.spec.ts` проходит PVZ-checkout (город/ПВЗ получателя,
магазин отправляет из другого города), fake-оплату, тарифы и создание
отправления продавцом, ручной трек и повтор вебхука `CREATED`.
API обязан работать с fake-доставкой:

```bash
DELIVERY_PROVIDER=fake DELIVERY_ENV=test \
DELIVERY_QUOTE_SECRET=... DELIVERY_LIVE_PII=false
```

Ограничение fake-провайдера: его состояние отправления живёт в памяти
процесса API, поэтому перевести отправление в `delivered` по HTTP нельзя
(это делает только API e2e через in-process `setShipmentStatus`).
`delivery-flow.spec.ts` проверяет создание/вебхук `created` и рендер
`delivered` для обеих ролей через стаб ответа — это **UI-only** проверка
карточки. Сам переход `created→delivered` — API e2e
`apps/api/src/delivery/delivery.e2e.db.test.ts` (#73), не браузерный flow.

В этот PR **не входят**: `delivery-a11y.spec.ts` (axe checkout/order/
admin-order/admin-shop/admin-product-new) и LCP `/orders/:id` в
`perf.spec.ts` — это PR B. Полный `pnpm test:e2e` на A не зелёный:
`buyer-flow.spec.ts` и `layout.spec.ts` получают `409 delivery_required`
и адаптируются в PR B; на A зелёный только `delivery-flow.spec.ts` (2/2).

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
   миграцией `0006`.
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
(`localhost`/`127.0.0.1`) в headless Chromium с **CDP Slow 4G**
(150 ms RTT, 1.6 Mbps down, 750 kbps up) и **CPU 4x**
(`Emulation.setCPUThrottlingRate`), **без реальных изображений**
(placeholder-блоки). Пять прогонов дают lab-число для регрессии
бандла/рендера. Это **не** field p75 и **не** DoD-метрика «средний
мобильный»; field p75 требует RUM или реального устройства/Lighthouse
field data — отдельный P3 в `docs/tasks/backlog.md`.

Бюджет 2,5 с — **gate для preview**: на собранном бандле (порт 4173)
`perf.spec.ts` проверяет `expect(labP75).toBeLessThan(2500)` для `/` и
`/checkout`, а evidence содержит `budget.enforced: true`. Для
unbundled dev 5173 (и любого другого baseURL) бюджет — **info**:
превышение фиксируется аннотацией `lab-lcp-over-budget` и
`budget.enforced: false`, прогон не падает. `PERF_ENFORCE=1` включает
gate принудительно на выбранном baseURL. Числа не «подгоняются»:
preview-регрессия валит прогон, dev-факт сохраняется как есть.

Field p75 по-прежнему требует RUM или реального
устройства/Lighthouse field data — backlog P3; закрыть DoD без field
p75 можно только исключением владельца.

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
