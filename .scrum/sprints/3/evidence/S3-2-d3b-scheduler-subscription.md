# S3-2-D3b: scheduler, wiring, subscription

- Scheduler: one 60s timer, `runNow`, no overlapping pass, `stop` aborts and waits for in-flight.
- Startup: with a provider and enabled reconcile, `runNow` runs and `ensureOrderStatusWebhook` is called once; a conflict logs `delivery_webhook_subscription_failed` and never crashes the app.
- CDEK: a matching `ORDER_STATUS` URL is a no-op; two foreign subscriptions throw `DeliveryWebhookConflictError`; no third POST.
- Targeted: scheduler + app wiring + cdek provider tests -> 18 passed, exit 0.
- Full: `pnpm verify` with DB env -> exit 0; API suite 362 passed.
- `tasks.md`: only 3.6 marked here; 3.7 is marked in D3c with the edge DB tests.
