# Milestones

Концептуальные решения и отмены. Формат строки:

```
- ДД.ММ.ГГГГ. Что решили. Чем заменили (если отмена). Спринт N.
```

- 27.11.2026. Продукт: Local Hand — маркетплейс секонд-хенда и локальных
  брендов + конструктор магазинов; покупатель — главный пользователь v1;
  вся Россия; секонд-хенд и бренды со статусом + ЮKassa; оплата на сайте
  продавцу; СДЭК; цифровые товары только оригинальные; AI-агент для
  покупателя/продавца/админа; метрика 10 заказов + 30 магазинов. Init 0.1.
- 27.11.2026. Стек: Node 26, pnpm 12.23, React 19.3 + Vite 8.4 + Base UI
  1.9 + Tailwind 4.3, Fastify 5.12 + Drizzle + PostgreSQL 18; TypeScript
  7.0.2, линт — oxlint 1.95 вместо typescript-eslint (тот не поддерживает
  TS 7). Init 0.2.
- 27.11.2026. Инфраструктура: Selectel VM + S3 + Token Factory; Postgres
  на VM; managed PostgreSQL — следующий этап; без k8s/Redis/CDN. Init 0.2.
- 27.11.2026. LLM: DeepSeek V4.1 Flash через Selectel Token Factory
  (данные в РФ); Cloud.ru — запасной; прямой API DeepSeek для ПДн
  запрещён. Init 0.2.
- 27.11.2026. Дизайн: mobile-first + полноценный десктоп; ч/б брутализм
  с красным/оранжевым/зелёным акцентами; палитра отдельно. Init 0.2.
- 27.11.2026. Создан первый OpenSpec change `01-walking-skeleton`;
  реализация и remote/protected main — следующие шаги. Init 0.4.
- 27.11.2026. Walking skeleton реализован и смержен через PR #4; change
  заархивирован как `2026-11-27-01-walking-skeleton`, спека `storefront`
  создана. Init закрыт; Sprint 1 — только по команде. Init 0.4.
- 27.11.2026. Sprint 1 спланирован: Goal «продавец входит, создаёт
  магазин и публикует товар»; change `02-seller-onboarding`; 5 PBI,
  4–6 циклов. Сборка не начата — ждёт команды. Sprint 1.
- 27.11.2026. Sprint 1 начат командой владельца; cycle 1 закрыт —
  S1-1 phone auth смержен (PR #12, `d3e42b7`), tasks 1.1–1.6. Следующий —
  S1-2 shop. Sprint 1.
- 27.11.2026. S1-2 seller shop смержен (PR #14, `11ca2c0`): контракты,
  session guard, GET/POST/PATCH `/seller/shop`, slug, публикация,
  blocked read-only. Следующий — S1-3 products. Sprint 1.
- 27.11.2026. S1-3 seller products смержен (PR #16, `b728eda`):
  контракты product-admin, create/edit/publish/hide, ownership 404,
  int4/NUL validation. Следующий — S1-4a admin auth/shop UI. Sprint 1.
- 27.11.2026. S1-4a admin auth/shop UI смержен (PR #18, `f991c93`):
  `/login` OTP, guard, admin shell, onboarding/settings/publish,
  cache isolation, light/dark axe clean. Следующий — S1-4b products UI.
  Sprint 1.
- 27.11.2026. S1-4b products admin UI смержен (PR #20, `3753a1b`):
  таблица/карточки, create/edit, publish/hide, session-expired cache
  clear. Следующий — S1-5 security/evidence/archive. Sprint 1.
- 27.11.2026. Sprint 1 закрыт: S1-1…S1-5 смержены (PR #12/#14/#16/#18/
  #20/#22), change `02-seller-onboarding` заархивирован как
  `2026-11-27-02-seller-onboarding`, specs phone-auth/seller-shop/
  product-management созданы; review ACCEPT, retro записан. Sprint 1.
- 27.11.2026. Sprint 2 спланирован: buyer-core — каталог/поиск/сортировка,
  корзина, checkout/orders, seller orders; changes `03-catalog-discovery`, `04-cart`, `05-checkout-orders`, 4 PBI,
  4–6 циклов; без реальных платежей/доставки. Sprint 2.
- 27.11.2026. S2-1 catalog discovery смержен (PR #26, `7ab658e`):
  поиск/сортировка/пагинация, change `03` заархивирован. Следующий —
  S2-2 cart. Sprint 2.
- 27.11.2026. S2-2 cart смержен (PR #28, `92b4b9d`): localStorage,
  группы/итоги, badge, `/cart`; change `04` заархивирован. Следующий —
  S2-3 checkout/orders. Sprint 2.
- 27.11.2026. S2-3 checkout/orders смержен (PR #30/#31, `b909f30`/
  `2849d8c`): orders API, checkout, buyer/seller orders UI; change `05`
  заархивирован. Следующий — S2-4 security/close. Sprint 2.
- 27.11.2026. Sprint 2 закрыт: buyer-core — каталог, корзина,
  checkout/orders, seller orders; PR #26/#28/#30/#31/#33, changes
  `03`/`04`/`05` заархивированы. LCP: lab/preview gate принят владельцем
  как DoD-прокси v1, field p75/RUM — бэклог. Sprint 2.
