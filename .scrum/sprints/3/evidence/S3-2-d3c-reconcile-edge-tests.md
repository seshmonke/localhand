# S3-2-D3c: reconcile edge DB tests

- Edge cases: lower-rank status ignored; older provider event ignored; `delivered` delivery never polled (multi-shop fixtures).
- Failure isolation: one provider error does not block the next row; a missing shipment is skipped; logs contain ids/codes only, no recipient name/phone.
- Abort: `signal.aborted` stops the pass between rows, the first applied row stays, the second is untouched.
- Targeted: `vitest run src/delivery/delivery.reconcile.edge.db.test.ts` -> 3 passed, exit 0.
- Full: `pnpm verify` with DB env -> exit 0; API suite 365 passed.
- `tasks.md`: 3.7 marked here; 3.6 was marked in D3b.
