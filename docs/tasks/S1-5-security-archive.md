# Task S1-5: Security, evidence, docs, archive

## Цель

Доказать главный сценарий сквозным API e2e, закрыть authz/rate-limit/
log-проверки, зафиксировать auth/ПДн и SMS-провайдера в ADR/legal,
записать evidence. Архив change — отдельным close-PR после merge.

## AC

- [ ] 5.1 API e2e на реальной БД: dev OTP → verify → shop draft →
  product draft → publish shop/product → товар в `/catalog/products`,
  `/shops/:slug`, `/products/:id`; второй продавец не меняет чужой
  shop/product; без сессии 401.
- [ ] 5.2 Authz/rate-limit/logs: существующие 401/404/429 и лимиты
  проходят; добавить тест, что 500 auth-пути логирует только код, без
  телефона/кода; source-аудит логов без phone/code.
- [ ] 5.3 Docs: `docs/stack/adr/0002-phone-auth.md` (OTP, JWT-cookie,
  rate-limit, TRUST_PROXY, SMS.ru/dev, ПДн); обновить
  `docs/legal/context.md` разделом реализации auth v1.
- [ ] 5.4 Evidence: `pnpm verify`, `openspec validate --all --strict`,
  e2e output, browser-smoke полного пути (login → shop → product →
  publish → storefront) + скриншоты; записать
  `.scrum/sprints/1/evidence/S1-5-verify.md`.
- [ ] 5.5 Archive: после merge — `openspec archive
  02-seller-onboarding -y`, specs обновлены, tasks 5.x отмечены,
  sprint review/retro, Sprint 1 закрыт. Делает orchestrator в close-PR.

## Change

`openspec/changes/02-seller-onboarding`, tasks 5.1–5.5. Спеки:
`phone-auth`, `seller-shop`, `product-management`; design/proposal.

## owns

- `apps/api/src/e2e/seller-flow.db.test.ts` (новый)
- `apps/api/src/auth/auth.route.test.ts` (log-тест)
- `docs/stack/adr/0002-phone-auth.md` (новый)
- `docs/legal/context.md` (раздел реализации)
- `docs/stack/README.md` (ссылка на ADR 0002)
- `apps/web/src/components/ProductCard.tsx` — P1 gate fix из
  browser-smoke S1-5: на 320 имя и цена перекрывались.
- `apps/web/src/components/ProductCard.test.tsx` — smoke-тест карточки
  с длинным именем (P1 gate fix).
- `docs/stack/hosting.md` / `.env.example` — только если нужно
  синхронизировать SMS/TRUST_PROXY

Не трогать: остальной `apps/web/**` (кроме ProductCard и её теста),
`packages/shared/**`, `packages/ui/**`, `openspec/**` (archive —
orchestrator), `.scrum/**`, `docs/tasks/01-*`. Новых зависимостей нет.

## Контракты e2e

- `buildApp()` + `fastify.inject`; реальная БД из `DATABASE_URL_TEST`;
  перед dynamic import выставить `process.env.DATABASE_URL`; migrate;
  truncate `products, shops, sellers, users, otp_codes` перед каждым.
- `POST /auth/request-code` → `{ ok, devCode }` (dev provider);
  `POST /auth/verify-code` → `{ user }` + `Set-Cookie lh_session`.
- Cookie парсить из `set-cookie`; запросы с `headers.cookie`.
- Телефоны — только вымышленные, собирать через `phone("+7","999",...)`,
  чтобы public-scan не ловил.
- Второй продавец: свой shop; PATCH первого shop/product не должен
  менять данные первого (404/свой scope); сравнить БД/GET.
- Публичные GET без cookie.

## Docs

ADR 0002: контекст, решения, альтернативы, последствия, источники.
Зафиксировать:
- OTP 6 цифр, HMAC-SHA256 `OTP_SECRET`, TTL 5 мин, 5 попыток,
  consumedAt; хранится только хеш.
- JWT HS256 в httpOnly `lh_session`, SameSite=Lax, Secure prod, 7 дней;
  stateless logout/revocation — принятый trade-off.
- Rate-limit: request 5/мин phone + 20/мин IP; verify 10/мин IP+phone.
- `TRUST_PROXY` только explicit Caddy IP/CIDR; production без него не
  стартует.
- SMS: dev только non-prod; production с dev падает; SMS.ru adapter по
  `SMSRU_API_ID`; ключ перед прод-релизом.
- ПДн: телефон в users, OTP только хеш; телефон/код не логируются;
  generic 401; retention/cleanup — P3.
Legal: короткий раздел «Реализация v1» со ссылкой на ADR, без дублей.

## Non-goals

- Реальный SMS/прод-ключ, ЮKassa, СДЭК, buyer-flow.
- Playwright CI-гейт, axe CI, archive в этом PR (close-PR/S1-5b).
- Новые зависимости.

## Evidence

- Worker: команды, exit code, хвост, SHA, e2e сценарий.
- Orchestrator: `.scrum/sprints/1/evidence/S1-5-verify.md` + скриншоты.

## Границы

- Работать только в task worktree ветки
  `task/S1-5-security-archive`.
- Коммитить в ветку; не пушить, не мержить, не менять main.
- При дыре в спеке — стоп, вопрос оркестратору.
