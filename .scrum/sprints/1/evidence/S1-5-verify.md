# Evidence: S1-5 security, e2e, docs

Дата: 27.11.2026. Ветка `task/S1-5-security-archive`, review/final
HEAD `dd447a9`, merge — close-PR. Change `02-seller-onboarding`, tasks
5.1–5.4; 5.5 (archive) — close-PR.

## Verify

Команда (секреты — тестовые, не прод):

```bash
export PATH="$HOME/.local/bin:$PATH"
DATABASE_URL_TEST='postgres://localhand:localhand@localhost:5433/localhand_s1_3_test' \
JWT_SECRET='review-jwt-secret-that-is-long-enough-123456' \
OTP_SECRET='review-otp-secret-that-is-long-enough-123456' \
pnpm verify
```

Exit code: `0`.

Хвост вывода:

```text
Public repo check: 231 tracked files, no secrets/PII patterns found
packages/shared test:  Test Files  4 passed (4)
packages/shared test:       Tests  33 passed (33)
apps/web test:         Test Files  7 passed (7)
apps/web test:              Tests  35 passed (35)
apps/api test:         Test Files 12 passed (12)
apps/api test:              Tests 102 passed (102)
build: shared/ui/api/web — Done
openspec validate --all --strict
✓ change/02-seller-onboarding
✓ spec/storefront
Totals: 2 passed, 0 failed (2 items)
```

Лог снят до добавления evidence/screenshots; на финальном дереве
(`dd447a9`, 235 tracked files) `check:public` и `pnpm verify` — exit 0.

## E2E (5.1)

`apps/api/src/e2e/seller-flow.db.test.ts`, real DB:
dev OTP → `lh_session` → shop draft → publish → product draft →
publish → `/catalog/products`, `/shops/:slug`, `/products/:id`;
второй продавец: чужой product 404, данные не изменились; без сессии
401 на всех защищённых ручках.

- 3/3 e2e, API suite 102/102 (3 прогона подряд).
- CI задаёт `DATABASE_URL_TEST`; e2e fail-fast в CI без переменной и
  guard на имя БД `_test` перед migrate/truncate.

## Log privacy (5.2)

- 500 на `/auth/request-code` логирует только `{ code }`; телефон и код
  не попадают (route-тест + source-аудит auth-логов).
- Существующие 401/404/429 и rate-limit тесты зелёные.

## Browser smoke (5.4)

Сценарий: `/login` dev-OTP → shop → publish → product → publish →
`/shops/:slug` → `/products/:id`.

- 1440 и 320: товар виден, 320 без overflow.
- Найден и исправлен P1: в `ProductCard` имя/цена перекрывались на 320;
  теперь цена под именем на mobile, строка на `sm+`.
- Скриншоты:
  - [storefront 1440](S1-5-storefront-1440.png)
  - [storefront 320](S1-5-storefront-320.png)
  - [product 1440](S1-5-product-1440.png)

## Docs (5.3)

- `docs/stack/adr/0002-phone-auth.md`: OTP/HMAC/TTL/attempts, JWT-cookie,
  rate-limit, TRUST_PROXY, SMS.ru/dev, ПДн, CSRF, stateless logout,
  альтернативы, последствия, источники.
- `docs/legal/context.md`: раздел реализации auth v1 со ссылкой на ADR.
- `docs/stack/README.md`: ADR 0002 в индексе.

## Review

- Независимый `scrum-reviewer`: **APPROVE** по e2e/logs/ADR/legal.
- P3: ADR 401/500 и SMS `test=1` уточнены; e2e DB guard добавлен;
  scope ProductCard зафиксирован в брифе.
- P2 evidence — этот файл; archive — close-PR.

## Остаточные P3

- Stateless logout, in-memory rate-limit, OTP cleanup/retention,
  access-log IP, SMS captcha/`ip`, source-audit heuristic, e2e skip
  без env (guard только CI), per-SMS статус SMS.ru, PR size.

## Rollback

Revert squash-коммита; миграций нет. Archive change откатывается
возвратом каталога change из архива.
