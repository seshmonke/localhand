# Review: PR #82 — text review wave plan

> **Context:** `status: done` · `updated: 2026-11-28` · `owner: reviewer` ·
> `sprint: — (Sprint 3 closed; Sprint 4 не начат)` ·
> `task: TEXT-REVIEW-PLAN` ·
> `change: No spec change: процессный план, поведение не меняется` ·
> links: [PR #82](https://github.com/seshmonke/localhand/pull/82) ·
> [INDEX](../../docs/tasks/INDEX.md) · [DoD](../../docs/quality/dod.md) ·
> [AGENTS.md](../../AGENTS.md)

## Инкремент

- Task: `TEXT-REVIEW-PLAN` — программа Text review, не PBI.
- PR: #82, base `db395e8`, head `8448f79` (merge-коммит после `6e0da69`).
- Change: `No spec change: docs/process, поведение не меняется`;
  OpenSpec change не требуется, архив не трогается.
- Brief/report/evidence задачи: N/A (owner-driven docs); источник —
  решение владельца 28.11.2026 в `docs/tasks/milestones.md:78-80` и PR body.
- Diff: 7 файлов, +118/−0; код, CI, зависимости и архивы не изменены.
- Preview: N/A.

## Проверки

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | shared 161, web 220, API 224 passed / 170 skipped; build; OpenSpec 9/9 |
| `pnpm exec openspec validate --all --strict` | 0 | 9 passed, 0 failed |
| `git diff --check main...FETCH_HEAD` | 0 | clean |
| `bash .opencode/skills/scrum-crew/scripts/slop-check.sh docs/tasks/text-review.md` | 0 | OK: slop not found |
| `slop-check.sh` по всем 7 изменённым файлам | **1** | `INDEX.md:7` — «в рамках»; `backlog.md:107` — «не просто»; строки не добавлены этим PR |
| `git diff --name-only main...FETCH_HEAD` | 0 | только docs/process; кода/CI/deps/archive нет |
| `test -f docs/design/content.md` | **1** | файла нет |
| `git status --short` | 0 | чисто до записи review-артефакта |

`pnpm verify` зелёный; API DB-suite skip — существующее локальное условие
(`DATABASE_URL_TEST` не задан), не ослабление этим PR.

## Блокирующие находки (3)

### P1 — text gate в DoD не применяется к T0 copy

- Файлы: `docs/quality/dod.md:8-11` и `:52-53`;
  `AGENTS.md:112-113` (в PR head); `.github/pull_request_template.md:16-17`;
  `docs/tasks/text-review.md:53-54`.
- Доказательство: DoD прямо говорит «Для T0 общий чеклист ниже не
  применяется» (`dod.md:11`), а новый text gate добавлен именно в общий
  чеклист (`dod.md:52-53`). T0 — это docs/copy без изменения поведения
  (`dod.md:4`), то есть как раз текстовые волны и этот PR. При этом
  `AGENTS.md:112-113` требует Copywriter review + `slop-check` для
  пользовательских/публичных текстов, а PR-шаблон — для user-facing copy.
  Три источника расходятся: T0 copy может пройти без text review, хотя
  правило и шаблон говорят обратное.
- Действие: добавить Copywriter review + `slop-check` в T0-строку DoD
  (`dod.md:8-11`) или явно исключить text gate из оговорки «общий чеклист
  не применяется»; синхронизировать PR-шаблон до «user-facing/публичные
  тексты» и указать, что T0 получает review, но не TDD.

### P2 — Inventory не покрывает заявленный скоуп

- Файлы: `docs/tasks/text-review.md:19-23` (скоуп) и `:43-44` (inventory);
  AC `:62`.
- Доказательство: скоуп включает `README`, `.scrum/README.md`, task
  brief/report, публичные docs и системные тексты; inventory ищет только
  `apps/web/src`, `docs`, `openspec/specs`, `.github`, `AGENTS.md`.
  Корневой `README.md` не лежит в `docs`; `.scrum/README.md` и
  task brief/report не лежат ни в одном из путей; `openspec/specs`
  инвентаризуется, но не отнесён ни к одной волне/строке скоупа;
  `apps/web/index.html` (и возможные `public`/dev-страницы) вне `src`.
  `command -v rg` → exit 1: команда `rg` в окружении не установлена,
  inventory-команда из плана не воспроизводится без замены на `grep -R`.
- Действие: расширить inventory (root `README.md`, `.scrum`,
  `apps/web/index.html` и dev/public-страницы, при необходимости `packages/*`) и
  смапить каждый источник на W1–W3; либо сузить скоуп. Заменить `rg` на
  доступную команду или зафиксировать зависимость.

### P2 — AC/evidence ссылаются на отсутствующий `docs/design/content.md`

- Файлы: `docs/tasks/text-review.md:68` и `:99`;
  `docs/design/README.md:5-7`; `roles.md:436,443`;
  `copywriting.md:243`.
- Доказательство: `test -f docs/design/content.md` → exit 1; в
  `docs/design/README.md` ссылки на файл нет; при этом AC требует
  «Глоссарий и voice зафиксированы», а Evidence говорит «Обновлённые
  `docs/design/content.md`». Роль Copywriter владеет этим файлом, но в
  W1–W3 нет шага «создать content.md»; W3 «100% docs» не может быть
  проверен без него.
- Действие: добавить создание `docs/design/content.md` в W3 с owner и
  evidence, сослаться на него из `docs/design/README.md`; в Evidence
  заменить «обновлённые» на «создан/обновлён».

## Non-blocking

### P2 — границы ролей для процессных docs и claims

- `docs/tasks/text-review.md:23` включает `.scrum/README.md` и
  task brief/report, но `roles.md:27` запрещает Copywriter писать
  README и чужие задачи; `roles.md:25` закрепляет README за SM.
  План не говорит, кто применяет правки: Copywriter даёт текст, SM/Worker
  пишет.
- `docs/tasks/text-review.md:75` отдаёт «юридические формулировки»
  PO/owner, тогда как `roles.md:453-455` оставляет юридическую
  допустимость заявления Legal; `copywriting.md:240-241` включает Legal
  в review claims. Добавить Legal/Privacy для регулируемых claims или
  явную эскалацию.
- `docs/tasks/text-review.md:4` — два владельца (Copywriter + SM) без
  разделения ответственности; AGENTS требует одного owner задачи.
  Действие: один owner программы + RACI/handoff для ролей.

### P2 — метрика `slop-check 0` не согласована с file-level скриптом

- `docs/tasks/text-review.md:82`: «Slop hits на изменённых файлах: 0»;
  `slop-check.sh:22` проверяет файл целиком. Изменённые этим PR
  `INDEX.md`/`backlog.md` уже содержат старые hits (`INDEX.md:7`,
  `backlog.md:107`), поэтому «0 на изменённых файлах» либо требует
  чинить старые строки, либо не выполняется. PR body проверяет только
  `text-review.md`.
- Действие: определить gate как «0 на новых/изменённых строках» либо
  зафиксировать baseline старых hits с owner/сроком; evidence — по всем
  затронутым файлам, не только новому.

### P2 — W1 Sprint 4 не согласован со списком кандидатов Sprint 4

- `docs/tasks/INDEX.md:37-39`: Sprint 4 не начат, кандидаты —
  `08-order-lifecycle`, `09-orders-pagination`, Q1.1/Q1.2; Text review в
  списке нет. При этом `INDEX.md:47-48`, `text-review.md:3`,
  `backlog.md:43` и `milestones.md:78-80` ставят W1 в Sprint 4.
- Действие: добавить Text review в кандидаты Sprint 4 или пометить
  «прогноз до Planning», чтобы план не читался как принятое обязательство.

### P3 — stale-метка `Sprint 3.` в milestones

- `docs/tasks/milestones.md:80`: запись от 28.11.2026 после закрытия
  Sprint 3 (`2f4ed4a`, 17:17 +0300) помечена «Sprint 3.»; план создан
  в 17:26 +0300, то есть после close. Это будущее/пост-спринт, не Sprint 3.
  Действие: `Sprint 4 planning` или `Post-sprint`.

### P3 — `No text change` vs `No doc change`

- `text-review.md:54,69`, `.github/pull_request_template.md:17` вводят
  `No text change`; `git-quality.md:54` и `assets/review.md:32` требуют
  `No doc change: <причина>`. Новый маркер не определён в процессных
  docs. Действие: связать маркеры (text change — про copy, doc change —
  про host-doc) или переиспользовать существующий.
- `text-review.md:54` допускает `No text change` без `<причина>`, тогда
  как AC `:69` и шаблон `:17` требуют причину. Действие: добавить
  `<причина>` в шаг 6.

### P3 — a11y/states не в PR-правилах текстовой волны

- `text-review.md:56-58`: скриншоты 320/1440 и ПДн, но нет axe/a11y для
  изменённых UI-состояний (error/empty/loading в скоупе `:19-21`).
  DoD T0 требует a11y, если UI (`dod.md:9`). Действие: добавить
  axe/клавиатуру в PR-правила или явно сослаться на DoD.

### P3 — trace и шапка

- Нет task/brief/report/evidence: PR не PBI; review-артефакт (этот файл)
  даёт task id. В PR body нет явного `No spec change` (Tier T0 указан в PR body). Для T0 это
  допустимо, но trace `task → change → PR → review → evidence` держится
  на owner-записи в `milestones.md:78-80`.
- Новый `docs/tasks/text-review.md` не имеет `> **Context:**`-шапки,
  которую migration 9.1 просил для новых/изменяемых доков (см. review #81,
  P3). Действие: добавить шапку со status/owner/sprint/change/links.

## Drift check

- [x] Старые имена/пути skill: `scrum-crew` v0.6.0; старого `sprint-crew`
  в изменённых docs нет.
- [x] Будущее как текущее: план помечен «программа», AC не отмечены;
  но W1 Sprint 4 — прогноз, не принятый Sprint 4 (см. P2).
- [x] Обещание теста без ссылки: обещаний тестов нет; `pnpm verify`
  проверен, exit 0.
- [x] Спека/код не разошлись: изменение только docs/process, OpenSpec
  9/9, архив не тронут.
- [ ] Copywriter review для публичного текста этого PR: не приложен;
  slop-check только на `text-review.md` (см. P1/P2).
- [x] `No doc change`: PR меняет docs, host-doc обновлён; новый
  `No text change` — см. P3.
- [x] Архивы не переписаны; code/CI/deps нет.
- [ ] `docs/design/content.md` — missing (см. P2).
- [x] Секреты/PII: в добавленных строках нет; `check:public` в `verify`
  exit 0.

## Вердикт

**REQUEST_CHANGES** — 3 блокирующих: P1 (DoD T0 не применяет text gate)
и два P2 (inventory не покрывает скоуп; отсутствует `content.md`).
P2/P3 non-blocking — роли/claims, метрика slop-check, кандидаты Sprint 4,
stale `Sprint 3.`, `No text change`, a11y, trace/шапка.

## Риск-итог

Функциональный риск низкий: PR docs-only, +118 строк, без кода/CI/
зависимостей; `pnpm verify` (включая `check:public`), OpenSpec 9/9 и
`git diff --check` зелёные; архив не переписан; откат — revert squash.
Процессный риск выше: text gate в текущей формулировке не покрывает T0
copy, inventory может пропустить поверхности, а AC/evidence ссылаются на
несуществующий `docs/design/content.md`. После трёх точечных правок
(DoD T0, inventory/скоуп, content.md) и синхронизации шаблона — повторный
review; код и security-гейты не затронуты.

---

## Re-review da44168 (2026-11-28)

- Head: `da44168`; base: `db395e8`; diff 9 files, +193/−5.
- Previous P1 закрыт: `docs/quality/dod.md:8-12` включает Copywriter review +
  `slop-check` в T0 и говорит «кроме text gate»; PR-шаблон
  (`.github/pull_request_template.md:16-17`) расширен до
  «пользовательских/публичных текстов».
- Previous P2 inventory закрыт частично: пути `README.md`, `AGENTS.md`,
  `apps/web/src`, `apps/web/index.html`, `docs`, `openspec/specs`,
  `.github`, `.scrum`; `grep -RIn`; mapping W1–W3. Но корневой `README.md`
  отсутствует (`test -f README.md` → 1), поэтому команда inventory
  `grep -RIn ... README.md` → exit 2. Это новый P2.
- Previous P2 content.md закрыт: `docs/design/content.md` создан,
  `docs/design/README.md:8` ссылается, W3/AC/Evidence обновлены.
  Ссылки `text-review.md ↔ content.md` резолвятся.
- Previous non-blocking: роли Copywriter/Legal/host owner добавлены;
  baseline slop-check добавлен; Sprint 4 candidate добавлен; milestones
  `Sprint 4 planning`; `No text change: <причина>` определён; a11y для
  error/empty/loading добавлен; context header добавлен.

### Blocking round 2 (3)

#### P2 — inventory ссылается на несуществующий корневой `README.md`

- Файл: `docs/tasks/text-review.md:27` (публичные docs, «корневой
  `README.md`») и `:48` (inventory `grep -RIn` по `README.md`).
- Доказательство: `test -f README.md` → exit 1; `git ls-files` не
  содержит корневого README; `grep -RIn "Local Hand" README.md ...` →
  exit 2 (`grep: README.md: No such file or directory`). План заявляет
  «`rg` не требуется», но inventory-команда не воспроизводится без
  ошибки. W3 «100% публичных docs» включает файл, которого нет.
- Действие: либо создать корневой `README.md` отдельной задачей/PR и
  добавить его в evidence, либо убрать его из скоупа/inventory и
  использовать существующий `AGENTS.md`/`docs/*/README.md`; команда
  inventory должна проверять существование путей.

#### P2 — скоуп `.scrum/sprints/**`/`docs/tasks` противоречит «старые спринты вне скоупа»

- Файлы: `docs/tasks/text-review.md:28` и `:30-31`.
- Доказательство: scope включает `docs/tasks` и
  `.scrum/sprints/**/tasks/**` (все спринты), non-goals/вне скоупа
  исключают «архивные changes и старые спринты». Это одновременно
  включает и исключает исторические sprint/task docs; W2–W3 «100%»
  невозможно проверить без уточнения.
- Действие: сузить до текущего/активного спринта
  (`.scrum/sprints/<active>/tasks/**`, активные `docs/tasks/*.md`) или
  явно разрешить review старых sprint docs и убрать их из non-goals.

#### P2 — text gate не применён к публичному тексту самого PR

- Файлы: `docs/design/content.md` (новый публичный текст),
  `docs/tasks/text-review.md:16-18, 62-63`, `AGENTS.md:112-113`,
  `docs/quality/dod.md:8-12`.
- Доказательство: PR body заявляет только `slop-check` на плане и
  `content.md`; Copywriter review (не-автора) не приложен, `reviews: []`.
  При этом `content.md` — публичный docs W3, а новый gate требует
  Copywriter review + `slop-check` для T0 user/public текста. Это первый
  публичный текст, к которому gate должен примениться; без verdict
  «T0 copy реально проходит gate» не доказан.
- Действие: приложить Copywriter review (не-автора) на `content.md` и
  план или записать owner-approved baseline/исключение с причиной; после
  этого gate можно считать работающим.

### Non-blocking round 2

- P3 — `docs/tasks/text-review.md:1` (`owner: Copywriter + SM`) и `:9`
  («Владельцы») всё ещё два owner; ответственность разделена, но header
  должен называть одного accountable owner, иначе правило «один owner»
  читается неоднозначно.
- P3 — `content.md` содержит voice/глоссарий/«Не писать», но не
  do/don't-примеры из `roles.md:443`; добавить примеры или пометить
  baseline и расширение в W3.
- P3 — `text-review.md:75` и `backlog.md:41` всё ещё «slop-check 0 на
  изменённых», а `text-review.md:96` — «на новых/изменённых строках;
  baseline не регрессия». Привести AC/backlog к метрике.
- P3 — gate продублирован в AGENTS/DoD (T0 + общий)/PR-шаблоне/
  text-review/content.md; формулировки расходятся: «не-автора» есть в
  плане/контенте, но не в DoD/шаблоне; «user-facing» vs
  «пользовательские/публичные». Один source + ссылки уменьшат drift.
- P3 — `text-review.md:63` шаг 6 всё ещё `No text change` без
  `<причина>`, хотя `:68` и AC `:81` требуют причину.
- P3 — mapping `:52-53` не покрывает system texts (SMS/validation/
  dev/404) и process docs (`.scrum`, `openspec`); таблица `wave` должна
  дать это явно.
- P3 — `INDEX.md:47-48` говорит «все пользовательские и публичные
  тексты», но план включает процессные docs; summary уже, чем скоуп.
- P3 — `content.md:46` перечисляет сроки/цены/гарантии, но не
  «бесплатно/безопасно» из `text-review.md:43`; claims baseline неполон.
- P3 — `content.md:3` `status: active` при `text-review.md:8` `status:
  plan`; baseline создан раньше W3, AC `:79-80` всё ещё относит его к W3.
  Пометить baseline созданным, W3 — ревизия.
- P3 — `text-review.md:28` включает `openspec/specs` в W2–W3; specs
  меняются только через `openspec archive` (AGENTS), а T0-PR не делает
  spec change. Пометить specs read-only или вынести правки в OpenSpec
  change, иначе text review нарушит процесс.

### Проверки round 2

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | shared 161, web 220, API 224 passed / 170 skipped; build; OpenSpec 9/9 |
| `pnpm exec openspec validate --all --strict` | 0 | 9 passed, 0 failed |
| `git diff --check main...FETCH_HEAD` | 0 | clean |
| `slop-check.sh docs/tasks/text-review.md docs/design/content.md` | 0 | OK |
| `slop-check.sh` по остальным изменённым docs | **1** | старые hits `INDEX.md:7`, `backlog.md:107`; baseline, не регрессия |
| `grep -RIn "Local Hand" README.md ...` | **2** | корневого README нет |
| `test -f README.md` | **1** | отсутствует |
| `test -f docs/design/content.md` | 0 | существует |
| link-check изменённых docs | 0 | новых битых ссылок нет; только старый placeholder `01-….md` в HTML-комментарии INDEX |
| `git diff --name-only main...FETCH_HEAD` | 0 | 9 docs/process; кода/CI/deps/archive нет |

### Вердикт round 2

**REQUEST_CHANGES** — previous P1/P2 закрыты, но три новых P2:
несуществующий корневой `README.md` ломает inventory-команду;
`.scrum/sprints/**`/`docs/tasks` противоречат «старые спринты вне
скоупа»; публичный `content.md` этого PR не имеет Copywriter review. P3 — owners, do/don't-примеры, метрика/AC, дубли gate,
`No text change` без причины, mapping, INDEX summary, claims baseline.

### Риск-итог round 2

Функциональный риск по-прежнему низкий: docs-only, +193/−5, `verify`/
OpenSpec/diff-check зелёные, архив не тронут, код/CI/deps не менялись;
откат — revert squash. Процессный риск: inventory не запускается из-за
отсутствующего README и скоуп включает исторические артефакты; это может
дать ложное «100%» или лишнюю работу. После двух точечных правок —
повторный review.

---

## Copywriter review 3ac32e6 (Copywriter hat, не автор)

**Вердикт: PASS** — тексты плана и `content.md` готовы к использованию;
P1/P2 по голосу, глоссарию и anti-slop нет.

Проверено:
- `docs/tasks/text-review.md`: цель, scope, W1–W3, gate, роли, метрики,
  non-goals, evidence. Голос сухой, деловой; нет штампов, восклицаний,
  CAPS, эмодзи; обещания ограничены фактами.
- `docs/design/content.md`: профиль 7/5/4/2/9/1/3/2 совпадает с
  `copywriting.md`; глоссарий совпадает с планом; «Так/Не так»,
  anti-slop, claims и Text review gate на месте.
- `AGENTS.md`, `docs/quality/dod.md`, `.github/pull_request_template.md`:
  формулировка «Copywriter review не-автора + slop-check» понятна;
  `No text change: <причина>` определён.
- `slop-check` на плане и `content.md` — exit 0; ручное чтение не нашло
  слопа, канцелярита, ложных обещаний, смешения терминов.

P3 (не блокируют):
- `docs/quality/dod.md:53` — общий чеклист говорит «Copywriter review» без
  «не-автора»; T0 `:10`, AGENTS, шаблон и `content.md:54-55` уже говорят
  «не-автора». Добавить слово для полной синхронизации.
- `docs/tasks/text-review.md:81` — AC W1 «slop-check 0 на изменённых», а
  метрика `:102-103` — «на новых/изменённых строках; baseline отдельно».
  Привести AC к метрике; `backlog.md:41` уже исправлен.
- `docs/tasks/text-review.md:33-34` — «Корневой `README.md` появится
  отдельной задачей» без task id/owner/срока. Либо ссылка на задачу, либо
  нейтральная формулировка «вне скоупа до появления».
- `docs/tasks/text-review.md:28` — `docs/tasks/*.md` (активные/индексы)
  всё ещё глоб шире, чем «исторические docs вне скоупа»; перечислить
  активные файлы или `docs/tasks/{INDEX,backlog,milestones,quality-wave-1,text-review}.md`.
- `content.md:35-36` — определения «сторона, которая продаёт/покупает»
  звучат юридически; проще: «человек или бренд, который продаёт» /
  «тот, кто покупает». `content.md:40` — «(это другое)» разговорно;
  «это другой формат» точнее.
- Термины «text gate» (DoD) и «Text review gate» (content) — выбрать один;
  «text gate» встречается и в AC плана.

## Final review 3ac32e6

- Head: `3ac32e6`; base: `db395e8`; diff 9 files, +203/−5.
- Previous P2 root README: закрыт — корневой README убран из inventory;
  `grep -RIn` по `AGENTS.md`, `apps/web/src`, `apps/web/index.html`,
  `docs`, `openspec/specs`, `.github`, `.scrum` → exit 0; root README
  явно future/out of scope.
- Previous P2 historical sprint/task docs: закрыт по сути — scope narrowed
  to `docs/tasks/*.md (активные/индексы)` + текущий `.scrum` workspace;
  остаётся P3 на точность глоба.
- Previous P2 `openspec/specs`: закрыт — read-only, правки только через
  OpenSpec change/archive.
- Previous P2 Copywriter review: закрыт этой секцией — PASS, не автор.
- Предыдущие P3: owner один (SM; voice reviewer Copywriter), examples и
  claims в content, metric baseline, mapping W1–W3, INDEX summary,
  `No text change: <причина>`, context header — закрыты.
- P1/P2 round 3: нет. Открытые P3 — DoD non-author wording, AC slop
  wording, root README promise, `docs/tasks/*.md` precision, content
  style/terms, text gate naming.
- PR body: `No spec change` присутствует; scope честный: docs/process,
  без code/CI/deps; архивы не переписаны.

### Проверки round 3

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | shared 161, web 220, API 224 passed / 170 skipped; build; OpenSpec 9/9 |
| `pnpm exec openspec validate --all --strict` | 0 | 9 passed, 0 failed |
| `git diff --check main...FETCH_HEAD` | 0 | clean |
| `slop-check.sh docs/tasks/text-review.md docs/design/content.md` | 0 | OK |
| `slop-check.sh` по остальным изменённым docs | **1** | старые hits `INDEX.md:7`, `backlog.md:107`; baseline, не регрессия |
| inventory `grep -RIn "Local Hand" ...` | 0 | 39 hits; missing paths нет |
| `test -f README.md` | 1 | корневого README нет; вне inventory/future |
| `test -f docs/design/content.md` | 0 | существует |
| link-check изменённых docs | 0 | новых битых нет; только старый placeholder `01-….md` в HTML-комментарии INDEX |
| `git diff --name-only main...FETCH_HEAD` | 0 | 9 docs/process; кода/CI/deps/archive нет |

### Финальный вердикт

**APPROVE** — P1/P2 нет; P3 не блокируют. Copywriter PASS; gate
синхронизирован в T0/template/AGENTS, публичный `content.md` получил
Copywriter review; scope docs/process, `No spec change` есть; verify/
OpenSpec/diff/slop-check/inventory пройдены; код, CI, зависимости и
архивы не тронуты.

### Риск-итог

Функциональный риск низкий: docs-only, +203/−5; `pnpm verify` (включая
`check:public`), OpenSpec 9/9 и `git diff --check` зелёные; архив не
переписан; откат — revert squash. Остаточный риск — навигационный:
P3-формулировки DoD/AC, future root README без ссылки, широкий
`docs/tasks/*.md` и стилевые термины. Они не меняют поведение и не
ослабляют TDD/CI/security.
