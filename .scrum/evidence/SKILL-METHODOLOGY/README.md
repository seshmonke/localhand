# SKILL-METHODOLOGY: evidence

Правка процесса Sprint Crew по `docs/quality/methodologies.md`.
Базовая точка: `origin/main` `72bfbd5` (27.11.2026).

## Gap-аудит до правки

Команда:

```bash
grep -Rni --include='*.md' '<term>' .opencode/skills/sprint-crew
```

| Термин | Вхождений | Где |
|---|---:|---|
| `Tier` | 0 | нет |
| `ATDD` | 1 | `references/roles.md` |
| `TDD` | 9 | только `references/roles.md` |
| `mutation` | 5 | только `references/roles.md` |
| `threat` | 3 | только `references/roles.md` |
| `SLO` | 2 | только `references/roles.md` |
| `debt` | 0 | нет |
| `postmortem` | 0 | нет |

Вывод: `SKILL.md`, цикл, шаблоны и OpenSpec не проводили Tier,
RED/ATDD и T2-артефакты; долг и postmortem отсутствовали как класс.

## Артефакты

- `baseline.md` — RED-прогон до правки.
- `post-change.md` — GREEN/REFACTOR после правки.
