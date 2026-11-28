# Sprint 3 retro — money-path

Дата: 28.11.2026.

## Что сработало

- Ревью не-автором ловило реальные T2-дефекты до merge: starvation
  reconcile, multi-shop-изоляция, manual-guard, PII в `err`, слабые
  mutation-тесты.
- TDD/evidence по каждому срезу; split больших PR на последовательные
  ветки.
- OpenSpec change вёл поведение: quote/shipment/manual/reconcile/events
  закреплены сценариями.
- E2E/axe/LCP как финальный гейт: browser flow, 24 axe-скана,
  preview LCP <2500.
- Решение владельца по PR-лимиту (600 code+tests, evidence вне
  подсчёта) убрало двусмысленность.

## Что не сработало

- `.scrum` отставал от main: PR #47–#62 были влиты, реестр показывал
  planning; пришлось сверять и дописывать events/board/daily.
- PR-size ambiguity: цельные T2-фиксы дробились, #65 потребовал
  owner-исключения.
- CI main один раз упал на флейке `CheckoutPage` replay-навигации;
  rerun зелёный, дефлейк — backlog P1.
- Слишком много параллельных PR в конце спринта: merge train и
  evidence-конфликты (A/B, D3).
- 3.1 shipment RED был retrospective: код существовал до тестов
  (наследие handoff). Owner 28.11.2026 дал named exception до Q1.1/
  Sprint 4; TDD-first audit/repro — PBI Sprint 4.

## Действия

1. **Owner:** обновить скилл scrum-crew до v0.5.0 отдельным PR сразу
   после закрытия (safe point: `sprint: null`, чистое дерево).
2. **Sprint 4:** S3-3 order lifecycle + S3-4 hardening + Q1.1/Q1.2;
   не смешивать с live-интеграциями.
3. **Owner-гейты:** ЮKassa adapter/keys, CDEK contract/live PII,
   юрпакет, Selectel deploy/SMS — до публичного MVP.
4. **Дефлейк:** `CheckoutPage` replay-навигация (P1 backlog), 20 полных
   web-suite + CI перед Sprint 4 close.
5. **Процесс:** состояние писать в том же PR/цикле, где merge; evidence
   не раздувать, лимит 600 code+tests; TDD-first для нового кода.

## Проверка прошлых действий

- LCP lab/preview proxy v1 — принят и применён; field RUM — backlog до
  публичного запуска.
- Layout system — в main, e2e 320/768/1440 зелёные.
- S3-1/S3-2 live smoke — остаётся owner-гейтом, не забыт в backlog.

## Метрики

- Merged PR: #63–#79 (S3-2 delivery + close), 17 PR.
- Tests на close: shared 161, web 220, API 394; browser e2e 13;
  axe 24×0; preview LCP 580/756/928 ms.
- OpenSpec: changes `06`/`07` archived; 9 specs, 0 active changes.
- Rework: P1 starvation/multi-shop/manual-guard/PII audit найдены
  ревью и исправлены до merge; TDD-first долг 3.1 — Sprint 4.
