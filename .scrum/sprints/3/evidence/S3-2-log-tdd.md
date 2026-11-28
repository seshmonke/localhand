# S3-2-LOG — PII redaction in delivery reconcile logs

Tier T2. Ветка `task/S3-2-log-redaction`, база `7bca728`.

## Дефект

`delivery.reconcile.ts:87,116` передавали `err: error` в pino. Pino
сериализует `message`/`stack`, поэтому ответ провайдера с ФИО, телефоном
или адресом попадал в логи. Source-audit #73 это не ловил.

## AC и тесты

| AC | RED-тест | Проверка |
|----|----------|----------|
| `getShipment` бросает `Error` с ФИО/телефоном/адресом → в логах нет PII | `apps/api/src/delivery/delivery.log-redaction.test.ts` | `pinoOutput()` сериализует `Error` как pino (`message`/`stack`), assert нет `Иван Тестов`, `[PII_PHONE]`, `Невский проспект, 1` |
| `err` содержит только `name`/`code` | тот же тест | `expect(err).toEqual({ name: "Error", code: "ECONNRESET" })`, ключи `["code","name"]`, нет `err.message`/`err.stack` |
| Оба catch-места reconcile | два `it`: ошибка провайдера (`delivery_reconcile_provider_error`) и ошибка строки (`delivery_reconcile_failed`, transaction бросает PII) | одинаковые assert на безопасный `err` |
| Non-Error throw | третий `it`: брошена строка с PII | `err: { name: "UnknownError" }`, PII нет |
| Поведение/статусы не меняются | первый `it` | после ошибки провайдера `touchAttempt` обновляет `updatedAt`, статус не применяется (`log.info` не вызван) |

## RED

```
$ pnpm --filter @localhand/api exec vitest run src/delivery/delivery.log-redaction.test.ts
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

Причина: `err: error` — `expect(...err).toEqual({name,code})` получает
`Error` с `message: "Иван Тестов, [PII_PHONE], Невский проспект, 1"`;
`pinoOutput` содержит PII. Полный вывод — `S3-2-log-red.txt`.

## Фикс

`apps/api/src/delivery/delivery.reconcile.ts`:

- `safeErrorForLog(error): { name; code? }` — `name` только из
  `[A-Za-z][A-Za-z0-9_.-]{0,63}`, иначе `"UnknownError"`; `code` только
  строковый и по тому же шаблону; `message`, `stack`, `body`, `cause` не
  копируются.
- Оба `err: error` заменены на `err: safeErrorForLog(error)`.
- Логика reconcile, статусы, `touchAttempt`, порядок строк не менялись.

## GREEN

```
$ pnpm --filter @localhand/api exec vitest run src/delivery/delivery.log-redaction.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Targeted

```
$ DATABASE_URL=...localhand_s3_2_log_test \
  DATABASE_URL_TEST=...localhand_s3_2_log_test \
  pnpm --filter @localhand/api exec vitest run \
    src/delivery/delivery.log-redaction.test.ts \
    src/delivery/delivery.reconcile.db.test.ts \
    src/delivery/delivery.reconcile.edge.db.test.ts
 Test Files  3 passed (3)
      Tests  12 passed (12)
```

## Остальные delivery-логи

`S3-2-log-grep.txt`: raw `err`/`error` в delivery больше нет.
`delivery.route.ts`/`shipment.route.ts` логируют только `error.code`,
`delivery.reconcile.scheduler.ts` — только фиксированный `code`,
`delivery.route.ts:116` — строковый код quote-ошибки, не объект ошибки.

## Verify

```
$ DATABASE_URL=... DATABASE_URL_TEST=... JWT_SECRET=... OTP_SECRET=... pnpm verify
 EXIT: 0
 shared: 12 files / 160 tests passed
 web:    25 files / 212 tests passed
 api:    42 files / 378 tests passed
 build:  web + api done
 openspec validate --all --strict: 9 passed, 0 failed
```

Полный вывод — `S3-2-log-verify.txt`. Первые прогоны verify падали
только на таймаутах web-тестов при load average 38 (параллельный прогон
другого worktree); отдельные `pnpm --filter @localhand/web test` и
повторный `pnpm verify` на свободной машине — exit 0.

## Границы

- Изменены только `apps/api/src/delivery/delivery.reconcile.ts` и новый
  тест `apps/api/src/delivery/delivery.log-redaction.test.ts`.
- `web`, `shared`, схема, state, board, events, daily, `openspec/specs/`,
  `tasks.md` не менялись.
