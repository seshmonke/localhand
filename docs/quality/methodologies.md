# Методологии качества

Статус: **обязательно** с 27.11.2026.
Владелец: Local Hand. Исполняют все агенты и роли.
Связанные документы: `docs/quality/dod.md`, `AGENTS.md`,
`.opencode/skills/sprint-crew/references/roles.md`.

Документ фиксирует не «идеальный процесс», а минимальный набор практик,
без которых инкремент не считается качественным. Правило простое:
**у каждой практики есть артефакт и гейт; без артефакта это лозунг.**

## 0. TDD — обязательная практика

Любая фича или багфикс в коде идут через **RED → GREEN → REFACTOR**:

1. **RED** — написать тест на AC/дефект и увидеть, что он падает по
   ожидаемой причине.
2. **GREEN** — написать минимальный код, чтобы тест прошёл.
3. **REFACTOR** — убрать дублирование, не меняя поведение; тесты остаются
   зелёными.

В PR/отчёте фиксируется evidence:

```text
RED:   payments retry returned 200 with a second confirmationUrl
       test: payments.flow.db.test.ts > stale failed key
GREEN: same test passes; api 263/263
```

Правила:

- Код, написанный до теста, удаляется или переписывается test-first.
- Тест должен падать **без** реализации, а не просто существовать.
- Для T2 (деньги, authz, PII, статусы) дополнительно нужны
  property-based инварианты и mutation-проверка критического модуля.
- Исключения: сгенерированный код, миграции (проверяются up/down),
  одноразовый spike (удаляется), docs/copy. Исключение фиксируется в PR.

TDD реализуется скиллом Superpowers `test-driven-development`; остальные
скиллы Superpowers (`brainstorming`, `writing-plans`,
`systematic-debugging`, `requesting-code-review`,
`verification-before-completion`) используются как обёртка вокруг цикла.

## Уровни риска

| Tier | Что входит | Обязательный минимум |
|---|---|---|
| **T0** | docs, copy, косметика без поведения | typecheck/lint/build, a11y если UI |
| **T1** | обычная фича/багфикс | TDD, unit/integration, e2e главного сценария |
| **T2** | деньги, authz, PII, статусы, миграции, внешние провайдеры | T1 + threat model, contract tests, property-based, mutation, SLO/логи, runbook |

Tier определяется на Planning и фиксируется в change/PBI. Если
сомневаешься между T1 и T2 — выбирай T2.

## 10 обязательных практик

### 1. ATDD / BDD — приёмочные сценарии до кода

AC из OpenSpec переводятся в исполняемые Given/When/Then-сценарии
(API/e2e) до реализации. TDD проверяет unit, ATDD — поведение.

- Артефакт: сценарии в change + тест на каждый AC.
- Гейт: нет AC без теста или ручного доказательства.

### 2. Trunk-based development + feature flags

Ветки живут часы, максимум 1–2 дня; PR < 400 строк; незавершённое
прячется за флагом. Маленькие батчи снижают риск merge и ускоряют
обратную связь.

- Артефакт: короткая ветка, PR < 400 строк, флаг для неполной фичи.
- Гейт: PR больше лимита — только owner-approved исключение.

### 3. Contract testing + schema-first

Контракты API/событий фиксируются Zod/OpenAPI; потребитель и провайдер
проверяются отдельно. Дрифт ловится до e2e.

- Артефакт: shared-схемы, contract-тесты web↔API.
- Гейт: изменение контракта без contract-теста не мержится.

### 4. Property-based + mutation testing

Property-based (fast-check) генерирует краевые случаи; mutation
(StrykerJS) проверяет, ловят ли тесты ошибки. Обязательно для T2.

- Артефакт: инварианты (идемпотентность, суммы, переходы статусов),
  mutation-отчёт changed-модуля.
- Гейт: mutation score T2 ≥ 70% на изменённых критических модулях;
  цель расти, а не блокировать всё сразу.

### 5. Shift-left security

До кода — threat model и abuse cases; в CI — SAST, dependency audit,
secret scan, SBOM; перед релизом — DAST/smoke. OWASP ASVS — чек-лист
уровня, а не «когда-нибудь».

- Артефакт: threat model для T2, Semgrep/CodeQL, CycloneDX SBOM.
- Гейт: high/critical findings блокируют merge; исключение — owner.

### 6. Observability by design

На каждый критический путь — структурные логи, метрики, трейсы; SLO и
error budget; field RUM для фронта. Нельзя улучшать то, что не измеряешь.

- Артефакт: SLO checkout/payments, дашборд, алерты, RUM.
- Гейт: новый критический путь без логов/метрик не Done.

### 7. Performance budgets + load testing

Бюджеты в CI: LCP, bundle, API p95, error rate; нагрузочные тесты
(k6/autocannon) на checkout/payments. Бюджет — гейт.

- Артефакт: budget-файлы, preview-гейт, load-сценарии.
- Гейт: LCP < 2500 ms (preview-прокси), API p95 в бюджете.

### 8. IaC + progressive delivery

Инфраструктура как код, один immutable-артефакт на среды,
canary/blue-green и быстрый rollback. Ручные изменения VM — инцидент.

- Артефакт: Terraform/OpenTofu, digest образа, canary/rollback runbook.
- Гейт: production-деплой только из IaC; rollback проверен.

### 9. Technical debt management

Явный бюджет на долг (например, 15–20% спринта), правило бойскаута,
регулярный triage P3. Долг не копится «фоном».

- Артефакт: debt-борд, бюджет в спринте, решение по каждому P3.
- Гейт: новый P3 не создаётся без owner/срока.

### 10. Blameless postmortems + incident management

На каждый P0/P1/инцидент — таймлайн, root cause, действия с owner и
сроком; без поиска виноватых. Ретро спринта — не замена.

- Артефакт: шаблон postmortem, incident-процесс, проверка actions.
- Гейт: P1 без postmortem не закрывается.

## Волны внедрения

**Волна 1 — сейчас (Sprint 3–4):**
TDD, ATDD, contract tests, property/mutation для T2, threat model,
SLO/RUM на checkout/payments, Semgrep important-only.

**Волна 2 — Sprint 5–6:**
trunk-based + feature flags, performance/load budgets, postmortems.

**Волна 3 — до публичного запуска:**
IaC + progressive delivery, ASVS/SBOM/DAST, debt-бюджет.

Порядок не отменяет обязательность: все 10 входят в DoD по мере
внедрения, но волны не дают церемонии съесть спринт.

## Роли

- **PO** — ценность, метрика, Tier.
- **QA** — тест-стратегия, ATDD, contract/mutation, аудит red/green.
- **Worker / Fullstack** — TDD-цикл, тесты и evidence.
- **Reviewer** — проверяет, что тест падает без кода, и не ослабляет
  гейты.
- **Architect** — контракты, threat model, ADR.
- **DevSecOps** — SAST/DAST/SBOM, SLO, алерты.
- **SM** — debt-бюджет, postmortem actions, ретро.

## Метрики

- Mutation score T2 (цель ≥ 70% на изменённых модулях).
- Покрытие изменённых строк T1 (цель ≥ 80%).
- Escaped defects: P0/P1, найденные после merge.
- Change failure rate и MTTR.
- SLO compliance checkout/payments.
- Flaky rate < 1%.

Метрики не заменяют гейты: красный гейт нельзя «объяснить» метрикой.

## Исключения

Любое исключение — только owner-approved, с причиной, сроком и
артефактом в PR/ADR. Просроченное исключение становится P1-долгом.
Молчаливое ослабление тестов, CI или порогов запрещено.

## Текущее состояние

- **Есть:** OpenSpec, ADR, DoD, CI-гейты, code review, axe, LCP-бюджет,
  secret scanning, runbooks, ретро.
- **Частично:** ATDD-сценарии, contract tests, security, observability,
  performance.
- **Нет:** TDD-evidence, mutation/property, SLO/RUM, load-тесты, IaC,
  postmortems, debt-бюджет.

## Источники

- Superpowers: `test-driven-development`, `writing-plans`,
  `systematic-debugging`, `requesting-code-review`.
- DORA / Accelerate: trunk-based, small batches, CI/CD.
- OWASP ASVS, SAMM, CycloneDX SBOM.
- OpenTelemetry, Google SRE Workbook (SLO/error budget).
- StrykerJS, fast-check, k6.
- WCAG 2.2, 152-ФЗ — через `docs/legal/context.md`.
