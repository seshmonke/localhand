# S3-2-D3a: delivery reconcile pass

- TDD: core DB tests were RED on the combined branch before `delivery.reconcile.ts` existed; they are GREEN here.
- AC: stale `created` gets `delivered` + track + one event; repeated pass does not duplicate the event; fresh `in_transit`, `quoted`, `manual` are not polled; unknown code is stored raw with `in_transit`.
- Targeted: `vitest run src/delivery/delivery.reconcile.db.test.ts` -> 3 passed, exit 0.
- Full: `pnpm verify` with DB env -> exit 0; API suite 355 passed, 0 failed.
- Env: `DATABASE_URL_TEST` (5433/localhand_s2_test), `JWT_SECRET`, `OTP_SECRET` set in the shell; values not committed.
- Not in this PR: scheduler, app/cdek wiring, subscription check, edge DB cases, `tasks.md` (all in D3b).
