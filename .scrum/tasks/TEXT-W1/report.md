# Text Review W1 — report

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: Copywriter` · `task: Text Review W1` ·
> `change: No spec change: copy only` · `tier: T0` · branch
> `task/text-review-w1` · base `main@041cfa0` · PR
> [#83](https://github.com/seshmonke/localhand/pull/83).
> links: [audit](../../reviews/text-site-audit.md) ·
> [voice/glossary](../../../docs/design/content.md) ·
> [program](../../../docs/tasks/text-review.md).

## Статус

W1 готов к повторному ревью: REQUEST_CHANGES по PR #83 закрыт. Правки —
e2e-локаторы, money-строка, ссылки/счётчики/статус и P3. Поведение, коды,
authz, API-контракты и смысл статусов не менялись. W2/W3 не
редактировались.

## Что сделано

Аудит всех production-текстов сайта:
[`.scrum/reviews/text-site-audit.md`](../../reviews/text-site-audit.md).

- 33 production-файла `apps/web/src/**` + `apps/web/index.html`.
- 399 уникальных литералов с кириллицей в 28 файлах (ещё 5 файлов дают
  только JSX/шаблоны; всего 33 файла с кириллицей) + 3 значения в
  `index.html` = 402 литерала; с 3 шаблонами `pluralizeItems` — 405
  учтённых фрагментов (W1 — 187, W2 — 218, W3 — 0). Команда счётчика —
  в аудите §1.1.
- Таблица по каждой поверхности: файл, строка/место, проблема,
  предложение, волна.
- 10 системных проблем: roadmap-обещания в UI, неподтверждённые claims,
  status mismatch, технический язык, один термин на экран, канцелярит,
  системные ошибки, «возможно», dev/demo-артефакты, дубли.

Правки W1 (32 фрагмента в 6 production-файлах):

| Файл | Что изменено |
|---|---|
| `apps/web/src/pages/CheckoutPage.tsx` | убраны «сервер», «уникальных», «посылка», «на который вы вошли», «статус заказа покажет»; «заявку» → «заказ»; `delivery_required` и quote error стали действием; недоступная корзина объясняет, что убрать |
| `apps/web/src/pages/OrderPage.tsx` | «Оплата не подключена» → «Оплата ещё не начата» для неначатого платежа; money-строка сохраняет механизм идемпотентности («тот же ключ»); убрано обещание «несколько секунд»; статус canceled/failed не дублируется в теле; 404 не врёт про удаление заказа |
| `apps/web/src/pages/OrdersPage.tsx` | «заявки» → «заказы»; «по указанному телефону» → «с вами»; emptyLabel «Оплата не начата» |
| `apps/web/src/pages/AdminOrderPage.tsx` | точка с запятой → точка; «передача вещи» → «передача товара»; 404 без «удалён» |
| `apps/web/src/pages/AdminOrdersPage.tsx` | «заявки» → «заказы»; статус оплаты «показан отдельно»; без магазина — прямой порядок действий |
| `apps/web/src/components/admin/AdminDeliveryCard.tsx` | тариф и ручной трек — короткие предложения; «Трек-номер» → «Трек»; пассив → действие |
| `apps/web/src/components/admin/SellerPaymentsCard.tsx` | просмотрен, правок не требует |

Тесты обновлены под новые строки: unit — `CheckoutPage.test.tsx`,
`OrderPage.test.tsx` (+ assert на money-строку), `OrdersPage.test.tsx`
(переименован устаревший тест), `AdminDeliveryCard.test.tsx`; e2e —
`buyer-flow.spec.ts`, `payments-flow.spec.ts`, `delivery-flow.spec.ts`.
Ослабления проверок нет: изменены ожидаемые тексты, один селектор
`/вручную/` → конкретная фраза, `getByLabel("Трек", { exact: true })`
после смены label.

## Проверки

| Команда | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @localhand/web test` | 0 | `evidence/web-test.txt` (25 files, 220 tests) |
| `pnpm test:e2e` (dev 5173, fake delivery/payments) | 0 | `evidence/e2e.txt` (13 passed) |
| `pnpm verify` | 0 | `evidence/verify.txt` (typecheck, lint, format, check:public, tests, build, openspec 9/9) |
| `slop-check` W1 files после правок | 1 (только `PUNCT` на код) | `evidence/slop-check-after.txt` (exit code внутри) |
| `slop-check` W1 files baseline | 1 | `evidence/slop-check-baseline.txt` |
| axe (в составе e2e) | 0 | `evidence/axe-buyer-pages.json`, `axe-delivery-pages.json`, `axe-payment-pages.json`, `axe-admin-pages.json` (serious/critical = 0) |
| link-check audit/report/handoff/README | 0 | `evidence/link-check.txt` (29 links, 0 broken) |

Baseline: единственный лексический хит — `CheckoutPage.tsx` «уникальных»
(чёрный список). После правок лексических хитов 0. `PUNCT` — ложные
срабатывания скрипта на TSX-код (`!`, `!==`, non-null assertion);
пользовательских восклицательных знаков нет.

Первый прогон `pnpm verify` после `pnpm install` дал 8 таймаутов
jsdom-тестов (5 с) при параллельном запуске api+web; повторный прогон на
той же машине — exit 0, отдельный `pnpm --filter @localhand/web test` —
exit 0. Таймауты не связаны с изменёнными строками (падали и
`MarketplacePage`, `LoginPage`, `AdminProductFormPage`).

## Diff

- code+tests: 69 добавлено / 61 удалено = 130 изменённых строк в 13
  файлах (6 production + 7 тестов), без evidence и аудита. Лимит 600 не
  превышен, split не нужен.
- Новых зависимостей нет.

## W2 (следующий PR, не редактировалось)

1. `index.html` — meta/og.
2. `MarketplacePage` — «Маркетплейс нового типа», «Города РФ — Все»,
   «Без комиссии с продаж», шаги, demo-ссылка.
3. `ShopPage`, `ProductPage` — «вещь», «возможно», устаревшее
   «Оплата и доставка появятся в следующем change».
4. `CartPage`, `AddToCartButton`, `CartContext` — «цену и наличие
   подтвердит продавец», «Оформить».
5. `LoginPage` — «Дев-режим», «Код из SMS», «Товары появятся в следующем
   обновлении кабинета», «в один клик».
6. `NotFoundPage`.
7. `AdminShopPage` — «slug», противоречие «изменить позже» / «ломает
   ссылки», «город сдачи», «посылки».
8. `AdminProductsPage`, `AdminProductFormPage` — «внутри магазина»,
   roadmap про загрузку файлов, «Слишком большая цена».
9. `ProductFormFields`, `ProductStatusBadge`, `ProductTable`,
   `ProductCards`, `product-form`, `product-errors` — подсказки и
   validation.
10. `AdminShell`, `AdminGuard`, `App` — дублирующий session guard,
    системные ошибки.

## W3

Публичные и процессные docs (`AGENTS.md`, `docs/**`, README), OpenSpec
read-only. В этом PR не трогались.

## Доставка

PR [#83](https://github.com/seshmonke/localhand/pull/83), base
`main@041cfa0`, branch `task/text-review-w1`. Этот коммит закрывает
REQUEST_CHANGES ревью `.scrum/reviews/83-text-review-w1.md`. Force push
не использовался.

## Риски и остатки

- Ценовые/юридические claims («без комиссии», «мгновенная ссылка»,
  «города РФ — все») требуют владельца/юриста; Copywriter их не
  утверждает.
- W1 residual: fallback «Оплаченный тариф: тариф заказа» в
  `AdminDeliveryCard` может дублироваться, если название тарифа не
  найдено; вынесено в W2.
- `pnpm verify` и `pnpm test:e2e` чувствительны к ресурсам машины: при
  параллельном чужом Playwright были `page.goto` timeouts (20 с), после
  чистого перезапуска dev-сервера — 13/13 passed. Это окружение, не
  регрессия строк.
- Ревью не-автора и label `reviewed` — следующие шаги; merge не делался.
