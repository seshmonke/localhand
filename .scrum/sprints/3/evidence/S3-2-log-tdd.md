# S3-2-LOG — PII redaction in delivery reconcile logs

Tier T2. Ветка `task/S3-2-log-redaction`, база `7bca728`, head после
merge `main` — `131ac2c` + этот коммит.

## Дефект

`delivery.reconcile.ts` передавал `err: error` в pino. Pino сериализует
`message`/`stack`, поэтому ответ провайдера с ФИО, телефоном или адресом
попадал в логи. Source-audit #73 это не ловил.

## Фикс

`apps/api/src/delivery/delivery.reconcile.ts`:

- `safeErrorForLog(error): { name; code? }`.
- `SAFE_ERROR_NAME` — 1..32 символа, начинает с латинской буквы:
  `Error`, `CdekApiError`.
- `SAFE_ERROR_CODE` — 1..64 символа, начинает с латинской буквы:
  `ECONNRESET`, `ERR_CDEK_TIMEOUT`. Ограничение длины задокументировано в
  коде.
- Пробелы, запятые, `+`, `@`, кириллица и прочие символы, которыми можно
  передать ФИО/телефон/адрес, в allowlist не входят.
- `message`, `stack`, `body`, `cause` не копируются.
- Оба `err: error` заменены на `err: safeErrorForLog(error)`
  (`delivery_reconcile_failed`, `delivery_reconcile_provider_error`).
- Логика reconcile, статусы, `touchAttempt`, порядок строк не менялись.

## AC и тесты

`apps/api/src/delivery/delivery.log-redaction.test.ts` — 11 тестов.

| AC | Проверка |
|----|----------|
| Провайдер бросает `Error` с ФИО/телефоном/адресом | `pinoOutput()` сериализует `Error` как pino (`message`/`stack`); PII нет |
| `err` только `name`/`code` | `{ name: "Error", code: "ECONNRESET" }`, ключи `["code","name"]` |
| Оба catch-места reconcile | provider error и row/transaction error дают одинаково безопасный `err` |
| Non-Error throw | `{ name: "UnknownError" }`, PII нет |
| `error.name = "Иван Тестов"` | `{ name: "UnknownError" }`, PII нет |
| `error.code = "[PII_PHONE]"` | `{ name: "Error" }` без `code`, PII нет |
| `error.cause = new Error(PII)` | `cause` не копируется, raw Error не логируется |
| Аудит второго аргумента pino | `loggedPayloads()` включает payload и message; `pinoOutput()` сканирует оба |
| Вложенный raw Error | `rawErrorPaths()` рекурсивно ищет `Error` в payload, включая `cause` |
| Source audit | в production-файлах delivery нет `err: error`, `error: err`, `log.error(error)`, `{ error }`, `{ err }`, `{ cause }`; ключи payload в allowlist; `err:` только `safeErrorForLog(error)` |

## RED

RED-вывод обезличен: телефон заменён на `[PII_PHONE]`, абсолютные
локальные пути убраны. Полный вывод — `S3-2-log-red.txt`.

```
$ pnpm --filter @localhand/api exec vitest run src/delivery/delivery.log-redaction.test.ts
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

Причина: `err: error` — `err` равен `Error` с
`message: "Иван Тестов, [PII_PHONE], Невский проспект, 1"`.

## Mutation RED (доказательство allowlist)

`S3-2-log-red.txt`, секции Mutation A/B:

| Мутация | Результат |
|---------|-----------|
| Убрать `SAFE_ERROR_NAME.test(error.name)` | падает `falls back to UnknownError when error.name looks like PII`: `expected { name: 'Иван Тестов' } to deeply equal { name: 'UnknownError' }`; 1 failed / 10 passed |
| Убрать `SAFE_ERROR_CODE.test(rawCode)` | падает `drops an unsafe error.code instead of logging it`: `expected { name: 'Error', code: '...' } to deeply equal { name: 'Error' }`; 1 failed / 10 passed |

После мутаций обе проверки восстановлены, файл снова зелёный 11/11.

## GREEN

```
 Test Files  1 passed (1)
      Tests  11 passed (11)
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
      Tests  20 passed (20)
```

## REFACTOR

- `safeErrorForLog` вынесен отдельно; allowlist разделён на
  `SAFE_ERROR_NAME` (32) и `SAFE_ERROR_CODE` (64) с контрактом в
  комментарии.
- `loggedPayloads` теперь включает оба аргумента pino (payload + message),
  `rawErrorPaths` рекурсивно ловит raw `Error`, включая `cause`.
- Добавлен source audit: raw `err`/`error` пары, `log.error(error)`,
  shorthand `{ error }`/`{ err }`/`{ cause }`, allowlist ключей payload.
- Route `error.code` — pre-existing machine code, не объект ошибки:
  зафиксирован allowlist в source audit (комментарий в тесте).
- Поведение reconcile не менялось; 11/11 green.

## Остальные delivery-логи

`S3-2-log-grep.txt`: в production-файлах delivery нет raw `err`/`error`,
`log.error(error)` и shorthand. `delivery.route.ts`/`shipment.route.ts`
логируют только `error.code`; scheduler — фиксированный `code`;
`delivery.route.ts:116` — строковый код quote-ошибки, не объект ошибки.

## Verify

```
$ DATABASE_URL=... DATABASE_URL_TEST=... JWT_SECRET=... OTP_SECRET=... pnpm verify
 EXIT: 0
 Public repo check: 578 tracked files, no secrets/PII patterns found
 shared: 12 files / 160 tests passed
 web:    25 files / 220 tests passed
 api:    42 files / 386 tests passed
 build:  web + api done
 openspec validate --all --strict: 9 passed, 0 failed
```

Счётчики на базе `7bca728`: shared 160, web 212, api 378, public 567.
На текущем head: shared 160, web 220, api 386, public 578. Полный вывод —
`S3-2-log-verify.txt`.

## Границы

- Изменены только `apps/api/src/delivery/delivery.reconcile.ts`, тест
  `apps/api/src/delivery/delivery.log-redaction.test.ts` и evidence
  `S3-2-log-*`.
- `web`, `shared`, схема, state, board, events, daily, `openspec/specs/`,
  `tasks.md` не менялись.
