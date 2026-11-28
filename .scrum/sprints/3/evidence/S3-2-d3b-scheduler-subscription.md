# S3-2-D3b: scheduler, wiring, subscription

## RED (main + tests from this PR)

- `delivery.reconcile.scheduler.test.ts`: module does not exist.
- `app.test.ts`: startup never calls `ensureOrderStatusWebhook`; no runner hook.
- `cdek-provider.test.ts`: two foreign subscriptions resolve instead of
  throwing `DeliveryWebhookConflictError`.
- Reproduced on a migrated DB: `app.test.ts` failed with
  `expected '' to contain 'delivery reconcile pass failed'` because the real
  reconcile pass succeeded.

## GREEN

- Scheduler: one 60s timer, `runNow`, no overlapping pass, `stop` aborts and
  waits for in-flight; the pass is injectable and defaults to
  `runDeliveryReconcile`.
- Wiring: `deliveryReconcileRunner` test hook; success/failure is checked via
  the fake runner, never a real DB; `app.close()` is in `finally`.
- Startup calls `ensureOrderStatusWebhook` once; conflict/failure logs
  `reason=conflict|provider_error` (no URL/secrets) and never crashes.
- CDEK: matching subscription is a no-op; one foreign subscription creates
  one; two foreign throw `DeliveryWebhookConflictError`, no third POST.
- Targeted 20 passed; full API 371 passed (368 before new tests); `pnpm verify`
  with both DB envs on migrated DB -> exit 0. `tasks.md`: 3.6 `[x]`, 3.7 `[ ]`.

## REFACTOR

- The scheduler pass is a `typeof runDeliveryReconcile` parameter with the
  real pass as default; `buildApp` forwards one `deliveryReconcileRunner`
  option, so the wiring test never touches a DB.

## Single-instance limit

Two API processes can race and create identical subscriptions. v1 runs one API
container (`docs/stack/hosting.md`); no dedup lock. Backlog task for a
distributed lock: `docs/tasks/backlog.md` (P2).
