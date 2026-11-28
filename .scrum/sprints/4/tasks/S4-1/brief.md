# Brief: Task S4-1 — i18n foundation

> **Context:** `status: active` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-1` · `change: No spec change: i18n refactor` ·
> links: [sprint](../../sprint.md) · [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md) ·
> [text review](../../../../../docs/tasks/text-review.md) ·
> [board](../../../../board.json)

## 1. Objective

Один typed i18next-каталог `packages/i18n` и 100% gate-сканер, готовый к
миграции W1/W2. Строки ещё не мигрируем; baseline фиксирует текущие.

## 2. AC

- [ ] `packages/i18n` (`@localhand/i18n`): `resources/ru.ts`, `t`,
  typed keys, plural `ru`, init `lng=ru`.
- [ ] Web: `react-i18next`, init в `main.tsx` и test setup.
- [ ] `scripts/check-i18n.mjs`: кириллица вне каталога, missing/dead keys;
  baseline; `pnpm check:i18n` в `verify`.
- [ ] `apps/web/index.html` meta/title — allowlist с причиной.
- [ ] Unit: `t` interpolation/plural; scanner fixture file (Cyrillic) fails;
  `pnpm verify` 0.
- [ ] ADR 0006; baseline воспроизводим.

## 3. Tier и change

- Tier T1 (refactor, no behavior). `No spec change: i18n refactor`.
- ADR 0006.

## 4. owns

- `packages/i18n/**`
- `apps/web/src/i18n.ts`, `main.tsx`, test setup
- `apps/web/package.json`, `apps/api/package.json` (только зависимость,
  если нужно)
- `scripts/check-i18n.mjs`, `scripts/i18n-baseline.json`,
  `scripts/fixtures/i18n/**`
- `apps/web/index.html` (allowlist)
- root `package.json` (`check:i18n`, `verify`)
- `pnpm-lock.yaml`
- `docs/stack/adr/0006-i18n.md`
- W1/W2 строки не мигрировать.

Не трогать: UI-тексты, OpenSpec specs, `.scrum` state/board.

## 5. Контракты

- `t("surface.key", { count })`; ключи плоские, `ru` only.
- Plural: `_one/_few/_many`; `Intl` для дат/денег.
- Scanner: TypeScript AST (`typescript` уже devDependency); ignore tests,
  comments, seed/provider payload, `index.html` allowlist.

## 6. Non-goals

- W1/W2 migration, shared labels/SMS (S4-2–S4-4).
- Вторая локаль/switcher.
- Новые UI-фичи.

## 7. Output format

- `report.md`, `handoff.md`, `evidence/`; PR <600 code+tests.
- `pnpm verify` + `check:i18n`; evidence baseline.

## 8. Tools/sources

- `pnpm add`, `pnpm verify`, `openspec validate`.
- Read: ADR 0006, `docs/design/content.md`, `text-review.md`.

## 9. Evidence contract

- TDD: RED/GREEN для `t`/scanner fixture; baseline generated. Fixture —
  production-like file вне tests, scanner его ловит.
- `pnpm check:i18n` passes with baseline; new test string fails.
- No behavior/UI text changes.

## 10. Stop conditions

- Нужна миграция строк/новый dependency beyond i18next/react-i18next.
- Baseline/allowlist не воспроизводим.
- 3 неудачи.

## 11. Границы

- Только owns; не мержить; не менять specs/state.
- Live/PDn/Ozon — нет.

## 12. Read-back

«Понял: i18n foundation + gate. Делаю: packages/i18n, init, scanner,
baseline. Не трогаю: W1/W2 тексты, specs, state.»
