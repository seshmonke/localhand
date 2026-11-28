# S3-2-D3c: reconcile edge DB tests

- Fixtures: two sellers and two shops (A, Б), three orders per shop; reconcile
  processes both shops independently.
- Multi-shop isolation: in one pass shop A gets a provider failure, a `null`
  shipment and a healthy delivery; shop B gets a healthy delivery. Shop B is
  `delivered` with one event, shop A failure/missing rows stay `created`, shop A
  healthy row is `delivered`.
- Touch: failure/missing rows get `updated_at = NOW` (rotation proof). Mutation
  "remove `touchAttempt`" fails the `updated_at` assertion (RED captured).
- Mutation "process only the first candidate" fails the shop B delivered
  assertion (RED captured).
- PII: `vi.clearAllMocks()` in `beforeEach`; `info`/`warn`/`error` calls are
  serialized with `Error name:message`; no recipient name, phone or PVZ
  address (Иван/Мария/0000000000/Невский 1).
- Abort: abort after the first shop A row leaves shop B untouched; the next
  pass delivers it. An already aborted signal makes 0 provider calls.
- Targeted: `vitest run src/delivery/delivery.reconcile.edge.db.test.ts` ->
  4 passed, exit 0.
- Full API suite, migrated DB: 375 passed (374 before the new abort test).
- `pnpm verify` with DB env -> exit 0.
- `tasks.md`: 3.7 `[x]`, 3.6 `[x]`, 2.5 `[ ]`, 3.8 `[ ]` — unchanged.
