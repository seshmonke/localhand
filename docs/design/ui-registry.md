# Реестр UI-компонентов

Цель: 200 бесплатных реализаций, совместимых с shadcn/Base UI и
пригодных для Local Hand. Это **реестр кандидатов**, а не зависимость:
компонент копируется в `packages/ui` через shadcn CLI/реестр, проходит
Storybook и a11y-проверку, затем используется.

## Правила

- Только бесплатные и открытые лицензии; при сомнении — не берём.
- Стиль Local Hand — ч/б брутализм; сначала NeoBrutalism/shadcn, потом
  декоративные анимации.
- Цвета — только токены (`ink`, `paper`, акценты); сырые hex в
  компонентах запрещены.
- Тач-зоны ≥ 44 px, фокус видим, клавиатура работает.
- Сначала история в Storybook, потом приложение.
- Дубли типов между источниками — осознанны: разные реализации под
  разную плотность/стиль.

## Источники

| Источник | URL | Лицензия | Записей |
|---|---|---|---|
| shadcn/ui | https://ui.shadcn.com | MIT | 58 |
| Base UI | https://base-ui.com | MIT | 37 |
| NeoBrutalism | https://www.neobrutalism.dev | MIT | 30 |
| Origin UI | https://originui.com | MIT | 40 |
| Magic UI | https://magicui.design | MIT | 15 |
| Motion Primitives | https://motion-primitives.com | MIT | 15 |
| Kokonut UI | https://kokonutui.com | MIT | 5 |
| Cult UI (резерв) | https://cult-ui.com | MIT | — |
| HextaUI (резерв) | https://hextaui.com | MIT | — |

## Реестр

| # | Компонент | Категория | Источник | Лицензия |
|---|---|---|---|---|
| 1 | Accordion | disclosure | shadcn/ui | MIT |
| 2 | Alert | feedback | shadcn/ui | MIT |
| 3 | Alert Dialog | overlay | shadcn/ui | MIT |
| 4 | Aspect Ratio | layout | shadcn/ui | MIT |
| 5 | Avatar | data | shadcn/ui | MIT |
| 6 | Badge | data | shadcn/ui | MIT |
| 7 | Breadcrumb | nav | shadcn/ui | MIT |
| 8 | Button | action | shadcn/ui | MIT |
| 9 | Button Group | action | shadcn/ui | MIT |
| 10 | Calendar | form | shadcn/ui | MIT |
| 11 | Card | layout | shadcn/ui | MIT |
| 12 | Carousel | data | shadcn/ui | MIT |
| 13 | Chart | data | shadcn/ui | MIT |
| 14 | Checkbox | form | shadcn/ui | MIT |
| 15 | Collapsible | disclosure | shadcn/ui | MIT |
| 16 | Combobox | form | shadcn/ui | MIT |
| 17 | Command | nav | shadcn/ui | MIT |
| 18 | Context Menu | overlay | shadcn/ui | MIT |
| 19 | Data Table | data | shadcn/ui | MIT |
| 20 | Date Picker | form | shadcn/ui | MIT |
| 21 | Dialog | overlay | shadcn/ui | MIT |
| 22 | Drawer | overlay | shadcn/ui | MIT |
| 23 | Dropdown Menu | overlay | shadcn/ui | MIT |
| 24 | Empty | feedback | shadcn/ui | MIT |
| 25 | Field | form | shadcn/ui | MIT |
| 26 | Hover Card | overlay | shadcn/ui | MIT |
| 27 | Input | form | shadcn/ui | MIT |
| 28 | Input Group | form | shadcn/ui | MIT |
| 29 | Input OTP | form | shadcn/ui | MIT |
| 30 | Item | layout | shadcn/ui | MIT |
| 31 | Kbd | data | shadcn/ui | MIT |
| 32 | Label | form | shadcn/ui | MIT |
| 33 | Menubar | nav | shadcn/ui | MIT |
| 34 | Native Select | form | shadcn/ui | MIT |
| 35 | Navigation Menu | nav | shadcn/ui | MIT |
| 36 | Pagination | nav | shadcn/ui | MIT |
| 37 | Popover | overlay | shadcn/ui | MIT |
| 38 | Progress | feedback | shadcn/ui | MIT |
| 39 | Radio Group | form | shadcn/ui | MIT |
| 40 | Resizable | layout | shadcn/ui | MIT |
| 41 | Scroll Area | layout | shadcn/ui | MIT |
| 42 | Select | form | shadcn/ui | MIT |
| 43 | Separator | layout | shadcn/ui | MIT |
| 44 | Sheet | overlay | shadcn/ui | MIT |
| 45 | Sidebar | nav | shadcn/ui | MIT |
| 46 | Skeleton | feedback | shadcn/ui | MIT |
| 47 | Slider | form | shadcn/ui | MIT |
| 48 | Sonner | feedback | shadcn/ui | MIT |
| 49 | Spinner | feedback | shadcn/ui | MIT |
| 50 | Switch | form | shadcn/ui | MIT |
| 51 | Table | data | shadcn/ui | MIT |
| 52 | Tabs | nav | shadcn/ui | MIT |
| 53 | Textarea | form | shadcn/ui | MIT |
| 54 | Toast | feedback | shadcn/ui | MIT |
| 55 | Toggle | action | shadcn/ui | MIT |
| 56 | Toggle Group | action | shadcn/ui | MIT |
| 57 | Tooltip | overlay | shadcn/ui | MIT |
| 58 | Typography | layout | shadcn/ui | MIT |
| 59 | Accordion | disclosure | Base UI | MIT |
| 60 | Alert Dialog | overlay | Base UI | MIT |
| 61 | Autocomplete | form | Base UI | MIT |
| 62 | Avatar | data | Base UI | MIT |
| 63 | Button | action | Base UI | MIT |
| 64 | Checkbox | form | Base UI | MIT |
| 65 | Checkbox Group | form | Base UI | MIT |
| 66 | Collapsible | disclosure | Base UI | MIT |
| 67 | Combobox | form | Base UI | MIT |
| 68 | Context Menu | overlay | Base UI | MIT |
| 69 | Dialog | overlay | Base UI | MIT |
| 70 | Drawer | overlay | Base UI | MIT |
| 71 | Field | form | Base UI | MIT |
| 72 | Fieldset | form | Base UI | MIT |
| 73 | Form | form | Base UI | MIT |
| 74 | Input | form | Base UI | MIT |
| 75 | Menu | overlay | Base UI | MIT |
| 76 | Menubar | nav | Base UI | MIT |
| 77 | Meter | data | Base UI | MIT |
| 78 | Navigation Menu | nav | Base UI | MIT |
| 79 | Number Field | form | Base UI | MIT |
| 80 | OTP Field | form | Base UI | MIT |
| 81 | Popover | overlay | Base UI | MIT |
| 82 | Preview Card | overlay | Base UI | MIT |
| 83 | Progress | feedback | Base UI | MIT |
| 84 | Radio Group | form | Base UI | MIT |
| 85 | Scroll Area | layout | Base UI | MIT |
| 86 | Select | form | Base UI | MIT |
| 87 | Separator | layout | Base UI | MIT |
| 88 | Slider | form | Base UI | MIT |
| 89 | Switch | form | Base UI | MIT |
| 90 | Tabs | nav | Base UI | MIT |
| 91 | Toast | feedback | Base UI | MIT |
| 92 | Toggle | action | Base UI | MIT |
| 93 | Toggle Group | action | Base UI | MIT |
| 94 | Toolbar | action | Base UI | MIT |
| 95 | Tooltip | overlay | Base UI | MIT |
| 96 | Accordion | disclosure | NeoBrutalism | MIT |
| 97 | Alert | feedback | NeoBrutalism | MIT |
| 98 | Avatar | data | NeoBrutalism | MIT |
| 99 | Badge | data | NeoBrutalism | MIT |
| 100 | Button | action | NeoBrutalism | MIT |
| 101 | Card | layout | NeoBrutalism | MIT |
| 102 | Checkbox | form | NeoBrutalism | MIT |
| 103 | Combobox | form | NeoBrutalism | MIT |
| 104 | Dialog | overlay | NeoBrutalism | MIT |
| 105 | Drawer | overlay | NeoBrutalism | MIT |
| 106 | Dropdown Menu | overlay | NeoBrutalism | MIT |
| 107 | Input | form | NeoBrutalism | MIT |
| 108 | Label | form | NeoBrutalism | MIT |
| 109 | Pagination | nav | NeoBrutalism | MIT |
| 110 | Popover | overlay | NeoBrutalism | MIT |
| 111 | Progress | feedback | NeoBrutalism | MIT |
| 112 | Radio Group | form | NeoBrutalism | MIT |
| 113 | Select | form | NeoBrutalism | MIT |
| 114 | Separator | layout | NeoBrutalism | MIT |
| 115 | Sheet | overlay | NeoBrutalism | MIT |
| 116 | Skeleton | feedback | NeoBrutalism | MIT |
| 117 | Slider | form | NeoBrutalism | MIT |
| 118 | Switch | form | NeoBrutalism | MIT |
| 119 | Table | data | NeoBrutalism | MIT |
| 120 | Tabs | nav | NeoBrutalism | MIT |
| 121 | Textarea | form | NeoBrutalism | MIT |
| 122 | Toast | feedback | NeoBrutalism | MIT |
| 123 | Toggle | action | NeoBrutalism | MIT |
| 124 | Tooltip | overlay | NeoBrutalism | MIT |
| 125 | Breadcrumb | nav | NeoBrutalism | MIT |
| 126 | Input | form | Origin UI | MIT |
| 127 | Textarea | form | Origin UI | MIT |
| 128 | Select | form | Origin UI | MIT |
| 129 | Checkbox | form | Origin UI | MIT |
| 130 | Radio Group | form | Origin UI | MIT |
| 131 | Switch | form | Origin UI | MIT |
| 132 | Slider | form | Origin UI | MIT |
| 133 | Date Picker | form | Origin UI | MIT |
| 134 | Time Picker | form | Origin UI | MIT |
| 135 | File Upload | form | Origin UI | MIT |
| 136 | Phone Input | form | Origin UI | MIT |
| 137 | Password Input | form | Origin UI | MIT |
| 138 | Search Input | form | Origin UI | MIT |
| 139 | Number Input | form | Origin UI | MIT |
| 140 | OTP Input | form | Origin UI | MIT |
| 141 | Tags Input | form | Origin UI | MIT |
| 142 | Combobox | form | Origin UI | MIT |
| 143 | Multiselect | form | Origin UI | MIT |
| 144 | Command | nav | Origin UI | MIT |
| 145 | Dialog | overlay | Origin UI | MIT |
| 146 | Drawer | overlay | Origin UI | MIT |
| 147 | Sheet | overlay | Origin UI | MIT |
| 148 | Popover | overlay | Origin UI | MIT |
| 149 | Tooltip | overlay | Origin UI | MIT |
| 150 | Dropdown | overlay | Origin UI | MIT |
| 151 | Context Menu | overlay | Origin UI | MIT |
| 152 | Menubar | nav | Origin UI | MIT |
| 153 | Tabs | nav | Origin UI | MIT |
| 154 | Accordion | disclosure | Origin UI | MIT |
| 155 | Collapsible | disclosure | Origin UI | MIT |
| 156 | Table | data | Origin UI | MIT |
| 157 | Data Table | data | Origin UI | MIT |
| 158 | Pagination | nav | Origin UI | MIT |
| 159 | Breadcrumb | nav | Origin UI | MIT |
| 160 | Badge | data | Origin UI | MIT |
| 161 | Avatar | data | Origin UI | MIT |
| 162 | Card | layout | Origin UI | MIT |
| 163 | Alert | feedback | Origin UI | MIT |
| 164 | Toast | feedback | Origin UI | MIT |
| 165 | Progress | feedback | Origin UI | MIT |
| 166 | Animated Beam | motion | Magic UI | MIT |
| 167 | Bento Grid | layout | Magic UI | MIT |
| 168 | Blur Fade | motion | Magic UI | MIT |
| 169 | Border Beam | motion | Magic UI | MIT |
| 170 | Dock | nav | Magic UI | MIT |
| 171 | Globe | marketing | Magic UI | MIT |
| 172 | Icon Cloud | marketing | Magic UI | MIT |
| 173 | Marquee | marketing | Magic UI | MIT |
| 174 | Meteors | marketing | Magic UI | MIT |
| 175 | Number Ticker | data | Magic UI | MIT |
| 176 | Retro Grid | marketing | Magic UI | MIT |
| 177 | Shine Border | motion | Magic UI | MIT |
| 178 | Shimmer Button | action | Magic UI | MIT |
| 179 | Sparkles Text | marketing | Magic UI | MIT |
| 180 | Typing Animation | marketing | Magic UI | MIT |
| 181 | Animated Number | data | Motion Primitives | MIT |
| 182 | Animated Tabs | nav | Motion Primitives | MIT |
| 183 | Animated Tooltip | overlay | Motion Primitives | MIT |
| 184 | Animated Group | motion | Motion Primitives | MIT |
| 185 | Carousel | data | Motion Primitives | MIT |
| 186 | Disclosure | disclosure | Motion Primitives | MIT |
| 187 | Dynamic Island | feedback | Motion Primitives | MIT |
| 188 | Image Zoom | data | Motion Primitives | MIT |
| 189 | Infinite Slider | data | Motion Primitives | MIT |
| 190 | Morphing Dialog | overlay | Motion Primitives | MIT |
| 191 | Scroll Progress | feedback | Motion Primitives | MIT |
| 192 | Sliding Number | data | Motion Primitives | MIT |
| 193 | Spotlight | marketing | Motion Primitives | MIT |
| 194 | Text Effect | marketing | Motion Primitives | MIT |
| 195 | Text Shimmer | feedback | Motion Primitives | MIT |
| 196 | Action Search Bar | nav | Kokonut UI | MIT |
| 197 | Animated Card | layout | Kokonut UI | MIT |
| 198 | Card Stack | data | Kokonut UI | MIT |
| 199 | File Upload | form | Kokonut UI | MIT |
| 200 | Loader | feedback | Kokonut UI | MIT |

## Как пополнять

- Новый компонент — строка в таблице + ссылка на источник + лицензия.
- Проверка: `pnpm verify`, Storybook, a11y, 320/1440.
- Если компонент тянет тяжёлую зависимость или WebGL — отдельное
  решение, не в каталог по умолчанию.
- Paid/freemium (Aceternity paid blocks, shadcn.io Pro, BoldKit paid
  планы) в реестр не входят без явной покупки.

## Что берём первым

1. NeoBrutalism + shadcn: кнопки, поля, карточки, таблицы, диалоги.
2. Base UI: поведение и доступность для сложных виджетов.
3. Origin UI: формы, фильтры, data table.
4. Magic/Motion: только точечно — hero, появление секций, number
   ticker; не на карточках товаров и не в админке.
