# Handoff: Task S4-1 — i18n foundation

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-1` ·
> links: [brief](brief.md) · [report](report.md) ·
> [evidence](evidence/) · [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md)

## Что сделано

- `@localhand/i18n` (`packages/i18n`): единый плоский `ru`-каталог,
  typed `t`, plural `_one/_few/_many/_other`, `initI18n`/`createI18nInstance`,
  init `lng=ru`.
- Web: `react-i18next` подключён в `apps/web/src/i18n.ts`, импортируется
  из `main.tsx` и `src/test/setup.ts`; API не подключался (S4-4).
- Gate: `scripts/check-i18n.mjs` (TypeScript AST), allowlist
  `scripts/i18n-allowlist.json`, baseline `scripts/i18n-baseline.json`,
  `pnpm check:i18n` в `verify`; fixture-тест сканера и unit-тесты
  ключей.
- `pnpm verify` exit 0; baseline воспроизводим.

## Что осталось / следующий шаг

- S4-2: мигрировать W1-строки в `packages/i18n/src/resources/ru.ts`,
  затем `pnpm check:i18n:update` — baseline должен уменьшаться.
- S4-4: shared labels/SMS, строгий gate; `index.html` meta/title
  остаётся в allowlist (static HTML, причина записана).
- PR/review: ветка `task/S4-1-i18n-foundation`, commit `dd39687`.

## Грабли и правила

- TS 7 в репозитории — native preview: классического `ts.createSourceFile`
  нет, scanner использует `typescript/unstable/sync` snapshot. При
  обновлении TS проверить `scripts/check-i18n.mjs`.
- Baseline/allowlist — ручные данные. Новые строки не добавлять в
  baseline «чтобы зелёное»; baseline обновляется только при миграции,
  allowlist — только с причиной.
- `pnpm typecheck`/`test`/`dev` сначала собирают `@localhand/i18n`
  (dist нужен web); не убирать эти шаги.
- Сканер и миграция не трогали W1/W2 JSX и specs; `ru.ts` содержит
  только foundation-ключи (greeting, cart.item plural).

## Открытые треды

- Нет. Вопросы — в `#task-4-1` / `#spec`.
- Read-back получателя: подтвердить, что baseline-политика
  (new fail, stale допускается до `--update-baseline`) подходит для
  S4-2/S4-3.
