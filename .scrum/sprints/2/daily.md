# Sprint 2 daily

## Cycle 1 — 27.11.2026

### S2-1 Catalog discovery

- Сделано: контракты catalog, API search/sort/page, web-поиск/
  сортировка/пагинация, URL-состояние, NUL/id/page edge cases, a11y.
- Ревью: **APPROVE**; P2 NUL/P3 id/focus закрыты `7b42080`.
- `pnpm verify`: exit 0; API 134/134, shared 55/55, web 47/47,
  OpenSpec 7/7.
- PR #26 squash-merge `7ab658e`; change `03-catalog-discovery`
  заархивирован; evidence:
  [evidence/S2-1-verify.md](evidence/S2-1-verify.md).
- S2-1 закрыт; tasks 1.1–1.4 отмечены. Блокеров нет.

### Итог синка

- Продолжаем: S2-2 cart.
- Перепланирование не нужно.
- Эскалаций нет; владелец не требуется.

## Cycle 2 — 27.11.2026

### S2-2 Cart

- Статус: `in_progress`, owner `scrum-worker`; ветка `task/S2-2-cart`,
  lease до 07:30Z.
- Дальше: localStorage-корзина, группы по магазинам, badge, `/cart`,
  тесты, mobile/a11y.
- Блокеры: нет.

### Финал цикла

- S2-2 cart: localStorage, группы/итоги, badge, `/cart`, a11y/overflow
  fix; PR #28 merge `92b4b9d`; change `04` заархивирован.
- `pnpm verify`: API 134/134, shared 70/70, web 87/87, OpenSpec 7/7.
- S2-2 закрыт; tasks 2.1–2.4 отмечены. Блокеров нет.

## Cycle 3 — 27.11.2026

### S2-3 Checkout & orders

- API 3a: **done**, PR #30 merge `b909f30`.
- UI 3b: `in_progress`, ветка `task/S2-3b-orders-ui`, lease до 09:30Z.
- Дальше: checkout, buyer/seller orders, safeNext, a11y, тесты.
- Блокеры: нет.

### Финал цикла

- S2-3 API+UI: миграция orders, checkout, buyer/seller orders,
  checkout/orders UI; PR #30/#31 merge `b909f30`/`2849d8c`; change `05`
  заархивирован.
- `pnpm verify`: API 148/148, shared 100/100, web 114/114, OpenSpec 7/7.
- S2-3 закрыт; tasks 3.1–3.7/4.1–4.5 отмечены. Блокеров нет.

## Cycle 4 — 27.11.2026

### S2-4 Security, e2e, evidence, close

- Статус: `in_progress`, owner `scrum-worker`; ветка `task/S2-4-security`,
  lease до 10:00Z.
- Дальше: Playwright e2e + API buyer flow, authz/PII/logs, ADR/legal,
  axe/LCP/бандл, Sprint 2 review/retro/close.
- Блокеры: нет.

### Финал цикла

- S2-4: API/browser e2e, axe 16×0, preview LCP gate 508/688,
  PII/logs/no-store, ADR 0003; PR #33 merge `8b748b2`.
- Owner decision: lab/preview LCP — DoD-прокси v1; field p75/RUM — бэклог.
- Sprint 2 **закрыт**, ACCEPT; review/retro записаны.
- Следующий шаг: layout-system PBI (согласован), затем Sprint 3 plan.

### Итог синка

- Sprint 2 закрыт; Sprint 3 не начат без плана/команды.
- Эскалаций нет.
