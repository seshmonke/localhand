# Sprint 3: money-path

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: 3` · `task: —` · `change: 07-delivery (archived)` ·
> links: [review](review.md) · [retro](retro.md) ·
> [daily](daily.md) · [INDEX](../../../docs/tasks/INDEX.md)

## Goal

Покупатель оплачивает заказ на сайте продавцу в тестовом контуре
ЮKassa, продавец видит оплату, оформляет отправление СДЭК и ведёт заказ
до трек-номера и статуса доставки. Реальные деньги, ключи и ПДн
покупателей в спринте не используются.

## PBI и trace

| Task | Change | PR | Review | Evidence | Status |
|---|---|---|---|---|---|
| S3-1 payments sandbox | `06-payments` → archive `2026-11-27-06-payments` | #39/#41/#45 | [review.md](review.md) | `evidence/S3-1-*` | done |
| S3-2 delivery test contour | `07-delivery` → archive `2026-11-28-07-delivery` | #47–#79 | [review.md](review.md) | [tasks/S3-2/evidence/](tasks/S3-2/evidence/) | done |
| S3-3 order lifecycle | `08-order-lifecycle` | — | — | — | deferred Sprint 4 |
| S3-4 hardening | `09-orders-pagination` | — | — | — | deferred Sprint 4 |

## Итоги

- Sprint 3 закрыт 28.11.2026; review ACCEPT по S3-1/S3-2.
- `07-delivery` заархивирован; `openspec validate --all --strict` 9/9,
  active changes 0.
- S3-3/S3-4 перенесены в Sprint 4 решением владельца.
- Live YooKassa/CDEK, юрпакет, production deploy/SMS, field RUM —
  внешние owner-гейты.

## Гейты

- `pnpm verify` exit 0; shared 161, web 220, API 394.
- Browser e2e 13 passed; axe 24×0; preview LCP 580/756/928 ms.
- TDD 3.1 — owner named exception до Q1.1/Sprint 4 (retrospective RED,
  mutation/e2e evidence); PBI TDD-first audit в backlog.

## Ссылки

- [review.md](review.md), [retro.md](retro.md), [daily.md](daily.md)
- [S3-2 task workspace](tasks/S3-2/)
- [archive 07-delivery](../../../openspec/changes/archive/2026-11-28-07-delivery/)
