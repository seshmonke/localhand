# Baseline: до правки скилла

Дата: 27.11.2026. База: `origin/main` `72bfbd5`.
Сценарии запускались свежими субагентами; файлы не менялись.

## T0 — docs/copy

Агент классифицировал PBI как T0 и не потребовал TDD/e2e:

> **Tier:** T0.
> `No spec change: docs/copy; поведение продукта не меняется.`
> Не требовать для T0: `pnpm test:e2e`, `pnpm audit:security`,
> `pnpm test:a11y`, `pnpm budget:perf`.

Одновременно он независимо нашёл расхождение волн в
`docs/quality/methodologies.md` (см. решение владельца в PR3).

## T1 — маленькая фича

Сценарий: страница «Мои отзывы» с AC на список, пустое состояние и
изоляцию чужих отзывов. Агент обоснованно поднял Tier до T2:

> **Tier: T2.** Входная метка T1 не применяется: AC-1/AC-3 — это authz,
> а `reviews` — новая таблица и миграция.
> T2-минимум: threat model, contract/property-тесты, authz-тесты,
> логи без PII, обратимая миграция.

Он включил TDD, ATDD-сценарии, threat model, contract, property,
mutation/SAST как owner-исключение, SLO/логи и runbook. То есть
поведенчески практики не пропущены — агент прочитал `docs/quality/*`.

Вывод: сценарий не проверяет чистый T1; нужен отдельный T1-прогон.

## T1 — чистая фича

Сценарий: публичная страница `/delivery` без данных, auth и БД. Агент
оставил T1 и включил ровно T1-минимум:

> Tier: **T1** — обычная фича; T0-исключение не применять.
> TDD: RED → GREEN → REFACTOR; ATDD-сценарии; e2e главного сценария.
> T2-практики: threat model, contract/property/mutation-тесты — не
> требуются для статического текста.

## T2 — платёжный callback

Агент сразу определил T2 и включил:

> **Tier:** T2 — деньги, внешний провайдер, критические переходы заказа,
> PII.
> TDD RED/GREEN/REFACTOR; contract; property/concurrency; threat model;
> SLO/логи; runbook/rollback; mutation/SAST — owner-исключение до
> активации.

Он также проверил внешний источник и выявил, что ЮKassa не подписывает
webhook; это подтверждает, что скилл не мешает исследованию.

## Главный gap

Поведение сильных агентов уже соответствует `docs/quality/*`, но сам
скилл не содержит:

- `Tier` — 0 вхождений;
- `debt` — 0;
- `postmortem` — 0;
- TDD/ATDD/threat/contract/SLO — только фрагменты в `references/roles.md`;
- полей `Tier`, `TDD evidence`, `ATDD`, `T2 artifacts`, `Exception` в
  `assets/task.md` и `assets/pr.md`;
- отдельных вердиктов и бюджетов в `review.md`, `retro.md`, `sprint.md`.

Поэтому правка кодирует поля, гейты и роли, а не пересказывает
`docs/quality/methodologies.md`.
