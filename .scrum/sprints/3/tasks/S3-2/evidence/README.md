# Evidence: S3-2 Delivery

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 3` · `task: S3-2` · `change: 07-delivery (archived)`

Канонические логи и скриншоты остаются в
[`../../evidence/`](../../../evidence/) — этот каталог содержит ключевые
артефакты и ссылки, без дублирования всех прогонов.

## Ключевые файлы

- [S3-2-close-verify.txt](S3-2-close-verify.txt) — `pnpm verify` после
  #79: exit 0, shared 161/web 220/API 394/OpenSpec 9/9.
- [S3-2-browser-e2e.txt](S3-2-browser-e2e.txt) — полный
  `pnpm test:e2e`: 13 passed; dev LCP info-only.
- [S3-2-3.10-axe-results.json](S3-2-3.10-axe-results.json) — 24 скана
  320/1440 light/dark, 0 serious/critical.
- [S3-2-3.10-lcp-preview.json](S3-2-3.10-lcp-preview.json) — preview
  LCP 580/756/928 ms, enforced.

## Ссылки на канон

- [`../../evidence/S3-2-3.10.md`](../../../evidence/S3-2-3.10.md) — summary
  e2e/axe/LCP/bundle.
- [`../../evidence/S3-2-e2e-tdd.md`](../../../evidence/S3-2-e2e-tdd.md) —
  API/DB e2e, manual guard, PII.
- [`../../evidence/S3-2-log-tdd.md`](../../../evidence/S3-2-log-tdd.md) —
  log redaction/source audit.
- [`../../evidence/S3-2-d3a-reconcile-pass.md`](../../../evidence/S3-2-d3a-reconcile-pass.md),
  [`../../evidence/S3-2-d3b-scheduler-subscription.md`](../../../evidence/S3-2-d3b-scheduler-subscription.md),
  [`../../evidence/S3-2-d3c-reconcile-edge-tests.md`](../../../evidence/S3-2-d3c-reconcile-edge-tests.md) —
  reconcile/authz/idempotency.
- [`../../evidence/S3-2-verify-after-76.txt`](../../../evidence/S3-2-verify-after-76.txt) —
  post-merge verify истории.

## Ограничения

- Live CDEK/YooKassa не вызывались: fake/test contour.
- Field RUM/LCP — backlog до публичного запуска.
- 3.1 — retrospective RED + owner exception до Q1.1/Sprint 4.
