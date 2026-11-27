# Quality wave 1: TDD + gates

Статус: **backlog**, кандидат в Sprint 4.
Дата: 27.11.2026.
Источник: решение владельца «TDD внедрить обязательно» + quality-план
`docs/quality/methodologies.md`.

## Цель

Сделать TDD, ATDD, contract/property/mutation-тесты, threat model и
SLO/RUM обязательными для критических путей. Не увеличивать церемонии, а
встроить проверки в существующие PR/CI.

## AC

- [ ] TDD-evidence в PR: RED-тест падал по ожидаемой причине, GREEN
      прошёл; шаблон PR обновлён.
- [ ] DoD/DoR содержат Tier T0/T1/T2 и гейты T2; `AGENTS.md` и
      `roles.md` ссылаются на методологию.
- [ ] Contract-тесты web↔API на shared-схемах: изменение контракта без
      теста валит CI.
- [ ] Property-based тесты для денег/идемпотентности/статусов.
- [ ] Mutation-отчёт T2 (payments/auth) ≥ 70% на изменённых модулях;
      nightly или перед релизом.
- [ ] Threat model для payments/address PII записан в
      `docs/quality/threat-model.md`; abuse cases в change.
- [ ] Semgrep important-only в PR-гейте; CodeQL/SBOM — nightly.
- [ ] SLO checkout/payments + логи/метрики/алерты; field RUM или явное
      исключение owner до публичного запуска.
- [ ] Performance/load: API p95 и load-сценарий checkout/payments.
- [ ] `pnpm verify` + `openspec validate --all --strict` зелёные;
      evidence в `.scrum/sprints/4/evidence/`.

## Задачи

1. **TDD/ATDD:** шаблон PR, red/green evidence, QA-аудит; обновить
   `roles.md`/`dod.md` (сделано в docs-PR).
2. **Contracts:** shared Zod-схемы + contract-тесты web↔API;
   negative/edge cases.
3. **Property/mutation:** fast-check инварианты payments/authz;
   StrykerJS на критических модулях, порог 70% changed.
4. **Security:** threat model payments/address, Semgrep important-only,
   CodeQL/SBOM nightly, ASVS-чек-лист T2.
5. **Observability:** SLO checkout/payments, structured logs/metrics,
   dashboard/alert, RUM.
6. **Performance:** API p95 бюджеты, k6/autocannon сценарии.

## Роли

- QA — тест-план, ATDD, contract/mutation, аудит RED/GREEN.
- Worker/Fullstack — TDD-цикл.
- Architect — threat model/contracts/ADR.
- DevSecOps — Semgrep/CodeQL/SBOM/SLO.
- SM — бюджет, evidence, ретро-действия.

## Метрики

- Mutation score T2 ≥ 70%.
- Покрытие изменённых строк T1 ≥ 80%.
- Escaped P0/P1 = 0 в wave 1.
- Flaky rate < 1%.
- SLO checkout/payments в бюджете.

## Non-goals

- Замена Scrum/OpenSpec на Superpowers целиком.
- IaC/canary/postmortems — wave 2/3.
- Новые продуктовые фичи.

## Evidence

- PR-шаблон и DoD diff.
- Contract/property/mutation отчёты.
- Threat model, Semgrep/CodeQL/SBOM.
- SLO/RUM/load отчёты.
- `pnpm verify`, OpenSpec.
