# S3-2-LOG — PII redaction in delivery reconcile logs

Tier T2. Ветка `task/S3-2-log-redaction`. Head до этого фикса:
`fcf96c5` (merge `e934ced`), база PR — `7bca728`.

## Дефект

`delivery.reconcile.ts` передавал `err: error` в pino. Pino сериализует
`message`/`stack`, поэтому ответ провайдера с ФИО, телефоном или адресом
попадал в логи. Source-audit #73 это не ловил.

Дополнительно source audit пропускал `code: error`: `code` входит в
allowlist ключей, а значение не проверялось. Мутация `code: error` в
`delivery.route.ts:48` / `shipment.route.ts:74` давала 11/11.

## Фикс

`apps/api/src/delivery/delivery.reconcile.ts`:

- `safeErrorForLog(error): { name; code? }`.
- `SAFE_ERROR_NAME` — 1..32 символа, начинает с латинской буквы.
- `SAFE_ERROR_CODE` — 1..64 символа, начинает с латинской буквы.
- Пробелы, запятые, `+`, `@`, кириллица и прочие символы, которыми можно
  передать ФИО/телефон/адрес, в allowlist не входят.
- `message`, `stack`, `body`, `cause` не копируются.
- Оба `err: error` заменены на `err: safeErrorForLog(error)`.
- Логика reconcile, статусы, `touchAttempt`, порядок строк не менялись.

## AC и тесты

`apps/api/src/delivery/delivery.log-redaction.test.ts` — 14 тестов.

| AC | Проверка |
|----|----------|
| Провайдер бросает `Error` с ФИО/телефоном/адресом | `pinoOutput()` сериализует `Error` как pino; PII нет |
| `err` только `name`/`code` | `{ name: "Error", code: "ECONNRESET" }`, ключи `["code","name"]` |
| Оба catch-места reconcile | provider error и row/transaction error дают безопасный `err` |
| Non-Error throw | `{ name: "UnknownError" }`, PII нет |
| `error.name = "Иван Тестов"` | `{ name: "UnknownError" }`, PII нет |
| `error.code = "[PII_PHONE]"` | `{ name: "Error" }` без `code`, PII нет |
| `error.cause = new Error(PII)` | `cause` не копируется, raw Error не логируется |
| `error.body = "[PII_ADDRESS]"` | `body` не копируется, PII нет |
| Границы allowlist | name 32 проходит, 33 → `UnknownError`; code 64 проходит, 65 → без `code` |
| Второй аргумент pino | `loggedPayloads()` включает payload и message; `pinoOutput()` сканирует оба |
| Вложенный raw Error | `rawErrorPaths()` рекурсивно ищет `Error`, включая `cause` |
| Source audit: значение любого ключа | `code: error`, `err`, `cause`, `new Error` запрещены, включая nested objects/arrays; self-test fixture `{ code: error }` |
| Source audit: `err:` | только `safeErrorForLog(error)` |
| Source audit: route `error.code` | явно разрешено только `error.code ?? "internal_error"`; `code: error` падает |

## RED

`S3-2-log-red.txt`:

- **Current RED** — base-реализация `7bca728` против текущего тестового
  файла, актуальные номера строк: 10 failed / 4 passed (14).
- **Historical RED** — commit `c20c634`, 3 теста, старые номера строк
  помечены как historical.
- Выводы обезличены: PII заменён на `[PII_*]`, абсолютные пути убраны.

```
$ pnpm --filter @localhand/api exec vitest run src/delivery/delivery.log-redaction.test.ts
 Test Files  1 failed (1)
      Tests  10 failed | 4 passed (14)
```

## Mutation RED

Все мутации прогнаны на текущем тестовом файле, затем исходники
восстановлены. Полные выводы — `S3-2-log-red.txt`.

| Мутация | RED |
|---------|-----|
| M1: `delivery.route.ts:48` → `code: error` | source audit: `delivery.route.ts expected [Array(1)] to deeply equal []`; route allowlist: `[ 'error' ]` vs `[ 'error.code ?? "internal_error"' ]`; 2 failed / 12 passed |
| M2: `shipment.route.ts:74` → `code: error` | то же для `shipment.route.ts`; 2 failed / 12 passed |
| M3: копировать `error.body` | `does not copy error.body`: `expected { name: 'Error', …(1) } to deeply equal { name: 'Error' }`; 1 failed / 13 passed |
| M4: копировать `error.cause` | `does not copy error.cause`: `expected { name: 'Error', …(1) } to deeply equal { name: 'Error' }`; 1 failed / 13 passed |
| M5: `SAFE_ERROR_NAME {0,31}` → `{0,32}` | bounds: 33-символьное имя проходит, `expected { Object (name) } to deeply equal { name: 'UnknownError' }`; 1 failed / 13 passed |
| M6: `SAFE_ERROR_CODE {0,63}` → `{0,64}` | bounds: 65-символьный code проходит, `expected { name: 'Error', …(1) } to deeply equal { name: 'Error' }`; 1 failed / 13 passed |

После восстановления — **14/14 green**.

## GREEN

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
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
      Tests  23 passed (23)
```

## REFACTOR

- Source audit вынесен в `sourceViolations()`: проверяет не только ключи,
  но и значения любого ключа, включая nested objects/arrays; self-test
  `{ code: error }` доказывает, что ложное пропускание закрыто.
- `error.code` разрешён только как property access; `code: error`
  отклоняется.
- `loggedPayloads` включает оба аргумента pino; `rawErrorPaths`
  рекурсивно ловит raw `Error`, включая `cause`.
- Allowlist разделён на `SAFE_ERROR_NAME` (32) и `SAFE_ERROR_CODE` (64),
  границы покрыты тестом и mutation RED.
- Поведение reconcile не менялось; 14/14 green.

## Остальные delivery-логи

`S3-2-log-grep.txt`: в production-файлах delivery нет raw `err`/`error`,
`code: error`, `new Error`-значений и shorthand. Route-логи используют
только `error.code`; scheduler — фиксированный `code`;
`delivery.route.ts:116` — строковый код quote-ошибки.

## Verify

```
$ DATABASE_URL=... DATABASE_URL_TEST=... JWT_SECRET=... OTP_SECRET=... pnpm verify
 EXIT: 0
 Public repo check: 586 tracked files, no secrets/PII patterns found
 shared: 12 files / 161 tests passed
 web:    25 files / 220 tests passed
 api:    42 files / 389 tests passed
 build:  web + api done
 openspec validate --all --strict: 9 passed, 0 failed
```

Счётчики на head до фикса (`fcf96c5` / merge `e934ced`): shared 161,
web 220, api 386, public 586; targeted 20; code+tests 425.
После этого фикса: api 389, targeted 23, code+tests 515. Полный вывод —
`S3-2-log-verify.txt`.

## Границы

- Изменены только `apps/api/src/delivery/delivery.reconcile.ts`, тест
  `apps/api/src/delivery/delivery.log-redaction.test.ts` и evidence
  `S3-2-log-*`.
- `web`, `shared`, схема, state, board, events, daily, `openspec/specs/`,
  `tasks.md` не менялись.
