# Task S2-4: Security, e2e, evidence, close

## Цель

Доказать buyer-core сквозным browser+API e2e, закрыть authz/PII/logs,
собрать evidence (axe, LCP, бандл), обновить docs/ADR и закрыть Sprint 2.
Нового поведения и change нет.

## AC

- [ ] 5.1 Browser e2e Playwright: `apps/web/playwright.config.ts`,
      `apps/web` script + root delegate `test:e2e` (`pnpm --filter
      @localhand/web test:e2e`), запуск против local preview (web 5173, API 3000, dev
      OTP); сценарий login → каталог/поиск → корзина → checkout →
      заказ → `/orders` → seller `/admin/orders`. API e2e для
      checkout/authz — отдельно. Если CI-браузеры нестабильны — e2e
      локальный гейт с видео/скриншотами, CI API e2e.
- [ ] 5.2 Authz/PII/logs: 401/404 buyer/seller orders, чужой заказ,
      телефон/комментарий не публичны и не в логах; rate-limit
      checkout; source-аудит.
- [ ] 5.3 Docs: ADR 0003 orders/PII/no-payment, обновить
      `docs/legal/context.md`; runbook down SQL `0003`.
- [ ] 5.4 Evidence: `pnpm verify`, `openspec validate --all --strict`,
      preview smoke, axe light/dark 320/1440 на catalog/cart/checkout/
      orders, LCP p75 < 2,5 с (Playwright PerformanceObserver, 5 прогонов)
      и дельта бандла (build output, ориентир ≤ +10% / +20 KB gzip),
      e2e видео/скриншоты; записать
      `.scrum/sprints/2/evidence/S2-4-verify.md`.
- [ ] 5.5 Close: review/retro Sprint 2, state CLOSED, board done,
      events; Sprint 3 — только по плану/команде (вне standing
      authorization).

## owns

- `apps/web/playwright.config.ts`, `apps/web/e2e/**`, `apps/web` script,
  root `package.json` delegate (`test:e2e`), при необходимости
  `@axe-core/playwright` devDep в `apps/web` с обоснованием.
- `apps/api/src/e2e/**` buyer-flow тест.
- `docs/stack/adr/0003-orders.md`, `docs/legal/context.md`,
  `docs/stack/runbooks/orders-rollback.md`.
- `.scrum/sprints/2/**` — orchestrator; worker только evidence-заметки.

Не трогать: production-код фич (только тесты/доки); `openspec/**`
архивы PBI уже сделаны; `apps/web/src/**` — только если e2e выявит P1,
с отдельным фиксом.

## Контракты/данные

- E2E использует dev OTP; телефоны только вымышленные через `phone()`.
- БД — `DATABASE_URL_TEST=...localhand_s2_test`, миграция `0003`;
  guard имени `_test`.
- Скриншоты/видео без реальных ПДн.
- `@axe-core/playwright` — только devDependency, ADR-обоснование в PR.

## Non-goals

- Реальные платежи/доставка/SMS.
- Новые фичи buyer-core; archive changes (сделаны в PBI).
- Sprint 3 plan/start.

## Evidence

- Worker: команды, exit code, хвост, SHA.
- Orchestrator: `S2-4-verify.md`, скриншоты/видео, axe JSON, LCP/бандл.

## Границы

- Работать только в task worktree ветки `task/S2-4-security`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре — стоп, вопрос оркестратору.
