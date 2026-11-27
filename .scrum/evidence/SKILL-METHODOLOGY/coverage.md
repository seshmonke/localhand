# Покрытие 10 практик + TDD

Источник политики — `docs/quality/methodologies.md`. Здесь только
проверка, что в скилле у каждой практики есть owner, артефакт и гейт.

| Практика | Owner | Артефакт в скилле | Гейт в скилле | Волна |
|---|---|---|---|---|
| TDD (база) | Worker, QA | `assets/task.md` TDD evidence; `assets/pr.md` | нет RED-evidence — merge запрещён | 1 |
| ATDD / BDD | QA, PO | `assets/task.md` Test plan; `assets/pr.md` ATDD; `references/openspec.md` tasks | нет AC без теста/ручного доказательства | 1 |
| Trunk-based + flags | Delivery, Architect | `references/git-quality.md`; карточка Delivery | PR < 400 или owner-исключение; флаг для неполной фичи | 2 |
| Contract + schema-first | Architect, Backend | T2 artifacts в `task.md`/`pr.md`; `openspec.md` design | contract change без contract-теста не мержится | 1 |
| Property + mutation | QA, Worker | T2 artifacts; карточки QA/Worker | property блокирует T2; mutation — nightly до Q1.0–Q1.6, затем ≥ 70% changed | 1 |
| Shift-left security | DevSecOps, White Hacker | threat model в T2 artifacts; карточки ролей | high/critical блокируют; SAST — ручной/исключение до Q1.0–Q1.6 | 1 |
| Observability | DevSecOps, Architect | T2 artifacts: SLO/логи/alert/RUM | SLO-дизайн/логи обязательны; alert/RUM — именованное исключение | 1 |
| Performance + load | QA, DevSecOps | `assets/sprint.md` Quality gates; карточка QA | LCP/API p95 в бюджете; load-сценарии | 2 |
| IaC + progressive delivery | DevSecOps | карточка DevSecOps; `assets/sprint.md` Quality gates | production только из IaC; rollback проверен | 3 |
| Technical debt | SM, PO | `assets/retro.md` Debt budget; `assets/sprint.md` Debt budget | P3 без owner/срока не создаётся | 3 |
| Postmortems + incidents | SM, DevSecOps | `assets/retro.md` Postmortems; close | P0/P1 без postmortem не закрывается | 2 |
