## Задача / change

- PBI или OpenSpec change:
- Tier: T0 / T1 / T2
- Что меняется:
- Чего явно не делаем:

## Проверка

- [ ] `pnpm verify` — вывод и exit code приложены (включая `check:public`)
- [ ] Если менялось поведение — OpenSpec change валиден
- [ ] TDD evidence: RED-тест падал, GREEN прошёл (для T1/T2)
- [ ] Contract-тесты при изменении API/shared; для T2 — mutation/property
- [ ] Threat model/SAST обновлены для T2; SLO/логи для критического пути
- [ ] Скриншоты/видео для UI (320 и 1440), ПДн замазаны

## Ревью

- [ ] Автор ≠ ревьюер
- [ ] Ревьюер проверил спеку/AC и код
- [ ] Добавлен label `reviewed` (без него `review-gate` красный)

## Риски

- Деньги/ПДн/безопасность:
- Исключения из TDD/гейтов (owner, срок):
- Откат:
