# Evidence: S3-1 B2 payments UI

Дата: 27.11.2026. PR #45, ветка `task/S3-1b2-payments-ui`.
Tier T2. Fake-провайдер, вымышленные данные.

## TDD

- [TDD evidence](S3-1b2-tdd-evidence.md): RED API assertion, RED web
  14/22, GREEN web 153/API 271; REFACTOR без изменения поведения.
- Property-based: `fast-check` для `attemptKeyFor`, контрактов платежа,
  `providerPaymentMatches`/терминальных статусов.

## Verify

- [S3-1b2-verify.txt](S3-1b2-verify.txt): exit 0, shared 139, web 154,
  API 271, OpenSpec 8/8, check:public 467.
- Production build: dev-маршруты и чанки отсутствуют.

## E2E / a11y / perf

- [S3-1b2-e2e-payments.txt](S3-1b2-e2e-payments.txt): 10 dev e2e.
- [S3-1b2-e2e-preview.txt](S3-1b2-e2e-preview.txt): 3 preview.
- [S3-1b2-axe-payments.json](S3-1b2-axe-payments.json): 16 сканов,
  0 serious/critical.
- [S3-1b2-axe-buyer-pages.json](S3-1b2-axe-buyer-pages.json): buyer
  light/dark.
- [S3-1b2-lcp-preview.json](S3-1b2-lcp-preview.json): catalog 524 ms,
  checkout 708 ms, enforced <2500.
- [S3-1b2-bundle.json](S3-1b2-bundle.json): 577.89 kB / 164.00 gzip
  (+4.38% / +6.58 kB; within budget).

## Скриншоты

8 PNG: admin shop connected, order paid, order manual_review,
admin order paid/manual_review, 409 retry, dev complete; 320/1440.
Данные fake; ПДн нет.

## Owner exceptions

- PR #45 > 400 строк: cohesive B2 (UI + RTL + docs/e2e одного PBI),
  owner-approved 27.11.2026.
- Mutation/SAST: Stryker/Semgrep/CodeQL не установлены; property +
  threat model + contract в B2, mutation/SAST — Q1.3/Q1.4, owner-approved
  27.11.2026. См. `docs/quality/threat-model.md`.

## Риски/P3

- N+1 payment reads в списках до pagination.
- Live sandbox smoke после ключей ЮKassa.
- Field RUM/алерты до публичного запуска.
