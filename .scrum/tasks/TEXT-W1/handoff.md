# Text Review W1 — handoff

> **Context:** `status: ready-for-review` · `updated: 2026-11-28` ·
> `owner: Copywriter` · `task: Text Review W1` ·
> `change: No spec change: copy only` · branch `task/text-review-w1` ·
> PR [#83](https://github.com/seshmonke/localhand/pull/83).
> links: [report](report.md) ·
> [audit](../../reviews/text-site-audit.md) ·
> [program](../../../docs/tasks/text-review.md).

## Следующему

1. Reviewer не-автора: повторное ревью PR #83 после REQUEST_CHANGES —
   e2e-локаторы, money-строка и evidence/audit исправлены; сверить с AC
   text review и `.scrum/reviews/text-site-audit.md`.
2. Владелец task: merge squash после `reviewed`; повторный `pnpm verify`
   после merge. Локальный e2e-гейт — `pnpm test:e2e` (13 passed,
   `evidence/e2e.txt`).
3. W2: начать с устаревших roadmap-обещаний и claims о комиссии/трафике
   (`MarketplacePage`, `ProductPage`, `LoginPage`, `ProductFormFields`).
   Ценовые claims — только после подтверждения владельца/юриста.
4. W3: публичные docs и процессные README; OpenSpec — read-only.
5. Не забыть: `slop-check` на изменённых файлах, baseline — в
   `evidence/slop-check-baseline.txt`; axe входит в e2e
   (`a11y.spec.ts`, `delivery-a11y.spec.ts`, `payments-a11y.spec.ts`).

## Открытые вопросы

- «Без комиссии с продаж» на главной: подтверждено владельцем? Если нет —
  убрать до W2.
- «Мгновенная ссылка для цифрового товара»: есть ли гарантия мгновенной
  выдачи? Если нет — переписать.
- «Города РФ — Все»: заменить на фактическое покрытие.
