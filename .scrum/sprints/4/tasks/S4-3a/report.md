# Report: Task S4-3a — storefront copy to i18n catalog

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-3a` ·
> `change: No spec change: i18n refactor` ·
> links: [handoff](handoff.md) · [evidence](evidence/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md) ·
> [text review W2](../../../../reviews/text-site-audit.md) ·
> [S4-2 brief §5](../S4-2/brief.md)

## Итог для координатора (≤ 10 строк)

- Статус: **ready-for-review**. Storefront-копия в typed `ru.ts`; значения
  и поведение не менялись.
- Ветка `task/S4-3a-storefront-catalog` от `main@304e3d7`; code-коммит
  `aa9e5a3`, docs-коммит — этой папки.
- Code+tests: **576** (baseline excluded), ≤ 600; split не нужен.
- Baseline: **424 → 334** (−90, 0 added), deadKeys 0; в четырёх файлах
  0 findings.
- `pnpm verify` 0; `check:i18n` 0 (334); web **262**; e2e **13 passed**;
  axe **72 scans / 0** serious/critical.
- Bundle: **+4 777 B raw (+0.698%) / +478 B gzip (+0.249%)** — бюджет
  ADR 0004 (≤ +10%, ≤ +20 KiB gzip) пройден.
- e2e-локаторы не менялись; компоненты не трогались; W2-остаток,
  shared/SMS/index не мигрированы.
- Doc change: `No doc change: i18n refactor`.
- Evidence: [evidence/](evidence/).

## AC и evidence

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| `MarketplacePage` 64, `ShopPage` 12, `ProductPage` 11, `NotFoundPage` 3 → `ru.ts`; в файлах нет кириллицы | `check:i18n` per-file | pass: 0 remaining в каждом | [after](evidence/check-i18n-after.txt), [before](evidence/baseline-before.txt) |
| Ключи `marketplace.*`, `shop.*`, `product.*`, `common.notFound.*`; reuse `common.*`; typed/t | `typecheck`, `check:i18n` | pass: 346 keys, 341 production usages; dynamic `t()` нет | [verify](evidence/verify.txt) |
| Значения ровно как в main; тексты/статусы/ошибки не переписаны | values identity + characterization | pass: 88 literals exact, 2 templates interpolate to originals | [values](evidence/values-identity.txt) |
| Тесты/e2e: e2e 13, axe 72/0, `verify` 0, `check:i18n` 0, baseline −90/0, deadKeys 0 | команды | pass | [verify](evidence/verify.txt), [e2e](evidence/e2e.txt), [axe](evidence/axe-summary.txt), [prune](evidence/baseline-prune.txt) |
| W2-остаток (cart/auth/admin/dev), shared/SMS/index не тронуты | diff | pass: только 4 страницы + их тесты + `ru.ts` + baseline | [commit-size](evidence/commit-size.txt) |

## TDD / characterization

- T1 refactor без изменения поведения.
- До миграции: 252 web-теста зелёные на `304e3d7`; добавлены 10
  characterization-тестов (Marketplace 1, Product 4, Shop 4, NotFound 1) и
  прогнаны **зелёными до миграции**: 262/262.
- После миграции: 262/262, те же значения/локаторы.
- Evidence: [baseline 252](evidence/tdd-baseline-web.txt),
  [characterization before](evidence/tdd-characterization-before.txt),
  [characterization after](evidence/tdd-characterization-after.txt).

## Изменения

- `apps/web/src/pages/MarketplacePage.tsx` — `marketplace.*` (62 ключа),
  `common.retry`, `common.connectionError`; статические массивы
  категорий/шагов/сортировки строятся через литеральные `t()`.
- `apps/web/src/pages/ShopPage.tsx` — `shop.*` (9), `common.*`.
- `apps/web/src/pages/ProductPage.tsx` — `product.*` (7), `common.*`.
- `apps/web/src/pages/NotFoundPage.tsx` — `common.notFound.*` (3).
- `packages/i18n/src/resources/ru.ts` — **83** новых ключа:
  `marketplace.*` 62, `shop.*` 9, `product.*` 7, `common.notFound.*` 3,
  `common.connectionError`, `common.backToCatalog`.
- Тесты: `MarketplacePage.test.tsx`, `ProductPage.test.tsx` дополнены;
  новые `ShopPage.test.tsx`, `NotFoundPage.test.tsx`.
- `scripts/i18n-baseline.json` — prune 424 → 334 (−90, 0 added).
- E2E-локаторы и компоненты не менялись; `App.tsx`, cart/auth/admin/dev,
  shared labels/SMS, `index.html` не тронуты.

## Проверки

| Команда | Exit | Вывод (хвост) |
|---|---:|---|
| `pnpm verify` | 0 | web 262, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9; [log](evidence/verify.txt) |
| `pnpm check:i18n` | 0 | 334 findings / 375 occurrences, 35 allowlisted, deadKeys 0; [log](evidence/check-i18n-after.txt) |
| `pnpm --filter @localhand/web test` | 0 | 262 passed; [before](evidence/tdd-baseline-web.txt), [after](evidence/tdd-characterization-after.txt) |
| `pnpm test:e2e` | 0 | **13 passed**; [log](evidence/e2e.txt) |
| axe (4 specs, 72 scans) | 0 | **72 scans / 0** serious-critical; [summary](evidence/axe-summary.txt) |
| bundle base → after | — | +4 777 B raw / +478 B gzip; [delta](evidence/bundle-delta.txt) |
| `git show --numstat` | — | **576** code+tests, baseline excluded; [size](evidence/commit-size.txt) |

E2E — ручной гейт: отдельная БД `localhand_s43a`, API на `:3100`,
web dev на `:5273`, `PLAYWRIGHT_BASE_URL=http://localhost:5273`;
Vite proxy на `:3100` патчился временно и возвращён к `:3000` до коммита.
Lab LCP на dev — info (`lab-lcp-over-budget`), не gate.

## Bundle detail

- base `main@304e3d7`: 684 787 B raw / 191 946 B gzip
  (S4-2b2 evidence, #92).
- after S4-3a: 689 564 B raw / 192 424 B gzip.
- delta: +4 777 B raw (+0.698%) / +478 B gzip (+0.249%).
- ADR 0004 budget ≤ +10% / ≤ +20 KiB gzip — pass.

## Doc change и drift

- `No doc change: i18n refactor`; поведение не менялось, спеки не
  затронуты.
- Stale claims: none. W2-остаток (cart/auth/admin/dev) и S4-4
  (shared/SMS/index) в отчёте помечены как не входящие в S4-3a.
- Обещание тестов: ссылки в TDD/AC.

## Handoff

- Следующий шаг: merge S4-3a → S4-3b (W2 rest) / S4-4 (shared/SMS/index
  по отдельному брифу).
- Грабли: web `typecheck` читает `packages/i18n/dist` — перед ним нужен
  `pnpm --filter @localhand/i18n build` (root `pnpm verify` делает это
  сам). E2E требует отдельный API с fake providers и `WEB_ORIGIN`,
  совпадающий с base URL.
- PR — см. handoff/возврат координатору.

## Блокеры

- Нет.
