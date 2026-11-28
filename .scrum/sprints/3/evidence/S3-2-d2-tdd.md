# S3-2-D2: delivery snapshot in buyer/seller orders UI

Дата: 2026-11-28. Ветка `task/S3-2-d2-orders-delivery-ui`, база `main` @ `5ebfe9c`.
Tier: T1 UI на T2-данных.

## AC → тест

| AC | Тест |
|---|---|
| `delivery === null` → «Доставка не оформлена», без пустого `<dl>` | `DeliverySummaryCard.test.tsx` → «shows one neutral line…» |
| Русские ярлыки всех статусов | `DeliverySummaryCard.test.tsx` → «maps every delivery status…» (сверка `DELIVERY_STATUS_LABELS`) |
| Город, ПВЗ, получатель, цена, срок, тариф | `DeliverySummaryCard.test.tsx` → «delivered snapshot…» + «periods and manual carriers…» |
| Трек: перевозчик или «Перевозчик», текст без ссылки | те же тесты: `СДЭК · 1234567890`, `Перевозчик · 9876543210`, `Почта России · RA123456789RU` |
| `lastStatusAt` форматируется | «delivered snapshot…» |
| Длинный адрес переносится (`break-words`) | «delivered snapshot…» (`toHaveClass("break-words")`) |
| Не рендерятся raw provider id / status code | «delivered snapshot…» (`cdek-order-987654`, `DELIVERED` отсутствуют) |
| Покупатель видит карточку на `OrderPage` | `OrderPage.test.tsx` → «shows the delivery snapshot…» |
| Продавец видит карточку на `AdminOrderPage` | `AdminOrdersPage.test.tsx` → `AdminOrderPage` «shows the delivery snapshot to the seller» |
| Строка списка только при наличии доставки | `OrdersPage.test.tsx` → «shows a delivery line only for orders with delivery» |
| Старые заказы без доставки не ломаются | существующие page-тесты с `delivery: null` |

## RED / GREEN

- RED: `.scrum/sprints/3/evidence/S3-2-d2-tdd-red.txt` — production-код убран,
  финальный набор тестов: 4 файла failed, 3 теста failed + unresolved import
  компонента.
- GREEN: `.scrum/sprints/3/evidence/S3-2-d2-tdd-green.txt` — 4 файла / 45 тестов,
  полный web-suite 164 теста.
- `pnpm verify`: `.scrum/sprints/3/evidence/S3-2-d2-verify.txt`.

## Решение по `AdminOrdersPage`

Список продавца не менялся: строка «Доставка: цена · статус» не помещается
естественно в колонку «Сумма» (11%, table-fixed) без переделки таблицы.
Карточка доставки на `AdminOrderPage` (деталь заказа) реализована. Бриф
допускает пропуск: «otherwise skip it (do not redesign the list)».

## Вне скоупа

Browser e2e, axe, LCP, скриншоты — следующий PR (3.10). API, БД, shared-контракты,
`openspec/specs/` не менялись.
