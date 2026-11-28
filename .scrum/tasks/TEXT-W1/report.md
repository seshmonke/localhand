# Text Review W1 — report

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: Copywriter` ·
> `task: Text Review W1` · `change: No spec change: copy only` ·
> `tier: T0` · branch `task/text-review-w1` · worktree
> `<worktree>` · base `main@041cfa0`.
> links: [audit](../../reviews/text-site-audit.md) ·
> [voice/glossary](../../../../../docs/design/content.md) ·
> [program](../../../../../docs/tasks/text-review.md).

## Статус

W1 готов к ревью. Поведение, коды, authz, API-контракты и смысл статусов
не менялись. W2/W3 не редактировались.

## Что сделано

Аудит всех production-текстов сайта:
[`.scrum/reviews/text-site-audit.md`](../../reviews/text-site-audit.md).

- 33 production-файла `apps/web/src/**` + `apps/web/index.html`.
- 405 строковых литералов с кириллицей; с JSX/шаблонами примерно 430
  фрагментов: W1 — 189, W2 — 219, W3 в коде сайта — 0.
- Таблица по каждой поверхности: файл, строка/место, проблема,
  предложение, волна.
- 10 системных проблем: roadmap-обещания в UI, неподтверждённые claims,
  status mismatch, технический язык, глоссарий, канцелярит, системные
  ошибки, «возможно», dev/demo-артефакты, дубли.

Правки W1 (32 строки в 7 файлах):

| Файл | Что изменено |
|---|---|
| `apps/web/src/pages/CheckoutPage.tsx` | убраны «сервер», «уникальных», «посылка», «на который вы вошли», «статус заказа покажет»; `delivery_required` и quote error стали действием; недоступная корзина объясняет, что убрать |
| `apps/web/src/pages/OrderPage.tsx` | «Оплата не подключена» → «Оплата ещё не начата» для неначатого платежа; убран «тот же ключ»; убрано обещание «несколько секунд»; canceled/failed больше не противоречат друг другу; 404 не врёт про удаление заказа |
| `apps/web/src/pages/OrdersPage.tsx` | «заявки» → «заказы»; «по указанному телефону» → «с вами»; emptyLabel «Оплата не начата» |
| `apps/web/src/pages/AdminOrderPage.tsx` | точка с запятой → точка; «передача вещи» → «передача товара»; 404 без «удалён» |
| `apps/web/src/pages/AdminOrdersPage.tsx` | «заявки» → «заказы»; статус оплаты «показан отдельно»; без магазина — прямой порядок действий |
| `apps/web/src/components/admin/AdminDeliveryCard.tsx` | тариф и ручной трек — короткие предложения; «Трек-номер» → «Трек»; пассив → действие |
| `apps/web/src/components/admin/SellerPaymentsCard.tsx` | просмотрен, правок не требует |

Тесты обновлены под новые строки: `CheckoutPage.test.tsx`,
`OrderPage.test.tsx`, `OrdersPage.test.tsx`,
`AdminDeliveryCard.test.tsx`. Ослабления проверок нет: изменены только
ожидаемые тексты и один селектор `/вручную/` → конкретная фраза.

## Проверки

| Команда | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @localhand/web test` | 0 | `evidence/web-test.txt` (25 files, 220 tests) |
| `pnpm verify` | 0 | `evidence/verify.txt` (typecheck, lint, format, check:public, tests, build, openspec 9/9) |
| `slop-check` W1 files после правок | 1 (только `PUNCT` на код) | `evidence/slop-check-after.txt` |
| `slop-check` W1 files baseline | 1 | `evidence/slop-check-baseline.txt` |

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

- code+tests: 60 добавлено / 57 удалено = 117 изменённых строк, без
  evidence и аудита. Лимит 600 не превышен, split не нужен.
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

Push/PR из этой сессии недоступны: `git push` отклонён permission-политикой
(`Permission denied: shell`). Ветка `task/text-review-w1` и коммит
`e77b1bb` остаются локально в worktree; PR не создан. Ревьюеру нужен
доступ к worktree или повторный push из сессии с правом push.

## Риски и остатки

- Ценовые/юридические claims («без комиссии», «мгновенная ссылка»,
  «города РФ — все») требуют владельца/юриста; Copywriter их не
  утверждает.
- W1 residual: fallback «Оплаченный тариф: тариф заказа» в
  `AdminDeliveryCard` может дублироваться, если название тарифа не
  найдено; вынесено в W2.
- `pnpm verify` чувствителен к ресурсам машины: параллельные api+web
  тесты иногда упираются в 5-секундный timeout jsdom.
- Ревью не-автора и label `reviewed` — следующие шаги; merge не делался.
