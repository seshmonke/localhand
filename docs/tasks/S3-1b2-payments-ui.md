# Task S3-1b2: Payments UI + close

## Цель

Показать оплату пользователю: продавец подключает ЮKassa, покупатель
платит заказ, оба видят статус; закрыть S3-1 ADR/runbook/e2e.

Tier: **T2** — деньги/PII/внешний провайдер.
TDD обязателен: RED → GREEN → REFACTOR, evidence в PR.
Change: `openspec/changes/06-payments/`. PR B2.

## AC — UI

- [ ] `/admin/shop`: карточка «Приём платежей» — `active|error|disabled|
      null`, тестовый бейдж, маскированный account id, подключить/
      отключить/повторить; 409 при активных платежах; ошибки без техники.
- [ ] `/orders/:id`: «Оплатить» для `new`; `payment_pending`/`paid`/
      `manual_review`; `Idempotency-Key` хранится на попытку
      (sessionStorage/ref); `?payment=return` + polling 3 с до 60 с;
      «Проверить ещё раз»; 409 → перечитать `GET payment`; `payment:null`.
- [ ] `/checkout` и `/orders`: честный статус «оплата не подключена»,
      если платежа нет; после checkout — переход к оплате.
- [ ] `/admin/orders` и `/admin/orders/:id`: бейдж/статус оплаты,
      `manual_review` отдельно от статуса заказа; без кнопки оплаты.
- [ ] Dev-only страницы для fake: `/dev/payments/connect` (подтверждение
      OAuth → callback API) и `/dev/payments/:id/complete` (complete →
      webhook/return). В production bundle не видны/не работают.
- [ ] API dev-complete: при необходимости вернуть provider payment id или
      сам вызвать webhook, чтобы UI-путь доходил до `paid`; только
      fake+enabled, buyer authz.
- [ ] Все ответы платежей `no-store`; PII/токены не в UI/логах.

## AC — документы и доказательства

- [ ] `docs/stack/adr/0004-payments.md`: партнёрская схема, токен,
      вебхук/reconcile, fake/sandbox/live, manual_review, no refunds,
      owner decision lab LCP/field RUM.
- [ ] `docs/stack/runbooks/payments-manual-review.md`: 3 исхода
      (платежа нет → canceled/new; возврат в ЮKassa → canceled/new;
      оплата подтверждена → succeeded/paid + provider id/paid_at);
      SQL/ops-only, backup, логи.
- [ ] `docs/quality/threat-model.md` (payments section): confirmation URL,
      OAuth code/state, token at rest, webhook spoof/replay, manual review,
      refund out-of-scope, PII/address.
- [ ] Browser e2e: seller connect fake → buyer pay → dev complete/webhook
      → paid; seller sees paid; manual_review UI; 409 retry.
- [ ] axe light/dark 320/1440 на изменённых страницах; preview LCP
      <2500; bundle delta.
- [ ] `pnpm verify`, `openspec validate 06-payments --strict`; evidence
      `.scrum/sprints/3/evidence/S3-1b2-*`.

## TDD evidence (обязательно)

Для каждого AC — сначала падающий тест (unit/RTL или Playwright/API) с
выводом, затем код. В PR: RED/GREEN/REFACTOR блоки. Без RED-evidence PR
не принимается.

## owns

- `apps/web/src/pages/{Order,Checkout,AdminShop,AdminOrder,AdminOrders}Page.tsx`,
  `apps/web/src/components/admin/**`, `apps/web/src/lib/{api,queries}.ts`,
  `apps/web/src/App.tsx` (dev routes), `apps/web/src/cart/**` при
  необходимости.
- `apps/web/e2e/**`, `apps/web/playwright.config.ts` при необходимости.
- `apps/api/src/payments/payments.route.ts` — только dev-complete
  extension/webhook bridge, без изменения боевого контракта.
- `docs/stack/adr/0004-payments.md`,
  `docs/stack/runbooks/payments-manual-review.md`,
  `docs/quality/threat-model.md`.
- `openspec/changes/06-payments/tasks.md` — отметки 3.7/4.x/5.3/5.4.

Не трогать: CDEK/lifecycle/pagination, реальные ключи, миграции,
`openspec/specs/**`, `.scrum/**` (кроме orchestrator).

## Контракты/данные

- Fake provider + dev env (PAYMENTS_ENV=test/sandbox); реальные ключи нет.
- Суммы — копейки/RUB; карт нет; токен только на сервере.
- Тестовые данные вымышленные; screenshot без ПДн.

## Non-goals

- Реальный ЮKassa HTTP-адаптер/деньги/54-ФЗ/refunds.
- СДЭК, lifecycle shipping, pagination.
- Мобильное приложение.

## Границы

- Работать в `task worktree`, ветка
  `task/S3-1b2-payments-ui`.
- Коммитить в ветку; не пушить/не мержить.
- При конфликте с дизайном/спекой — стоп и вопрос.
