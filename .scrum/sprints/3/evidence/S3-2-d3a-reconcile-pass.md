# S3-2-D3a: delivery reconcile pass

- TDD: core DB tests were RED on the combined branch before `delivery.reconcile.ts` existed; they are GREEN here.
- AC: stale `created` gets `delivered` + track + one event; fresh `in_transit`, `quoted`, `manual` are not polled; unknown code is stored raw with `in_transit`.
- Review fix P1: stable `orderBy(updatedAt, id)`; every attempt (success, provider error, null, lower-rank/older/concurrent loss) touches `updatedAt = now` on the same `id` + `provider_order_id`, so failing rows rotate behind untouched ones.
- Starvation proof: 51 stale `in_transit` rows, provider fails for `remote-1..50`, returns `DELIVERED` for `remote-51`. Pass 1: 50 calls, `remote-51` absent. Pass 2: 50 calls including `remote-51`, row `delivered`, 1 event. Pass 3: 50 calls, `remote-51` absent, event still 1.
- Review fix P2: idempotency test keeps the row `in_transit` with the same `statusDateTime`; two passes -> provider calls 2, event 1, so `onConflictDoNothing` runs for real.
- RED evidence (not committed raw): the rewritten idempotency assertion failed on the old scenario with calls 1; the starvation test failed because `remote-51` was in the first 50 and never polled.
- Targeted: `vitest run src/delivery/delivery.reconcile.db.test.ts` -> 5 passed, exit 0.
- Full API suite with DB env -> 357 passed, exit 0.
- `pnpm verify` with DB env -> exit 0.
- Env: `DATABASE_URL_TEST` (5433/localhand_s2_test), `JWT_SECRET`, `OTP_SECRET` set in the shell; values not committed.
- Not in this PR: scheduler, app/cdek wiring, subscription check, edge DB cases, `tasks.md` (all in D3b/D3c).
