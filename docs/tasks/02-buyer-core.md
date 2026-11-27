# Спринт 2: buyer-core

Статус: **BUILDING**, cycle 3. S2-1 catalog (PR #26, `03`) и S2-2 cart (PR #28, `04`) закрыты; следующий — S2-3 checkout/orders, затем S2-4.
Дата планирования: 27.11.2026.
Changes: `03-catalog-discovery`, `04-cart` (оба заархивированы),
`05-checkout-orders`.
Направление: buyer-first ядро — покупатель находит товар, открывает
магазин/карточку, оформляет заказ. Оплата и доставка — следующие
спринты.

## Sprint Goal

Покупатель находит товар, собирает корзину и оформляет заказ продавцу;
продавец видит заказ.

Наблюдаемый результат на preview: покупатель ищет товар, сортирует
каталог, добавляет товары в корзину, входит по dev-OTP на checkout,
оформляет заказ (один заказ на магазин); покупатель видит свои заказы,
продавец — заказ своего магазина; чужой заказ недоступен. Без реальных
платежей и доставки.

## Состав

| PBI | Приоритет | Результат | Change | Задачи | Зависит от |
|---|---|---|---|---|---|
| S2-1 Catalog discovery | P1 (срез первый) | Поиск, сортировка, пагинация; стабильная выдача | `03-catalog-discovery` | 1.1–1.4 | S1 |
| S2-2 Cart | P0 | localStorage-корзина, группы, add/remove, badge | `04-cart` | 2.1–2.4 | S2-1 |
| S2-3 Checkout & orders | P0 | Buyer auth, заказ на магазин, snapshot, buyer/seller API+UI | `05-checkout-orders` | 3.1–3.7, 4.1–4.5 | S2-2 |
| S2-4 Security & evidence | P0 | Authz/PII/logs, browser+API e2e, axe/LCP, close | нет нового behavior | 5.1–5.5 (бриф `S2-4-security.md`) | S2-1–S2-3 |

Архив change — после merge соответствующего PBI: `03` в S2-1, `04` в
S2-2, `05` в S2-3. S2-4 закрывает спринт отдельным close-PR.

## Критерии приёмки спринта

- [ ] Покупатель ищет по названию товара/магазина, сортирует по цене и
      новизне, листает страницы; скрытые/черновые товары не видны.
- [ ] Корзина переживает перезагрузку, группирует товары по магазинам,
      считает итог; товар можно удалить/очистить; лимит 50.
- [ ] Checkout требует сессию; без неё — login с возвратом на
      `/checkout`; `safeNext` разрешает только внутренние
      `/checkout`, `/orders`, `/orders/:id`, `/admin`.
- [ ] Заказ создаётся на каждый магазин; цена/название — snapshot
      сервера; повтор с `clientCheckoutId` не создаёт дубль.
- [ ] Покупатель видит только свои заказы; продавец — только заказы
      своего магазина; чужой id → 404, без сессии 401.
- [ ] Телефон/комментарий заказа не видны публично и не попадают в
      логи.
- [ ] Mobile 320 и desktop 1440; loading/empty/error; a11y-фокус,
      клавиатура, axe light/dark на всех изменённых страницах.
- [ ] Browser e2e (Playwright) + API e2e: dev OTP → каталог → корзина →
      checkout → заказ → seller view; скриншоты/видео evidence. Axe —
      manual DevTools в S2-1–S2-3, автоматический axe — S2-4.
- [ ] `pnpm verify`, `openspec validate --all --strict`, preview smoke —
      зелёные; LCP/бандл-дельта записаны.
- [ ] Changes заархивированы по PBI, specs обновлены; review/retro.

## Вне скоупа

- ЮKassa, чеки, возвраты, СДЭК, адрес/трек, реальные платежи.
- Цифровые товары, S3/фото, категории/фильтры по состоянию.
- Модерация, жалобы, owner-admin, AI-агент.
- Реальная SMS-отправка и прод-ключи.
- Серверная корзина, резервирование остатков, quantity > 1.

## Риски и решения

- **PII.** Заказ хранит телефон покупателя (из сессии) и комментарий;
  только вымышленные данные в preview, логи без телефона/кода. Пакет
  согласий/оферты — отдельный legal-пакет до публичного запуска.
- **Платёж отсутствует.** Заказ `new` без оплаты; checkout —
  «заявка продавцу». Реальная оплата — Sprint 3.
- **Корзина stale.** Сервер пересчитывает и отклоняет недоступное;
  snapshot фиксируется при заказе.
- **Дубли заказа.** `clientCheckoutId` + unique(buyer, key, shop) + disabled
  submit; повтор возвращает существующие заказы.
- **Гонки.** Нет резерва: два покупателя могут заказать последний товар;
  для v1 допустимо, фиксируем.
- **Объём.** Must-have: cart, checkout/authz/401, buyer/seller orders,
  PII/logs. Cut first: S2-1 sort/pagination polish и desktop seller
  orders; после — search, но checkout/authz не режем.
- **e2e.** Playwright-конфиг/скрипт добавляются в S2-4; до этого
  browser-smoke вручную. Если CI-браузеры нестабильны, e2e остаётся
  локальным гейтом с evidence, CI — API e2e.

## План циклов

1. Catalog: контракты, API search/sort/page (default 100, UI 12), web-контролы, тесты.
2. Cart: storage/context, add/remove, cart page, badge, тесты.
3. Checkout API: `0003`, contracts, POST /checkout, orders read, seller
   API, DB-тесты, down SQL.
4. Orders UI: checkout + auth gate, buyer/seller orders, responsive/a11y.
5. Security/evidence (S2-4): browser Playwright + API e2e, authz/PII/
   logs, docs, preview, axe light/dark, LCP/бандл (бриф S2-4-security).
6. Buffer/close: archive changes, review/retro.

## Старт

Владелец дал standing authorization на buyer-core и авто-старт после
Sprint 1. План и changes фиксируются PR; после merge — claim S2-1 без
отдельной команды.

## Evidence

Заполняется при сборке: команда, exit code, хвост вывода, commit SHA,
preview smoke/скриншоты, axe, LCP/бандл, e2e (API + browser).
