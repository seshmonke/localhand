# Evidence: S3-1 payments (close)

Дата: 27.11.2026. Change `06-payments` заархивирован как
`2026-11-27-06-payments`; spec `payments` создана. Tier T2.

## PR и merge

- PR #39 `732d2cb` — foundation: миграции `0004`/`0005`, контракты,
  crypto keyring, provider/fake, env, DB-тесты ограничений.
- PR #41 `51aa6f9` — flow: seller connect/callback/account, create/read,
  webhook, reconcile, fake-complete, 30 DB-тестов.
- PR #45 `3e343cb` — UI: admin connect, order pay/status/polling,
  admin badges, dev fake pages, ADR 0004, manual-review runbook,
  threat model, browser e2e/axe/LCP.

## Проверки

- `pnpm verify` — exit 0: shared 139, web 154, api 271, OpenSpec 8/8,
  check:public 469; production build без dev-чанков.
- Browser e2e dev 10/10; preview 8 passed + 2 skipped (dev-only fake
  flow + guides).
- axe payments 16 сканов 0 serious/critical; buyer light/dark 0.
- Preview LCP `/` 544 ms, `/checkout` 720 ms, gate enforced <2500.
- Bundle 577.89 kB / 164.00 gzip (+4.38% / +6.58 kB vs S2-4, within
  budget).
- TDD: RED/GREEN/REFACTOR + property fast-check (amount/currency/URL,
  attempt key, transition match/terminal); evidence
  [S3-1b2-tdd-evidence.md](S3-1b2-tdd-evidence.md).
- T2 owner exceptions: B2 PR size; mutation/SAST до Q1.3/Q1.4
  (threat-model, events 27.11.2026).

## Остаточное/P3

- Live sandbox ЮKassa: нужны OAuth-приложение и тестовые ключи
  владельца; fake-контур завершён.
- Реальный `YooKassaProvider` не реализован; contract-тесты — после
  адаптера.
- Field RUM/алерты, N+1 payment reads, axe error/retry states,
  auth DB flakiness — backlog/следующие PBI.
- Change archived with 28/29 tasks; 5.5 (live smoke) — P3, не блокирует.

## Файлы

- Spec: `openspec/specs/payments/spec.md`.
- ADR: `docs/stack/adr/0004-payments.md`.
- Runbook: `docs/stack/runbooks/payments-manual-review.md`.
- Threat model: `docs/quality/threat-model.md`.
- UI evidence: `S3-1b2-*`.
