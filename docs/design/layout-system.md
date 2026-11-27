# Layout-система

Решение 2026-11-27. Единая сетка, контейнер и ритм для витрины и
кабинета продавца. Визуальный язык не меняется: ч/б брутализм, 3 px
border, display/mono, резкие тени.

## Контейнер

| Страница | Ширина | Padding |
|---|---|---|
| Витрина, корзина, checkout, заказы | `max-w-page` = 90rem / 1440 px | 16 / 24 / 40 px |
| Кабинет продавца | `max-w-admin` = 75rem / 1200 px | 16 / 24 / 40 px |
| Sidebar админки | 260 px | — |

`PageShell` — единственный источник горизонтального контейнера.
Заголовок, первая карточка и таблица начинаются на одной левой линии,
потому что все они лежат внутри одного `PageShell`. Локальные
`max-w-[1100px]`, `max-w-[1440px]` в страницах запрещены.

```tsx
<PageShell size="page">…</PageShell>   {/* 1440 */}
<PageShell size="admin">…</PageShell>  {/* 1200 */}
```

`PageShell` — flex-колонка на всю доступную высоту. Вертикальный
padding задаёт страница: `py-6` в админке, `py-10 sm:py-14` на
витрине.

Внутри `AdminShell` горизонтальный padding живёт только в
`PageShell`. `main` админки даёт вертикальный `py-6 lg:py-10`, поэтому
padding не удваивается.

## Сетка 12 колонок

Page-level — CSS Grid: 4 колонки на mobile, 8 на планшете, 12 на
десктопе.

```tsx
<Grid>
  <GridColumn span={8}>…</GridColumn>
  <Sidebar sticky>…</Sidebar>
</Grid>
```

- `Grid`: `grid-cols-4 md:grid-cols-8 lg:grid-cols-12`,
  `gap-x-4 lg:gap-x-6` (16 / 24 px), `gap-y-6` (24 px).
- `GridColumn`: на mobile и планшете занимает всю ширину, на `lg` —
  `span` из 4/5/6/7/8/12.
- `Sidebar`: `lg:col-span-4`, опционально `sticky` с `top-28`.
- `Grid`/`Sidebar` — только page-level. Внутри карточек — flex и
  `Stack`, не вторая сетка.

Каталог и списки товаров — компонентные grid-сетки 2/4 колонки
(`grid-cols-2 lg:grid-cols-4`), это не page-level раскладка.

## 8pt-ритм

Только шаги 8/16/24/32/40/48 px. Промежутки между блоками — `gap` в
`Stack` или `grid`, не `mt-*`.

| Шаг | Tailwind | Где |
|---|---|---|
| 8 | `gap-2` | иконка + текст, плотная пара |
| 16 | `gap-4` | поля формы, кнопки в ряд |
| 24 | `gap-6` | карточки внутри колонки, header → контент |
| 32 | `gap-8` | крупные секции страницы |
| 40 | `gap-10` | hero-блок |
| 48 | `gap-12` | исключительный крупный разрыв |

```tsx
<Stack gap={6}>
  <PageHeader … />
  <Grid>…</Grid>
</Stack>
```

Типографика сохраняет собственные line-height и оптические сдвиги
иконок (`mt-0.5`). Это не layout-отступы.

## Компоненты

`apps/web/src/components/layout/`:

| Компонент | Ответственность |
|---|---|
| `PageShell` | контейнер, ширина, padding, full-height |
| `PageHeader` | eyebrow, title, description, actions, нижняя линия 3 px |
| `Stack` | вертикальный gap по шкале 8pt |
| `Card` | border 3 px, padding 16/24/32, tone paper/inverse, shadow |
| `Grid` | page-level 4/8/12 колонок |
| `GridColumn` | span контента на `lg` |
| `Sidebar` | правая колонка 4/12, sticky на `lg` |
| `LayoutGuides` | dev-overlay 12 колонок |

`Card` политиморфен: `as="form" | "section" | "article" | "aside"`.
Это позволяет форме и status-aside стартовать на одной линии без
обёрток с разным padding.

```tsx
<Card as="form" aria-labelledby="product-form-title">…</Card>
<Sidebar>
  <Card as="section" aria-labelledby="product-status-title">…</Card>
</Sidebar>
```

## Header

- Высота 64 px на mobile, 80 px на `sm+`.
- Все контролы — 44×44 px: `size-11` или `h-11`, `shrink-0`.
- Вертикальные центры контролов совпадают; ряд выровнен `items-center`.
- CTA «Открыть магазин» скрыт до `lg`, поэтому 320 px не ломается.
- Badge корзины — `min-w-6`, не выходит за padding контейнера.
- Навигация появляется с `md`, меню — до `md`.

## Admin product edit

`Announcer` стоит над `Grid`, а не внутри левой колонки. Поэтому
`form` и первая `Card` status-aside начинают на одной линии.
`Grid` даёт `gap-y-6` и одинаковые `Card` padding. Страницы с
независимыми по высоте колонками (`/orders/:id`, `/admin/orders/:id`,
`/products/:id`) добавляют `lg:items-start`; в форме товара верхнее выравнивание
обеспечено тем, что `Announcer` стоит над сеткой.

## Таблицы и touch

- До `lg` таблицы заменяются карточками (`ProductCards`,
  `OrdersCards`), а не уезжают за экран.
- Горизонтальный скролл допускается только внутри блока.
- Интерактивные контролы — минимум 44 px по высоте: кнопки, ссылки-
  кнопки, nav, поля.
- 320/768/1440: горизонтального overflow нет.

## Dev-overlay

`?guides=1` показывает 12-колоночную сетку поверх страницы: те же
4/8/12 колонки, gutter 16/24 и padding 16/24/40. Overlay доступен
только в dev-сборке (`import.meta.env.DEV`), не имеет ссылок в UI и
не попадает в production bundle как видимый элемент.

```text
http://localhost:5173/?guides=1
```

## Проверка

`apps/web/e2e/layout.spec.ts`:

- скриншоты `/`, `/cart`, `/checkout`, `/orders`, `/admin/shop`,
  `/admin/products/:id`, `/admin/orders` на 320/768/1440;
- нет горизонтального overflow;
- header-контролы и nav-ссылки: высота ≥44, центры ±1 px; CTA видна
  только с `lg`;
- form и status-aside в admin product edit: top ±1 px на 1440;
- левые края заголовков совпадают внутри storefront-группы (16/24/40)
  и внутри admin-группы (16/24/300: сайдбар 260 + padding 40);
- `?guides=1` даёт 4/8/12 видимых колонок на 320/768/1440;
- axe light/dark на admin-страницах: 0 serious/critical.

## Источники

- Material Design 3, responsive layout grid — 4/8/12 колонок, gutter и
  breakpoints.
- NN/g, «Responsive Web Design» и «Grids» — контейнер, максимальная
  ширина, выравнивание.
- Tailwind CSS, grid и spacing scale — реализация `grid-cols-*`,
  `gap-*`, `max-w-*`.
- 8pt grid (Spec Network, «The 8-Point Grid») — шаги 8/16/24/32/40/48.
- WCAG 2.2, 1.4.10 Reflow — 320 CSS px без горизонтальной прокрутки;
  2.5.8 Target Size — минимум 24 px, продуктовый порог 44 px.
