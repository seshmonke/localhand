# PR #73 body — S3-2-E2E API/DB delivery e2e (tasks 3.9)

## Summary

One executable API/DB e2e for the delivery chain: quote -> checkout -> paid ->
tariffs -> create -> webhook -> track/status, manual fallback after a definitive
provider failure with remote-lookup guards, webhook/create idempotency and
PII-free info/warn/error logs. Test-only: production code is untouched.

- Branch `task/S3-2-e2e-api`; main `22c6d8b` (LOG #77) merged.
- `delivery.e2e.db.test.ts`: 600 lines, 5 tests (depth-aware source audit +
  4 DB tests).
- `tasks.md`: 3.9 `[x]`; 3.10 / 3.11 / 4.1 remain `[ ]`.
- Payment is a DB fixture; payment e2e stays in S3-1.

## P2.2 follow-up (LOG #77)

- `ALLOWED_KEYS` no longer contains `err`/`error`: `err` is allowed only as
  `safeErrorForLog(error)`, `error` only as `result.ok ? undefined : result.error`.
- Raw `err: error`, `error: err`, `code: error`, `new Error(...)` fail the audit.
- Depth-aware log scanner (not `[^)]*`): PII after `Date.now()`/multiline is
  scanned. Mutation RED: `err: new Error("Иван Тестов")` in reconcile and
  `recipientName` after `Date.now()` in delivery.route both fail.
- Runtime reconcile PII is covered by #77 `delivery.log-redaction.test.ts`
  (14 tests, safe `{name, code?}`); it runs green in this branch.

## Verification

- Targeted: 4 files / 36 tests (e2e 5, #77 log-redaction 14, shipment DB 16,
  manual 1), exit 0.
- `pnpm verify` with `DATABASE_URL_TEST`: exit 0; API 43 files / 394 tests,
  web 220, shared 161; openspec 9/9; check:public 591 files.
- Evidence: `.scrum/sprints/3/evidence/S3-2-e2e-*` (TDD/mutations/verify).
