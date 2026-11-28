# Report: Task S3-2 — Delivery CDEK test contour

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 3` · `task: S3-2` · `change: 07-delivery (archived)` ·
> links: [brief](brief.md) · [handoff](handoff.md) ·
> [evidence](evidence/)

## Итог для координатора

- Статус: **done** (S3-2 закрыт, change archived).
- Сделано: CDEK test contour — quote/PVZ, checkout, adapter/fake,
  shipment, manual track, webhook, reconcile, seller/buyer UI, events;
  ADR/runbooks/spec; e2e/axe/LCP.
- PR: #47–#79; merge close #79 `7161e52`, archive PR #80.
- Evidence: [evidence/](evidence/), канон — `../../evidence/S3-2-*`.
- Блокеры/риски: live YooKassa/CDEK, юрпакет, production deploy/SMS;
  field RUM — до публичного запуска.
- Doc change: ADR 0005, runbooks, delivery spec, threat model, archive
  README — обновлены.

## AC и evidence

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| Габариты/ПВЗ/PII | contract+DB+UI tests | pass | `evidence/S3-2-close-verify.txt` |
| Тарифы/создание/трек | API DB + browser e2e | pass | `evidence/S3-2-browser-e2e.txt` |
| Статус webhook/reconcile | DB e2e + mutation | pass | `../../evidence/S3-2-e2e-tdd.md` |
| Authz/no-store/PII | DB tests + source audit | pass | `../../evidence/S3-2-log-tdd.md` |
| Fake/e2e/axe/LCP | e2e 13 passed, axe 24×0, LCP 580/756/928 | pass | `evidence/S3-2-3.10-axe-results.json`, `evidence/S3-2-3.10-lcp-preview.json` |

## TDD / ATDD

- RED/GREEN/REFACTOR по срезам; mutation checks.
- 3.1 shipment RED — retrospective, owner named exception до
  Q1.1/Sprint 4 (см. `../../review.md`, `events.jsonl`); PBI TDD-first
  audit в backlog.
- T2: threat model D1–D16, contract/property, SLO/логи, runbooks.

## Изменения

- Contracts: delivery, product/shop/order deltas.
- Schema: `0006`, down/runbook.
- UI: checkout/order/admin delivery/shop/product.
- Зависимости: без новых.

## Проверки

| Команда | Exit | Вывод (хвост) |
|---|---:|---|
| `pnpm verify` | 0 | shared 161, web 220, API 394, OpenSpec 9/9 |
| `pnpm test:e2e` | 0 | 13 passed |
| axe | 0 | 24 скана, 0 serious/critical |
| preview LCP | 0 | 580/756/928 ms, enforced |
| `openspec validate --all --strict` | 0 | 9/9 |

## Doc change и drift

- Host-файлы: `openspec/specs/delivery/`, ADR 0005, runbooks,
  threat model, archive README — обновлены.
- Stale claims: live CDEK/YooKassa — owner gates; field RUM — backlog.
- Старые имена/будущее как текущее: archive links обновлены.

## Handoff

- Что осталось: live-интеграции/юрпакет/деплой; S3-3/S3-4 Sprint 4.
- Грабли: подписка CDEK на shared test account — не трогать; один
  API-контейнер.
- Следующий шаг: Sprint 4 planning по команде владельца.

## Блокеры

- Live CDEK contract/keys, `DELIVERY_LIVE_PII=true`, юрпакет,
  production deploy/SMS.
