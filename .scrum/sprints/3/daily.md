# Sprint 3 daily

## Cycle 1 — 27.11.2026

### Планирование money-path

- Владелец согласовал скоуп 27.11.2026: payments (ЮKassa sandbox),
  delivery (СДЭК test), order lifecycle, hardening S2.
- Sprint Goal: покупатель оплачивает заказ продавцу в тестовом контуре,
  продавец видит оплату, оформляет СДЭК и ведёт заказ до трека; без
  реальных денег/ключей/адресов.
- План: [03-money-path.md](../../../docs/tasks/03-money-path.md).
- Changes: `06-payments`, `07-delivery`, `08-order-lifecycle`,
  `09-orders-pagination` — по волнам, одна capability на change.
- S3-1 `in_progress`, owner `scrum-worker`, ветка
  `task/S3-1-payments`, lease до 18:00Z.
- `06-payments` создан: proposal/design/spec/tasks;
  `openspec validate 06-payments --strict` — valid.
- Spec review #1: REQUEST_CHANGES (P1 webhook subscription, unknown
  webhook 200, create/webhook race, account versioning). Исправлено:
  адаптер + subscribe/reconcile, 503/unknown, order-lock, версии
  аккаунта, manual_review, keyring, PR A/B.
- `06-payments` прошёл 5 раундов ревью; итог **APPROVE**:
  зафиксированы webhook subscription, 503/reconcile, версии аккаунта,
  order-lock + replay до гейта, 5xx → pending/manual_review вместо
  второго списания, три исхода manual_review, UI-ключ попытки.
- `openspec validate 06-payments --strict` — valid.
- Дальше: planning PR, затем foundation PR A.
- Блокеры: тестовые ключи ЮKassa — владелец; без них fake-провайдер,
  live smoke не блокирует merge.
- Эскалаций нет.

### Итог синка

- Продолжаем: S3-1 payments.
- Перепланирование не нужно.
- Владелец нужен для тестовых ключей ЮKassa/СДЭК и юридического
  контура, но старт не блокируется.

## Cycle 2 — 27.11.2026

### S3-1 Payments foundation (PR A)

- `06-payments` APPROVE после 5 раундов; planning PR #37 merge `b0bd5c4`.
- Worker: миграция `0004`, контракты, crypto keyring, provider
  interface/fake, env guard, down SQL/runbook. Без routes/UI.
- Ветка `task/S3-1-payments`, PR #39.
- Verify: shared 127, web 114, api 204, OpenSpec 8/8, public 401.
- Review #1: REQUEST_CHANGES — P1 default `active`, P1 URL schemes;
  P2 DB-тесты ограничений, reconcile attempts/index, live https,
  AC brief. Исправлено; `0004` восстановлена, новые поля в
  идемпотентной `0005`.
- Review #2/#3: APPROVE; PR A merge `732d2cb` (PR #39).
- Дальше: PR B flow в cycle 3.
- Блокеры: нет; тестовые ключи ЮKassa нужны только для live smoke.

### Дизайн-фикс витрины (вне PBI)

- Владелец согласовал плоские карточки: одна рамка 3px, без тени
  и внутренней рамки изображения, gap 16/24, hover-подчёркивание.
- PR #40 `fix(web): flatten product cards`; review 3 раунда (focus,
  CTA 320, skeleton), merge `26e321e`; verify/e2e 6/6, preview LCP
  612/792, axe shop.
- App перезапущен на `main`; 5173/3000. Далее — PR B payments flow.

## Cycle 3 — 27.11.2026

### S3-1 Payments flow (PR B1)

- Foundation PR A смержен `732d2cb`; миграции `0004`/`0005` в main.
- B1: seller connect/callback/account, create/read payment, webhook,
  reconcile, fake-complete, API/DB tests. UI — B2.
- Ветка `task/S3-1b-payments-flow`, lease до 20:00Z.
- Блокеры: реальные ключи ЮKassa не нужны для fake; live smoke позже.

### S3-1 B1 финал + методология

- PR #41 payments flow backend: review 3 раунда, P1 retry/второй URL
  и P2 disconnect/orphan закрыты; merge `51aa6f9`; api 263, 30 DB-тестов payments flow.
- Q1.0: TDD/методологии/DoD/PR-шаблон, PR #42 merge `91bd8a8`;
  Superpowers установлен глобально (TDD/plans/review).
- Далее: B2 UI/ADR/runbook; Q1.1/Q1.2 — Sprint 4.

## Cycle 4 — 27.11.2026

### S3-1 Payments UI + close (PR B2)

- Tier T2: threat model + TDD RED/GREEN обязательны.
- UI: /admin/shop connect, /orders/:id pay/status/polling, /admin/orders
  badge, dev fake pages.
- Docs: ADR 0004, manual-review runbook, threat model.
- E2E: connect → pay → complete/webhook → paid; axe/LCP.
- Ветка `task/S3-1b2-payments-ui`, lease до 22:00Z.
