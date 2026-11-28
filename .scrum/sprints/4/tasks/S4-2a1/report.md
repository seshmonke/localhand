# Report: Task S4-2a1 — checkout/shared W1 copy

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: scrum-worker` · `sprint: 4` · `task: S4-2a1` ·
> `change: No spec change: i18n refactor` ·
> links: [handoff](handoff.md) · [evidence](evidence/) ·
> [ADR 0006](../../../../../docs/stack/adr/0006-i18n.md) ·
> [text review W1](../../../../../.scrum/reviews/text-site-audit.md)

## Итог для координатора (≤ 10 строк)

- Статус: **ready-for-review**. Первый PR split S4-2a: checkout/shared
  W1 copy, без payment/order.
- Ветка `task/S4-2a1-checkout-catalog` от `main@6773120`; code-коммит
  `587cb26`, docs-коммит — этой папки.
- Code+tests: **320** (baseline excluded), ≤ 600.
- Baseline: **752 → 685** (−67), deadKeys 0; 261 W1 findings остаются
  на A2 (102) и S4-2b (159).
- `pnpm verify` 0; `pnpm check:i18n` 0; `pnpm test:e2e` **13/13**,
  axe 0 serious/critical; web 232.
- Значения не менялись: тесты/локаторы e2e без изменений.
- W2/shared labels/SMS/index не мигрированы.
- Evidence: [evidence/](evidence/).
- Doc change: `No doc change: i18n refactor`.

## AC и evidence (A1 scope)

| AC | Проверка | Результат | Ссылка |
|---|---|---|---|
| Checkout/shared W1-строки в `ru.ts` | baseline по A1-файлам | pass: `CheckoutPage` 56, `ScreenState` 4, `SessionExpiredState` 4, `item-count` 3 | [after](evidence/baseline-after.txt) |
| `t`/`useTranslation`, typed keys | `pnpm typecheck`, `check:i18n` | pass; dynamic `t()` нет | [verify](evidence/verify.txt) |
| Значения = PR #83 | прежние тесты и e2e-локаторы | pass; 232 web, 13 e2e | [e2e](evidence/e2e.txt) |
| Тесты/e2e/axe; baseline prune | verify + e2e | pass; 752 → 685 | [verify](evidence/verify.txt) |
| `pnpm verify` 0; `pnpm check:i18n` 0 | команды | pass, exit 0 | [verify](evidence/verify.txt), [check](evidence/check-i18n-after.txt) |
| W2/shared/SMS не мигрированы | diff | pass; W2-файлы не тронуты | [commit-size](evidence/commit-size.txt) |

`ScreenState`, `SessionExpiredState`, `cart/item-count.ts` — W1-строки по
аудиту и разрешены брифом S4-2 (§4). W2-страницы лишь получают те же
значения из общего компонента/функции; их собственные строки не
мигрированы.

## TDD / ATDD

- T1 refactor без изменения поведения: characterization-тесты на ключи
  без покрытия.
- До миграции: 221 web-тест зелёный на `6773120`.
- Characterization A1 (ScreenState 4 + `pluralizeItems` 9): **13/13
  зелёные до миграции** на базовом коммите.
- После миграции: 232/232 (221 + 11 новых A1-тестов).
- Evidence: [baseline 221](evidence/tdd-baseline-web-221.txt),
  [characterization 13 before](evidence/tdd-characterization-before.txt).

## Изменения

- `apps/web/src/pages/CheckoutPage.tsx` — `checkout.*`,
  checkout/quote errors, `common.retry`; `COMMENT_HINT` заменён
  ключом.
- `apps/web/src/components/ScreenState.tsx` — `common.state.*`.
- `apps/web/src/components/admin/SessionExpiredState.tsx` —
  `common.sessionExpired.*`.
- `apps/web/src/cart/item-count.ts` — `t("cart.item", { count })`;
  `${count} товар/товара/товаров` сохранён.
- Тесты: `CheckoutPage.test.tsx`, `ScreenState.test.tsx`, новый
  `item-count.test.ts`.
- `packages/i18n/src/resources/ru.ts` — 67 common/checkout keys.
- `scripts/i18n-baseline.json` — prune 752 → 685.

Контракты: плоские ключи, `keySeparator: false`, plural i18next,
`TFunction = ReturnType<typeof useTranslation>["t"]`. Зависимости,
схема, миграции не менялись.

## Проверки

| Команда | Exit | Вывод (хвост) |
|---|---:|---|
| `pnpm verify` | 0 | web 232, i18n 4, shared 161, API 224/170 skipped, OpenSpec 9/9; [log](evidence/verify.txt) |
| `pnpm check:i18n` | 0 | 685 findings / 751 occurrences, 35 allowlisted; [log](evidence/check-i18n-after.txt) |
| `pnpm test:e2e` | 0 | **13 passed**, axe 0 serious/critical; [log](evidence/e2e.txt) |
| `git show --numstat 587cb26` | — | **320** code+tests, baseline excluded; [size](evidence/commit-size.txt) |

E2E — ручной гейт: собственный dev-стек API :3100 (fake
payments/delivery, `WEB_ORIGIN=http://localhost:5273`) + web :5273;
Vite proxy на :3100 патчился временно и возвращён к `:3000` до
коммита. Lab LCP на dev — info (`lab-lcp-over-budget`), не gate.

## Doc change и drift

- `No doc change: i18n refactor`; ADR 0006 и план спринта актуальны.
- Stale claims: none; bundle +3.47 KiB gzip (+1.85%), budget ADR 0004.
- Обещание теста: ссылки в TDD/AC.
- Будущее как текущее: A2/S4-2b в отчёте помечены как не входящие в A1.

## Handoff

- Следующий шаг: merge A1 → PR A2 (`fec82de`, payment/order), затем
  S4-2b.
- Грабли: e2e требует свой API с fake providers и `WEB_ORIGIN`,
  совпадающий с base URL; порты 3000/5173 могут быть заняты.
- Открытые треды: `#task-4`.
- PR #89 открыт; review APPROVE; P2 brief/status закрыты.

## Блокеры

- Нет.
