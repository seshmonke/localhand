# Post-change: GREEN/REFACTOR

Дата: 27.11.2026. Ветка: `task/quality-skill-waves` (после PR1–PR3).
Сценарии запускались свежими субагентами на обновлённом скилле.

## T0 — docs/copy

Агент остался на T0 и не потребовал TDD/ATDD:

> Tier: **T0**
> TDD evidence: RED/GREEN/REFACTOR — **N/A**.
> T2 artifacts — **N/A**; это не исключение и не owner-approval.

Он сослался на новые поля скилла:

> `SKILL.md` §12: «T0 не требует TDD/ATDD»;
> `assets/task.md` `## Test plan`: «T0: TDD/ATDD не требуются»;
> `references/cycle.md`: «T0: TDD/ATDD не применяются».

## T1 — публичная страница

Агент оставил T1, включил RED/ATDD и явно исключил T2:

> **Tier:** **T1**
> `## TDD evidence`: RED — тест падает, маршрута нет; GREEN; REFACTOR.
> `## T2 artifacts`: N/A — Tier T1... это N/A по Tier, не
> owner-исключение и не waiver.

Он сослался на новые поля:

> `SKILL.md` §4.0: «PO: Tier T0/T1/T2 до оценки и change»;
> §5.0: «RED до кода»; §12: «Для T1/T2 есть ATDD happy/error и
> RED-evidence»;
> `assets/task.md` `## Tier`, `## Test plan (ATDD)`,
> `## TDD evidence`, `## T2 artifacts`;
> `references/openspec.md` DoR: ATDD happy/error и RED-тест на каждый AC.

## T2 — платёжный callback

Агент оставил T2 и включил полный набор:

> **Tier:** T2.
> RED до кода; GREEN; REFACTOR.
> T2 artifacts: threat model, contract/property, mutation, SLO/логи,
> alert/RUM, runbook/rollback.
> Сейчас блокируют TDD/ATDD, contract, property и threat model;
> mutation — nightly, SAST — ручной/исключение; SLO-дизайн/логи
> обязательны, alert/RUM — именованное исключение. После merge
> Q1.0–Q1.6 все T2-гейты становятся блокирующими.

Он также проверил контракт провайдера и остановился:

> ЮKassa не подписывает webhook и не даёт `event_id`; AC-1/AC-2
> буквально невыполнимы без подписывающего релея или смены AC.
> Это дыра в спеке, а не повод придумать подпись. Код не начинать.

Ссылки на новые поля:

> `SKILL.md` §3 Quality waves, §4.0, §5.0–1, §7, §12;
> `assets/task.md` `## Tier`, `## Test plan (ATDD)`, `## TDD evidence`,
> `## T2 artifacts`;
> `assets/pr.md` `## TDD evidence`, `## ATDD`, `## T2 gates`;
> `references/openspec.md` DoR T2: threat model, contract-план,
> SLO/логи; `references/roles.md` PO/QA/Worker/Reviewer;
> `references/orchestrator.md` контекстный пакет и merge train;
> `references/failure-modes.md` «Нет RED-evidence», «T2 без threat model».

## REFACTOR: уточнение SLO/alert

T2-агент понял правило верно, но строка `SKILL.md` «SLO-дизайн/логи,
alert/RUM — исключение» допускала ложное чтение. После правки:

> SLO-дизайн/логи обязательны, alert/RUM — именованное исключение.

### Контрольный прогон T2

Свежий агент на обновлённом скилле подтвердил:

> Tier T2. Обязательны TDD/ATDD, threat model, contract/property,
> SLO-дизайн/логи, runbook/rollback. Сейчас блокируют TDD/ATDD,
> contract, property, threat model, SLO-дизайн/логи; mutation — nightly,
> SAST — ручной/исключение, alert/RUM — owner-исключение. После
> Q1.0–Q1.6 блокируют все T2-гейты.

Он нашёл два пробела: `runbook/rollback` не назван в волновой строке и
`field RUM` не имел исключения до публичного запуска (оно есть в
`docs/quality/dod.md`). Исправлено в `SKILL.md`, `assets/task.md`,
`assets/pr.md`, `references/roles.md`, `references/git-quality.md`,
`assets/sprint.md`.

Итог после правки:

> `runbook/rollback` — в T2-артефактах и волне 1;
> `field RUM` — именованное owner-исключение до публичного запуска.

### Финальный контроль

Свежий агент подтвердил оба пункта. Остались две неточности: Reviewer не
перечислял `runbook` в явном запрете принимать T2; `sprint.md` группировал
mutation/SAST/alert/RUM одной строкой. Исправлено: Reviewer требует
`runbook`; `sprint.md` разделяет режимы «сейчас» и «после Q1.0–Q1.6».

Дополнительно закрыт инвариант T0/T1: T0 не требует e2e и OpenSpec
archive; T1/T2 требуют e2e главного сценария.

