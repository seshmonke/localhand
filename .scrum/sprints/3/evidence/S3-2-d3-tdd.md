# S3-2-D3 TDD: delivery reconcile + webhook subscription

Change: `07-delivery`, tasks 3.6 (subscription half) and 3.7.
Tier: T2. Env for DB tests:
`DATABASE_URL_TEST=postgres://localhand:localhand@localhost:5433/localhand_s2_test`.

## RED

`S3-2-d3-tdd-red.txt`: new tests fail before implementation.

- `delivery.reconcile.db.test.ts`, `delivery.reconcile.scheduler.test.ts`:
  modules do not exist yet.
- `cdek-provider.test.ts`: two foreign subscriptions resolve instead of
  throwing; `DeliveryWebhookConflictError` is not exported.
- `app.test.ts`: startup never calls `ensureOrderStatusWebhook`.

## GREEN

`S3-2-d3-tdd-green.txt`: the same files pass after minimal implementation.

## AC to test map

| AC (spec delivery) | Test |
| --- | --- |
| Потерянный вебхук: created/in_transit > 2 мин опрашиваются, delivered применяется | `delivery.reconcile.db.test.ts`: "applies a delivered status..." |
| Fresh delivery, quoted/manual/delivered не опрашиваются | "does not poll fresh deliveries..." |
| Неизвестный статус: raw code + in_transit | "stores an unknown provider code..." |
| Не откатывать более поздний/равный статус, событие не дублируется | "ignores a lower-rank status...", second pass in the delivered test |
| Ошибка одной строки не блокирует остальные, лог без PII | "continues after a provider failure..." |
| Выборка по delivery, а не по user/shop; abort между строками | delivered test (two shops), "stops between rows..." |
| Одна подписка ORDER_STATUS; 2 чужих — ops-ошибка, третьей нет | `cdek-provider.test.ts`: conflict + matching tests |
| Startup проверяет подписку и не падает при конфликте | `app.test.ts`: wiring tests |
| Scheduler: один проход, stop ждёт in-flight | `delivery.reconcile.scheduler.test.ts` |
| Порог/интервал 60 с, батч 50 | constants in `delivery.reconcile.ts`; interval in scheduler |
