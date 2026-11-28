# Report: Task S4-1 — i18n foundation

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: scrum-worker` ·
> `sprint: 4` · `task: S4-1` · `change: No spec change: i18n refactor` ·
> links: [brief](brief.md) · [handoff](handoff.md) ·
> [evidence](evidence/) · [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md)

## Итог для координатора

- Статус: **done** — foundation и gate готовы; W1/W2 строки не мигрированы.
- Ветка: `task/S4-1-i18n-foundation`, commit `dd39687`
  (`feat(i18n): add typed ru catalog and cyrillic gate`), PR — по готовности
  ревью.
- Сделано: `@localhand/i18n` (typed flat ru catalog, `t`, plural), web
  `react-i18next` init, AST-сканер кириллицы/ключей, baseline,
  `pnpm check:i18n` в `verify`, allowlist с причинами.
- Проверки: `pnpm verify` exit 0; `packages/i18n` 4/4, web 221/221,
  shared 161/161, API 224 passed / 170 skipped, scanner 4/4,
  OpenSpec 9/9.
- Блокеры: нет. Внешние гейты (live-ключи/деплой) — не в S4-1.

## AC и evidence

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| `packages/i18n`: ru.ts, `t`, typed keys, plural, init `ru` | unit + typecheck | pass | [green-i18n-test](evidence/green-i18n-test.txt) |
| Web `react-i18next` init в `main.tsx`/test setup | web unit | pass | `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` |
| Scanner: кириллица, missing/dead, baseline | unit + probe | pass | [scanner-pass](evidence/scanner-pass.txt), [new violation fails](evidence/scanner-new-violation.txt) |
| `index.html` meta/title — allowlist с причиной | scan | pass | `scripts/i18n-allowlist.json` |
| Fixture `cyrillic.tsx` ловится; `pnpm verify` 0 | scanner unit + verify | pass | [green-scanner-test](evidence/green-scanner-test.txt), [verify](evidence/verify.txt) |
| ADR 0006; baseline воспроизводим | hash before/after | pass | [baseline-reproducible](evidence/baseline-reproducible.txt) |

## TDD

- RED: [red-i18n-test](evidence/red-i18n-test.txt) — `./index.js` ещё
  не существовал; [red-scanner-test](evidence/red-scanner-test.txt) —
  `check-i18n.mjs` ещё не существовал.
- GREEN: [green-i18n-test](evidence/green-i18n-test.txt) (init `ru`,
  interpolation, plural 1/2/5, typed-key отрицание) и
  [green-scanner-test](evidence/green-scanner-test.txt) (фикстура
  string/template/JSX attribute/JSX text, комментарий игнорируется,
  missing/dead и plural-группы).
- RED/GREEN для `t`/plural и scanner fixture соблюдён; код писался
  после падающих тестов.

## Baseline и scanner

- `scripts/check-i18n.mjs` — TypeScript AST через
  `typescript/unstable/sync` (TS 7 native API; классического
  `ts.createSourceFile` в пакете нет). Файлы `apps/web/src`,
  `apps/api/src`, `packages/shared/src`; тесты/e2e/stories исключены,
  комментарии не являются AST-узлами.
- `scripts/i18n-allowlist.json` — данные с причиной: seed,
  fake-CDEK payload, 2 fallback `statusName`, 3 static meta/title,
  2 foundation-ключа (test-only до S4-2). Пустой/устаревший allowlist
  не скрывает новые строки: сравнение по file+kind+text.
- `scripts/i18n-baseline.json` — 752 findings / 826 occurrences,
  0 dead keys, 0 missing keys; 35 allowlisted occurrences. Baseline —
  данные, не код; хеш воспроизводится после `--update-baseline`
  (`ec1d3983…`).
- Новые нарушения fail: probe-файл с `"Новая строка"` дал exit 1
  ([evidence](evidence/scanner-new-violation.txt)), после удаления —
  exit 0 ([evidence](evidence/scanner-pass.txt)).

## Изменения

- `packages/i18n`: package/tsconfigs, `resources/ru.ts`, `types.ts`,
  `index.ts`; `i18next@27.2.10`.
- Web: `apps/web/src/i18n.ts`, импорт в `main.tsx` и `src/test/setup.ts`,
  `react-i18next@18.0.3`, `@localhand/i18n` workspace.
- Root: `check:i18n`, `check:i18n:update`; `verify` дополнен шагом
  после `check:public`; `typecheck`/`test`/`dev` собирают i18n до
  потребителей.
- Lockfile обновлён; новых runtime-зависимостей кроме
  `i18next`/`react-i18next` нет.

## Проверки

| Команда | Exit | Хвост |
|---|---:|---|
| `pnpm verify` | 0 | web 221, shared 161, API 224/170 skipped, OpenSpec 9/9 |
| `pnpm check:i18n` | 0 | 752 baseline findings; passed |
| `pnpm check:i18n:update` | 0 | baseline hash не изменился |
| Scanner unit | 0 | 4/4 |
| `packages/i18n` unit | 0 | 4/4 |

## Границы

- W1/W2 UI-строки, shared labels/SMS, OpenSpec specs, state/board,
  `index.html` — не мигрировались; allowlist только зафиксировал
  текущее.
- PR scope: код+тесты ≈ 570 строк без baseline/allowlist/lockfile
  (baseline — данные, 136 KB; меньше лимита 600).
- Расхождение с оценкой ADR (405 web-фрагментов): сканер считает
  fingerprint по `file+kind+text` и occurrence-count; JSX-текст/строки
  дробятся иначе, поэтому baseline строже и будет уменьшаться по
  мере миграции W1/W2.

## Блокеры

- Нет для S4-1. Открытые внешние гейты (live YooKassa/CDEK, SMS,
  deploy) — вне задачи.
