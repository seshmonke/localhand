# Quality wave 1: TDD + gates

Статус: **программа**, Q1.0 in review (docs-PR, done после merge),
Q1.1–Q1.6 — backlog, каждый пункт отдельный PBI. Кандидат Sprint 4.
Дата: 27.11.2026.
Источник: решение владельца «TDD внедрить обязательно» + quality-план
`docs/quality/methodologies.md`.

## Цель

Сделать TDD, ATDD, contract/property/mutation-тесты, threat model и
SLO/RUM обязательными для критических путей. Не увеличивать церемонии, а
встроить проверки в существующие PR/CI.

## AC программы

- [ ] Q1.0 (in review): TDD-evidence в PR-шаблоне; DoD/DoR содержат
      Tier T0/T1/T2; `AGENTS.md` и `roles.md` ссылаются на методологию.
      Done после merge docs-PR.
- [ ] Q1.1–Q1.6: каждый PBI имеет свой AC, evidence и owner; T2-гейты
      становятся блокирующими после merge Q1.0–Q1.6.
- [ ] Contract-тесты web↔API на shared-схемах: изменение контракта без
      теста валит CI.
- [ ] Property-based тесты для денег/идемпотентности/статусов.
- [ ] Q1.3: после merge Q1.3 mutation T2 ≥ 70% changed становится
      pre-merge гейтом; до этого — nightly-отчёт и owner-исключение.
- [ ] Threat model для payments/address PII записан в
      `docs/quality/threat-model.md`; abuse cases в change.
- [ ] Semgrep important-only в PR-гейте; CodeQL/SBOM — nightly.
- [ ] Q1.5: SLO checkout/payments — API p95 < 500 ms без сети провайдера,
      error rate < 1%, availability 99,5%; логи/метрики/алерты; field RUM
      или owner-исключение до публичного запуска.
- [ ] Q1.6: API p95/load-сценарий checkout/payments в тех же бюджетах.
- [ ] `pnpm verify` + `openspec validate --all --strict` зелёные;
      evidence в `.scrum/sprints/4/evidence/`.

## Пункты программы (отдельные PBI)

| PBI | Что | Owner | Evidence / гейт |
|---|---|---|---|
| **Q1.0** | TDD/DoD/roles/PR-шаблон | orchestrator | docs-PR, in review |
| **Q1.1** | TDD/ATDD enforcement | QA + orchestrator | QA-аудит RED/GREEN, 3 PR без test-after |
| **Q1.2** | Contract tests web↔API | Backend + Frontend | shared-схемы, negative/edge, CI gate |
| **Q1.3** | Property/mutation | Backend + QA | fast-check payments/authz, Stryker 70% changed |
| **Q1.4** | Security | DevSecOps + Architect | threat model, Semgrep PR, CodeQL/SBOM nightly |
| **Q1.5** | Observability | DevSecOps + Backend | SLO 99,5%/p95<500ms/error<1%, logs/metrics/alert/RUM |
| **Q1.6** | Performance | Backend + QA | API p95 бюджеты, k6/autocannon checkout/payments |

Порядок: Q1.1 → Q1.2 → Q1.3/Q1.4 → Q1.5/Q1.6. T2-гейты блокирующие
после merge Q1.0–Q1.6; до этого блокируют TDD/contract/property/threat
model, mutation — nightly, SLO/alert/RUM — исключение.

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

- PR-шаблон, DoD и roles diff.
- Contract/property/mutation отчёты.
- Threat model, Semgrep/CodeQL/SBOM.
- SLO/RUM/load отчёты.
- `pnpm verify`, OpenSpec.
