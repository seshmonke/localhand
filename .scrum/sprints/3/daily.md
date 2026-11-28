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

### S3-1 B2 review/fix

- PR #45: review #1 REQUEST_CHANGES — P1 pending без URL, T2 property/
  SAST, PR size; P2 payment-read errors, 409 invalid, manual copy.
- Fix `049b6f2`: retry pending без URL, error/paid fallback, property
  tests (fast-check), dev-route guard, docs copy.
- Owner 27.11.2026: B2 size exception; mutation/SAST до Q1.3/Q1.4;
  property/threat model/contract в B2.
- Verify: shared 139, web 153, api 271, OpenSpec 8/8, public 441.
- Ждём re-review.

### S3-1 закрыт

- PR #45 merge `3e343cb`; `06-payments` заархивирован как
  `2026-11-27-06-payments`, spec `payments` создана.
- Verify: shared 139, web 154, api 271, OpenSpec 8/8, public 471.
- Evidence: `.scrum/sprints/3/evidence/S3-1-close.md`.
- Live YooKassa smoke/адаптер — P3 после ключей; S3-2 CDEK — следующий.

## Cycle 5 — 27.11.2026

### S3-2 Delivery planning

- Owner decision 27.11.2026: один договор СДЭК на платформе;
  Ozon — второй адаптер после MVP.
- Change `07-delivery`: PVZ-only, quote/checkout с доставкой,
  CDEK test platform, manual track fallback, provider seam.
- `openspec validate 07-delivery --strict` — valid.
- Ветка `task/S3-2-delivery`, lease до 23:00Z.
- Spec review: два круга; исправлены tarif-from-quote, объёмный вес
  в граммах, per-shop quoteToken, webhook/reconcile без «?», live-PII
  guard, `shop_shipment_point_missing`; exception S3-2 в events.
- PR A: схема `0006`, shared-контракты, env guards, quote token,
  fake provider, limiter, down-runbook; verify 154/154/314, OpenSpec 9/9.

### S3-2 Delivery build (A/B/C)

- PR A: #47 plan, #48 contracts, #51 env/quote signing, #52 provider
  seam/fake, #53 schema `0006`; verify 154/154/313, OpenSpec 9/9.
- PR B: #58 quote API, #59 checkout с доставкой, #60 checkout UI
  city/PVZ/name; verify 156/157/327, OpenSpec 9/9.
- PR C: #61 CDEK adapter, #62 shipment/tariffs/manual/webhook;
  verify 156/157/352, OpenSpec 9/9; CI main green.
- Evidence: `S3-2-tdd-a*`, `S3-2-tdd-b*`, `S3-2-tdd-c*`,
  `S3-2-verify-a/b/c.txt`, `S3-2-property-red.txt`,
  `S3-2-tdd-c-mutation-red.txt`.
- Осталось: 2.5/2.7 admin/orders delivery data/UI, 3.7 reconcile,
  3.8 seller/buyer delivery UI, 3.9/3.10 e2e/axe/LCP, 3.11 docs,
  4.1 archive. 3.1 остаётся открытым до e2e (RED был ретроспективным).
- Дальше: PR D — данные доставки в админке и снимок в заказах.

## Cycle 6 — 28.11.2026

### S3-2 delivery close

- Реестр сверен с main: PR #47-#62 влиты, `pnpm verify` exit 0,
  evidence `S3-2-verify-reconcile.txt`; CI main green at #62.
- D1: админка — габариты товара, город/ПВЗ сдачи; change `07-delivery`
  tasks 2.5. Ветка `task/S3-2-d1-admin-data` в отдельном worktree.
- Дальше: D2 — снимок доставки в заказах; D3 — seller/buyer delivery UI
  и reconcile; E — e2e/axe/LCP, ADR/runbooks, архив.

### D2: снимок доставки в заказах

- PR #63 squash-merge `066b29b`; review APPROVE (не-автор), review-gate +
  verify green; post-merge `pnpm verify` exit 0,
  evidence `S3-2-verify-after-63.txt`.
- Buyer/seller detail cards + строка в списке покупателя; `delivery=null`
  безопасен; raw provider/status/point/tariff коды в DOM не выводятся.
- P3-долг для 3.10: переименовать prop `role` → `viewer`, расширить
  проверки raw-кодов, согласовать total с доставкой в фикстурах,
  seller-ярлык «Требует отправки», axe/e2e/LCP на `/orders`,
  `/orders/:id`, `/admin/orders/:id` 320/1440 light/dark.
- Дальше: merge train D1a → D1b → D1c, затем D3a → D3b, D4 seller
  actions.

### D1a: габариты товара в админке

- PR #64 squash-merge `6a967a1`; review APPROVE, combined verify green,
  post-merge `pnpm verify` exit 0 (`S3-2-verify-after-64.txt`).
- Product dimensions UI: create/edit, integer-валидация, null при
  очистке, a11y. `tasks.md` 2.5 не отмечен — это часть 1/3.
- P3-долг: `aria-describedby` на fieldset, единый источник лейблов,
  boundary-тесты, axe для `/admin/products/new`.

### D3a: reconcile pass — REQUEST_CHANGES

- PR #65 review: P1 batch starvation — при >50 залипших строк очередь
  не двигается, потому что ошибка/null/lower-rank не обновляют маркер;
  P2 тест идемпотентности опрашивает уже `delivered` строку и ничего не
  доказывает.
- Фикс: orderBy/touch маркера на каждой попытке + тест 51 строки;
  идемпотентность — два прохода по `in_transit` с тем же событием.

### D4a: events API + web client

- PR #66 squash-merge `7a9f59c`; review APPROVE; combined verify green,
  post-merge `pnpm verify` exit 0 (`S3-2-verify-after-66.txt`).
- Seller GET `{delivery, events}`, newest-first limit 50, authz/no-store;
  POST/PATCH/buyer GET snapshot-only; web client 4 функции + query keys.
- P2 до архива: сценарий events в delta spec, `.max(50)` в контракте,
  полный web RED-evidence; P3: exact-key asserts для PATCH/buyer GET,
  write-bound `status_name`, threat-model check.

### D3a: reconcile pass — code APPROVE, size gate

- Re-review `d6e4e1f`: P1 starvation закрыт (`orderBy(updatedAt,id)` +
  touch), P2 идемпотентность доказана (calls=2, events=1), новых
  P1/P2 нет.
- Размер 510 строк требует owner-approved исключения по
  `docs/quality/methodologies.md` §2 (PR >400). Без исключения —
  пересборка PR, не split одного теста. Ждёт решения владельца.

### D3a: reconcile pass влит с owner-исключением

- PR #65 squash-merge `18b61cd` после APPROVE по коду; P1 starvation и
  P2 идемпотентность закрыты тестами.
- Owner 28.11.2026: разовое исключение на 510 строк (217 production +
  280 tests + 13 evidence) и решение поднять общий лимит PR.
- Политика: отдельный docs-PR #69 — 600 строк code+tests, evidence/логи
  не считаются, >600 — owner-approved исключение.
- D3b scheduler/subscription — PR #68 (252 строки) на ревью; D3c edge
  tests после merge #68.

### Гигиена ревью

- Post-merge verify на main упёрся в `.worktrees/review-67b` внутри
  репозитория: Prettier сканирует worktree ревьюера. Код не виноват;
  после завершения ревью #67 артефакт убрать и повторить verify.

### D1b: город/ПВЗ сдачи — happy path

- PR #67 squash-merge `618fdda`; re-review APPROVE после фикса
  `9f6a518`; combined verify green, post-merge `pnpm verify` exit 0
  (`S3-2-verify-after-67.txt`).
- Debounce 300 мс (полное название — 1 запрос), onError сохранения,
  placeholder города, PVZ aria; 399 changed.
- P3 до C/3.10: вернуть assert «PATCH без ПВЗ не ушёл», aria-invalid
  только для обязательности, fallback `shopErrorMessage`, блокировка
  селектов на время mutation, axe/e2e выбранного ПВЗ.
- Дальше: D1c на main (states/retry/clear + tasks 2.5), затем D3c/D4.

### Политика PR-размера

- PR #69 squash-merge `b8a96f1`; review APPROVE после P3-уточнений.
- Лимит 400→600 строк code+tests; считаются additions в `apps/**`,
  `packages/**`, `scripts/**`, `infra/**`, миграции; evidence/docs/
  lockfiles/generated snapshots не считаются; >600 — owner-approved
  исключение с причиной, сроком и артефактом.
- Post-merge `pnpm verify` exit 0 (`S3-2-verify-after-69.txt`).

### D3b: scheduler + webhook subscription

- PR #68 squash-merge `cb046e8`; re-review APPROVE после фикса
  `8e4528f`; post-merge `pnpm verify` exit 0
  (`S3-2-verify-after-68.txt`).
- Детерминированный runner-hook, app.test 3× на мигрированной БД,
  RED-evidence, 21 targeted/371 API; v1 single-container, distributed
  lock — P2 backlog.
- Дальше: D3c edge-тесты + tasks 3.7.

### D4b: seller shipment UI — PR #71

- Ветка `task/S3-2-d4b-seller-shipment-ui`, 583 code+tests, ветка на
  main `cb046e8`, verify exit 0; PR открыт, ревью.
- Тарифы/paid tariff/create/events/ошибки; manual/polling/axe — PR C.

### D1c: states — REQUEST_CHANGES

- PR #70: P2 — generic/saved-point/live/empty-PVZ не закреплены тестами,
  закрытый ПВЗ можно сохранить. Фикс в работе: тесты + семантика
  fallback + aria-invalid/assert PATCH.

### D4b/D3c: seller UI и edge-тесты

- PR #71 squash-merge `a18a58a`; review APPROVE после P2/P3-фикса
  (44px, paid tariff, цена из снимка, track/502/401). 576 code+tests.
- PR #72 squash-merge `775b783`; review APPROVE после multi-shop/PII/touch
  фикса; 4 edge-теста, API 375.
- Post-merge verify после #72 — exit 0 (`S3-2-verify-after-72.txt`).

### 3.9 API/DB e2e — PR #73

- `delivery.e2e.db.test.ts`: quote→checkout→paid fixture→tariffs→create→
  webhook→track; replay/duplicate идемпотентны; manual после definitive
  fail; PII-логи. 551 code+tests, tasks 3.9 `[x]`.
- Ревью идёт; D4c (manual/polling/tasks 3.8) в работе.

### D4c: manual track + polling

- PR #74 squash-merge `7bca728`; review APPROVE; 599 code+tests,
  tasks 3.8 `[x]`; post-merge `pnpm verify` exit 0
  (`S3-2-verify-after-74.txt`).
- Manual для quoted/legacy, blocked при provider order/manual/track,
  409/502/401/404, polling 15s created/in_transit, retry, double-click.
- P3-долг → отдельный D4d: guard isolation, network retry, polling
  stop 401/404, field alerts/focus, legacy text, useId, dead branch.

### 3.10 browser e2e/axe/LCP

- Ветка `task/S3-2-browser-e2e` от main `7bca728`: delivery-flow,
  axe 320/1440 light/dark, preview LCP; tasks 3.10 только после
  реального прогона.

### D4d: P3-полировка delivery UI

- PR #75 squash-merge `b6a4f71`; review APPROVE; 233 code+tests;
  post-merge `pnpm verify` exit 0 (`S3-2-verify-after-75.txt`).
- Guard isolation, network retry, polling stop 401/404, field alert/focus,
  legacy buyer text, useId, create 409.
- P3 в backlog: admin-card legacy sentinel, negative legacy lock,
  polling 502/network assertion.

### 3.11: ADR/runbooks/spec/events

- PR #76 squash-merge `e934ced`; review APPROVE после двух фиксов
  (shared CDEK subscriptions, rollback `0006`, threat model test mapping).
- ADR 0005, runbooks webhook/reconcile/manual/rollback, seller events
  spec, clear-origin, `.max(50)`, threat model; post-merge verify 0
  (`S3-2-verify-after-76.txt`).
- Dead web mapping `delivery_already_created` — P3 backlog.

### 3.10: split A/B

- Flow/axe/perf написаны; 781>600. Решение: A (flow/helpers) 560,
  B (axe/perf + legacy buyer-flow/layout delivery-aware) ≤600.
- Delivered через fake HTTP не делаем: API e2e; browser flow —
  create/manual/track. `tasks.md` 3.10 только после полного зелёного
  `pnpm test:e2e`.

### LOG и API e2e

- PR #77 merge `22c6d8b`: safeErrorForLog, source-audit без raw err,
  mutation RED name/code/body/cause/nested.
- PR #73 merge `fa8eff4`: quote→checkout→paid→tariffs→create→webhook→
  track; manual guard 502/409; depth-aware PII audit; API 394.
- Post-merge verify `S3-2-verify-after-73.txt` exit 0.

### 3.10 A/B

- A PR #78 (delivery-flow, 564) — review; evidence должен честно
  говорить flow 2/2, full suite — после B.
- B (axe 24×0, LCP 1004/1312/1080, full e2e 13 passed, legacy fix) —
  локально `6db31d3`, после merge A.

### 3.10 A/B

- A #78 merge `b7b5342`: delivery-flow браузерный e2e, helpers,
  RED до seller UI; flow 2/2, A full suite 9/3 (B чинит legacy).
- B #79: axe 24×0 320/1440 light/dark, preview LCP 580/756/928 ms,
  buyer-flow/layout delivery-aware, полный `pnpm test:e2e` 13 passed
  (локальный прогон оркестратора тоже 13 passed), tasks 3.10 `[x]`.
- После merge B — 4.1 archive/close.
