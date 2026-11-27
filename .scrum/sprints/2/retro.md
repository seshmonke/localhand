# Retro: Спринт 2

## Что сработало

- Buyer-core вертикальный срез: catalog → cart → checkout → orders →
  seller orders.
- Независимый reviewer нашёл реальные P1/P2: NUL q, overflow 320,
  nested-interactive, SMS-preflight, LCP gate, PII в скриншотах.
- Browser e2e и axe дали доказательства, а не «на глаз».
- Authz/no-store/PII-логи проверены на API и UI.

## Что мешало

- Крупные PR (S2-3 UI ~2.3k строк), долгие ревью.
- Много раундов docs/state/evidence, PII-скриншоты переделывались.
- Playwright/axe появились только в S2-4; ранее — ручные скрипты.
- Не было layout-системы: сетка/отступы/высоты контролов разъехались.
- Несколько раз запускал новых worker’ов вместо продолжения сессии —
  лишний контекст.

## Действия

| Действие | Owner | Когда проверим |
|---|---|---|
| Lean mode: 1 feature-PR на PBI, 1 review + пакет фиксов, 1 close-PR | orchestrator | Sprint 3 |
| Layout system PBI: PageShell/Container/Grid/Stack/Sidebar/Card, 12 колонок, 8pt, overlay/screenshot | orchestrator | сразу после Sprint 2 |
| Browser e2e + axe в CI (или явный локальный гейт) | orchestrator | Sprint 3, цикл 1 |
| Field RUM/LCP p75 | orchestrator | до публичного запуска |
| PII-скриншоты проверять до коммита; unit-тесты на layout-инварианты | orchestrator | Sprint 3 |

## Проверка прошлых действий

- [x] Lean mode из ретро S1 — согласован владельцем, применяем в Sprint 3.
- [x] E2E/axe добавлены в S2-4; в CI пока только API e2e.

## Метрики

- Sprint Goal: достигнут.
- Cycle time: 4 цикла, ~2 часа 50 минут.
- Change fail rate: 0 откатов/красных `main`; P1 fixes до merge.
- Docs-PR: 3 закрытия (#27/#29/#32), 5 раундов REQUEST_CHANGES, все
  закрыты.
- Ceremony %: низкий, live-церемоний нет.
- Cost: бюджет не ограничен; 4 PBI, 5 code-PR (#26/#28/#30/#31/#33).
