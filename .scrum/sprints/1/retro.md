# Retro: Спринт 1

## Что сработало

- Вертикальные срезы auth → shop → products → UI; каждый PBI独立
  проверялся e2e/DB-тестами.
- Независимый reviewer находил реальные P1/P2: trustProxy, blocked
  authz, cross-account cache, mobile card overlap.
- Evidence в репо: verify-лог, скриншоты 320/1440, axe raw, SHA/PR.
- OpenSpec strict + archive; specs стали текущей правдой.

## Что мешало

- Много раундов docs/state-ревью из-за рассинхрона cycle/status/evidence.
- Крупные PR (1000–2000 строк) при ориентире 400.
- axe/contrast и dark theme потребовали нескольких итераций.
- Локальные Playwright-скрипты жили вне репо; версия браузера не совпадала.
- Часть P3 всплыла в конце (OTP cleanup, rate-limit store, perf).

## Действия

| Действие | Owner | Когда проверим |
|---|---|---|
| Добавить Playwright e2e + axe light/dark в CI (`test:e2e`), не только локально | orchestrator | Sprint 2, цикл 2 |
| Docs/state закрывать одним чек-листом и обновлять один источник статуса | orchestrator | Sprint 2, каждый merge |
| Дробить UI-PBI на PR ≤ 600 строк с самого начала | PO/orchestrator | Sprint 2 planning |
| Вести evidence с первого цикла, не в конце | orchestrator | Sprint 2, цикл 1 |
| Закрыть carry-over S1-5 (OTP cleanup, rate-limit store, logout trade-off) | orchestrator | Sprint 2/3 |

## Проверка прошлых действий

- [ ] Действий из ретро 0 нет (первый спринт).

## Метрики

- Sprint Goal: достигнут.
- Cycle time: 6 циклов, ~3 часа от старта до архива.
- Change fail rate: 0 code-регрессий после merge; 4 docs-ревью с
  REQUEST_CHANGES (state/evidence), все закрыты.
- Ceremony %: низкий, live-церемоний не было; дейли async.
- Cost per merged task: бюджет не ограничен; 6 PBI/PR (без docs).
