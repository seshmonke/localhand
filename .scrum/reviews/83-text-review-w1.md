# Review: PR #83 — copy(web): W1 checkout, payment, delivery, orders

> **Context:** `status: approved` · `updated: 2026-11-28` ·
> `owner: reviewer (Copywriter hat, не автор)` · `tier: T0` ·
> `task: TEXT-W1` · `change: No spec change: copy only` ·
> `base: main@041cfa0` · `head: 4f2bc41` · branch `task/text-review-w1` ·
> links: [PR #83](https://github.com/seshmonke/localhand/pull/83) ·
> [audit](../reviews/text-site-audit.md) · [report](../tasks/TEXT-W1/report.md) ·
> [handoff](../tasks/TEXT-W1/handoff.md) · [DoD](../../docs/quality/dod.md) ·
> [voice/glossary](../../docs/design/content.md) ·
> [program](../../docs/tasks/text-review.md)

## Инкремент

- Task: `TEXT-W1` — W1 текстовой волны, не PBI и не sprint task;
  workspace `.scrum/tasks/TEXT-W1/` вне Sprint 4 (Sprint 4 не начат).
- PR: #83, base `041cfa0`, head `4f2bc41` (3 коммита).
- Change: `No spec change: copy only`; поведение, API, authz, статусы
  состояний и коды ошибок не менялись; OpenSpec/archive не трогались.
- Diff: 17 файлов, +821/−57. Код+тесты: 10 файлов, +60/−57 = 117 строк;
  docs/audit/evidence +704. Лимит 600 не превышен.
- Evidence: `.scrum/tasks/TEXT-W1/evidence/` (web-test, verify, slop
  baseline/after); аудит — `.scrum/reviews/text-site-audit.md`.
- Preview: N/A (T0 copy; визуальная структура не менялась).

## Вердикты

- **Copywriter: CHANGES.** Голос и глоссарий в целом выдержаны, новых
  ложных обещаний в W1 не найдено, ошибки не смягчены, a11y-label не
  сломан. Но в money-строке есть грамматическая ошибка и абсолютное
  обещание (`OrderPage.tsx:169`), а аудит обосновывает правки правилами
  глоссария, которых в `docs/design/content.md` нет.
- **Scrum: REQUEST_CHANGES.** 3 блокирующих: P1 — 3 e2e-спеки не
  обновлены под новые строки; P2 — money-строка; P2 — целостность
  evidence/audit (битые ссылки, выдуманные ссылки на глоссарий,
  невоспроизводимые счётчики, устаревший статус PR).

## Проверки (команды и exit)

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` (head `4f2bc41`) | 0 | typecheck, lint, format, check:public (662 files), shared 161, web 220, API 224 passed / 170 skipped, build, OpenSpec 9/9 |
| `openspec validate --all --strict` (в составе verify) | 0 | 9 passed, 0 failed |
| `pnpm --filter @localhand/web test` (повтор) | **1** | 219/220: `ProductCard.test.tsx` — `TestTimeoutError: 5000ms` (23.8 s); файл не в диффе |
| `pnpm --filter @localhand/web exec vitest run src/components/ProductCard.test.tsx` | 0 | 4/4; флейк окружения, не регрессия PR (см. P3) |
| `bash slop-check.sh` по 12 W1-файлам | **1** | только `PUNCT` (код TSX); лексических хитов 0 |
| `bash slop-check.sh` по 33+`index.html` (head) | **1** | только `PUNCT` (21 файл); лексических хитов 0 |
| `bash slop-check.sh` по base `041cfa0` | **1** | единственный `SLOP` — `CheckoutPage.tsx:52` «уникальных»; baseline подтверждён |
| link-check audit/report/handoff | **1** | 4 битые относительные ссылки в report/handoff (см. P2) |
| `git diff --check 041cfa0..HEAD` | **2** | только trailing whitespace в сыром `evidence/verify.txt`; в коде чисто |
| `git diff --name-only` (docs/openspec/CI/deps) | 0 | `docs/`, `openspec/`, `.github/`, lockfile, package.json не тронуты |
| `pnpm test:e2e` | не запускал | нужен локальный стенд (web 5173 + API 3000 + DB); падение 3 локаторов детерминировано (см. P1) |

## Блокирующие находки (3)

### P1 — 3 e2e-спеки не обновлены под новые строки

- Файлы:
  - `apps/web/e2e/delivery-flow.spec.ts:268` — `getByLabel("Трек-номер")`;
  - `apps/web/e2e/payments-flow.spec.ts:82` — `getByText("Оплата не подключена")`;
  - `apps/web/e2e/buyer-flow.spec.ts:119` — `getByText("Оплата не подключена")`.
- Доказательство:
  - `AdminDeliveryCard.tsx:408` — `label="Трек"`; строки `Трек-номер` в
    production-компоненте нет (`grep` → 0). Локатор Playwright не найдёт
    элемент.
  - `OrderPage.tsx:152` — для `payment === null` теперь «Оплата ещё не
    начата»; `OrderPage.tsx:501` («Оплата не подключена») рендерится
    только после `seller_payment_unavailable`, то есть после клика
    «Оплатить». В `payments-flow` клика ещё не было.
  - `OrdersPage.tsx:219` — `emptyLabel="Оплата не начата"`; в
    `buyer-flow` продавец без платёжного аккаунта, платёжной строки нет,
    поэтому показывается именно `emptyLabel`, а не `showUnavailable`.
  - `pnpm verify` e2e не запускает (CI `verify` — только unit/API/build),
    поэтому PR остаётся зелёным в CI, но ручной гейт `pnpm test:e2e`
    (13 passed в S3) станет красным.
- Действие: обновить 3 локатора/строки, прогнать полный
  `pnpm test:e2e`, приложить лог в `evidence/`. Это также восстановит
  a11y-прогон (`a11y.spec.ts`, `delivery-a11y.spec.ts`,
  `payments-a11y.spec.ts`), который входит в тот же гейт.

### P2 — money-строка с грамматической ошибкой и абсолютным обещанием

- Файл: `apps/web/src/pages/OrderPage.tsx:169`.
- Текст: «Исход создания платежа неизвестен. Повторите оплату — второе
  списание не создастся.»
- Доказательство: «списание не создастся» — не по-русски (создать можно
  платёж/попытку, а не списание); одновременно это более сильное
  обещание, чем прежнее «тот же ключ не создаст второе списание»:
  механизм идемпотентности из текста убран, гарантия осталась.
  Для payment-экрана это худший класс правки: грамматика + деньги.
- Действие: «Повторите оплату — повторного списания не будет.» (сохраняет
  смысл идемпотентности) или «Повторите оплату: деньги не спишутся
  дважды.» После правки — unit-тест на строку.

### P2 — evidence/audit недостоверны и ссылки битые

- Файлы:
  - `.scrum/tasks/TEXT-W1/report.md:8-9`, `.scrum/tasks/TEXT-W1/handoff.md:7-8`
    — после переноса workspace из `sprints/4/tasks/...` в `.scrum/tasks/`
    относительные ссылки не пересчитаны: `../../../../../docs/...` и
    `../../../../reviews/...` ведут за пределы репозитория (4 битые
    ссылки; link-check exit 1). В `.scrum/README.md:57-58` битая ссылка —
    провал гейта.
  - `.scrum/reviews/text-site-audit.md:80`, `:130`, `:163`, `:166` —
    «glossary: посылка → доставка», «glossary: заявки → заказы».
    В `docs/design/content.md:34-42` таких запретов нет: «посылка» —
    определение термина «Отправление», запрещён «шипмент»; для «Заказа»
    запрещён «ордер», не «заявка». Обоснование правок выдумано.
  - `.scrum/reviews/text-site-audit.md:21-23`, `:54`, `:460` —
    счётчики не воспроизводятся: «405 строковых литералов» при
    механическом подсчёте по тем же 33+`index.html` — 488 вхождений /
    437 строк / 373 уникальных значения; «32 строки в 7 production-файлах»
    — реально изменены 6 production-файлов (7-й, `SellerPaymentsCard`,
    только просмотрен); «17 production-файлов W2» — в таблице 20.
  - `.scrum/tasks/TEXT-W1/report.md:3` (`status: done`) против
    `handoff.md:3` (`status: ready-for-review`); `report.md:102-105`
    («PR не создан») противоречит PR #83; `report.md:42-45` («Тесты
    обновлены») не упоминает 3 сломанные e2e-спеки.
- Действие: починить 4 ссылки (`../../../docs/...`, `../../reviews/...`),
  привести обоснования к фактическому `content.md` (или сначала добавить
  правило в глоссарий отдельным PR), пересчитать счётчики скриптом и
  указать метод, синхронизировать статус report/handoff с PR #83.

## Non-blocking

### P3 — дубль статуса canceled/failed

- `apps/web/src/pages/OrderPage.tsx:255-260`: заголовок «Оплата
  отменена»/«Оплата не прошла», затем тело «Платёж отменён»/«Платёж не
  прошёл». Правка убрала противоречие, но оставила повтор статуса,
  против собственного правила «один факт — одно место» (аудит §6.10).
  Действие: тело начать с «Можно попробовать снова или связаться с
  продавцом.»

### P3 — глоссарий W1 не доведён

- `apps/web/src/pages/CheckoutPage.tsx:569` — «вы отправляете заявку
  продавцам»; в том же PR «заявки» заменены на «заказы» в Orders/
  AdminOrders. Если «заявка» — нарушение, оно осталось в W1; если нет —
  уберите «glossary: заявки → заказы» из аудита.
- Одно состояние подписано тремя способами: «Оплата ещё не начата»
  (`OrderPage.tsx:152`), «Оплата не начата» (`OrdersPage.tsx:219`),
  «Платёж не начат» (админка, аудит `:152`). Для buyer-экранов выбрать
  один вариант.

### P3 — устаревшее имя теста

- `apps/web/src/pages/OrdersPage.test.tsx:176` — тест всё ещё называется
  `does not turn a payment read error into 'payment not connected'`,
  хотя строка теперь «Оплата не начата». Переименовать, чтобы имя не
  врало.

### P3 — a11y

- `AdminDeliveryCard.tsx:408` — label «Трек» остаётся связанным с input
  (`htmlFor`), hint «Латинские буквы, цифры и дефис.» — через
  `aria-describedby`; сломанного label нет. Но T0 DoD требует a11y для
  UI, а axe/320/1440 evidence в PR нет. После починки e2e приложить
  прогон `a11y`-спек (или явно зафиксировать N/A с причиной «только
  строки, DOM не менялся»).

### P3 — flaky web-прогон

- Повторный `pnpm --filter @localhand/web test` дал 1/220 timeout в
  `ProductCard.test.tsx` (5 s при 23.8 s), файл вне диффа; отдельный
  прогон — 4/4, `pnpm verify` — 220/220. Это существующая
  чувствительность jsdom к ресурсам, не регрессия PR; evidence
  `web-test.txt` (220/220, exit 0) правдоподобен, но воспроизводится не
  каждый раз. Завести отдельный P3-долг на timeout/пул, не чинить в
  этом PR.

### P3 — гигиена evidence/процесса

- `.scrum/tasks/TEXT-W1/evidence/slop-check-after.txt` не содержит
  `exit=1`, в baseline — содержит; добавить код выхода.
- `git diff --check` exit 2 только из-за trailing whitespace в сыром
  `evidence/verify.txt`; в коде чисто. Либо не гонять diff-check по
  evidence, либо обрезать пробелы.
- PR body не содержит `No doc change: <причина>` (есть только
  `No spec change`); для T0 docs-host не менялись — добавить маркер.
- Ветка `task/text-review-w1` без `NN`; board/state задачу `TEXT-W1` не
  знают; workspace `.scrum/tasks/` не описан в `.scrum/README.md`
  (там `.scrum/sprints/NN/tasks/<id>/`). Это owner-driven работа вне
  спринта, но конвенцию нужно зафиксировать одной строкой.

## AC / evidence

| AC | Итог | Доказательство |
|---|---|---|
| Inventory 33 production + `index.html` | PASS | `grep` по 35 файлам минус 2 dev-only = 33; W1 13 + W2 20 |
| 405 литералов / ~430 фрагментов | P3 | не воспроизводится (488/437/373); метод не описан |
| W1 100% просмотрено | PASS с P3 | таблицы §3.1–3.9; остались «заявку», три подписи одного состояния |
| W1 голос 7/5/4/2/9/1/3/2, глоссарий, anti-slop | PASS с P2 | `docs/design/content.md:7-16`; slop-check 0 лексических; P2 money-строка |
| Ложные обещания = 0 | PASS для user-facing | «У каждого магазина свой заказ» — `checkout-orders/spec.md:32`; «после выбора ПВЗ» — `CheckoutPage.tsx:115-123`; «без доставки не оформить» — `delivery/spec.md:86`; «трек не изменится» — `shipment.service.ts:475-560` |
| Смысл статусов/ошибок/authz не изменён | PASS с P3 | state/API не менялись; исправлена неточная подпись null-payment; отчёт говорит «не менялся» — уточнить |
| W2/W3 не редактировались | PASS | `git diff --name-only`: только W1-файлы + `.scrum` |
| Dev-only/docs/OpenSpec не тронуты | PASS | нет `Dev*`, `docs/`, `openspec/`, `.github/`, lockfile |
| Тесты обновлены, не ослаблены | P1 | 11 `expect` заменены 1:1, один селектор усилен; 3 e2e не обновлены |
| `pnpm verify`, web 220, OpenSpec 9/9 | PASS | exit 0; повторный web-прогон флейкнул (P3) |
| Размер 117 code+tests | PASS | +60/−57; < 600; docs/evidence отдельно |
| Нет behavior/CI/deps | PASS | только строки, тесты и `.scrum` |
| A11y | P3 | label не сломан; axe/320/1440 evidence нет; e2e-гейт красный |
| Perf-бюджет | PASS | бандл не менялся (613.21 kB, как в evidence); T0 |
| Authz/секреты/PII/откат | PASS | новых ручек/данных нет; check:public 0; PII/абсолютных путей нет; rollback — revert squash |

## Drift check

- [x] Старые имена: `scrum-crew` v0.6.0; `sprint-crew` в изменённых
  файлах нет.
- [x] W2/W3 не выдаются за сделанные: W2 перечислен как следующий PR,
  W3 — docs, read-only.
- [ ] Будущее как текущее: `report.md:3` `status: done` до merge;
  `report.md:104` «PR не создан» при живом PR #83.
- [ ] Обещание теста без ссылки: `report.md:42-45` «Тесты обновлены» без
  e2e; 3 e2e-спеки красные.
- [x] Спека/код не разошлись: `No spec change: copy only` обоснован
  (`openspec.md:148` — «Копирайт/стили — нет»); `specs/` не тронуты.
- [ ] `No doc change`: в PR body нет маркера (только `No spec change`).
- [ ] Trace: task `TEXT-W1` → no change → PR #83 → review (этот файл) →
  evidence (4 файла) → status. Нет board/state записи; report/handoff
  расходятся по статусу; workspace вне спринта не описан в
  `.scrum/README.md`.
- [x] Секреты/PII: в новых docs нет; `check:public` 0; абсолютных путей
  нет (`<worktree>` placeholder).
- [x] W2/W3/архивы/CI/deps не переписаны.

## Trace

- Task: `TEXT-W1` (`.scrum/tasks/TEXT-W1/`).
- Change: `No spec change: copy only` (T0; причина есть).
- PR: #83, base `041cfa0`, head `4f2bc41`.
- Review: этот файл (task id и PR указаны).
- Evidence: `web-test.txt` (220/220), `verify.txt` (exit 0),
  `slop-check-baseline.txt` / `slop-check-after.txt`.
- Status: report `done` vs handoff `ready-for-review` — привести к
  `ready-for-review` до merge, затем `done` после merge.

## Риск-итог

Функциональный риск низкий: copy-only, 117 code+tests, без CI/deps/API/
authz/миграций; `pnpm verify`, OpenSpec 9/9 и check:public зелёные;
откат — revert squash. Остаточный риск — качество денежного текста и
целостность evidence: 3 e2e-спеки красные, money-строка грамматически
неверна, ссылки/счётчики/статус в report/handoff расходятся с фактами.
После трёх точечных правок (e2e, money-строка, evidence/audit) — повторный
review; код, security и perf-гейты не затронуты.

---

## Re-review 09745c7 — финальный вердикт

> **Context:** `status: approved` · `updated: 2026-11-28` ·
> `owner: reviewer (Copywriter hat, не автор)` · `tier: T0` ·
> `task: TEXT-W1` · `change: No spec change: copy only` ·
> `base: main@041cfa0` · `head: 09745c7` · PR
> [#83](https://github.com/seshmonke/localhand/pull/83).

- Head: `09745c7` (`fix(web): close text review W1 findings`); base
  `041cfa0`; diff 27 файлов, +1529/−61. Код+тесты: 13 файлов, +69/−61 =
  130 строк (6 production + 7 тестов); evidence/audit отдельно.
- Предыдущие блокирующие закрыты; новых P1/P2 нет. Остались P3 по
  точности evidence/PR body, не по коду.

### Закрытие P1 — e2e и axe

- `apps/web/e2e/buyer-flow.spec.ts:119` — «Оплата не начата»; совпадает
  с `OrdersPage.tsx:219`.
- `apps/web/e2e/payments-flow.spec.ts:82` — «Оплата ещё не начата»;
  совпадает с `OrderPage.tsx:152`.
- `apps/web/e2e/delivery-flow.spec.ts:268` — `getByLabel("Трек", { exact: true })`;
  совпадает с `AdminDeliveryCard.tsx:408`.
- Старые строки в `apps/web/e2e` — 0 (`grep "Оплата не подключена|Трек-номер"`
  → нет совпадений). «Оплата не подключена» осталась только в
  `showUnavailable`-ветке `OrderPage.tsx:501` и её unit-тесте — это
  другое состояние, не регрессия.
- `evidence/e2e.txt`: полный `pnpm test:e2e` — **13 passed**, exit 0;
  buyer-flow, payments-flow и оба delivery-flow в списке.
- `evidence/axe-*.json`: 20 + 24 + 16 + 12 = **72 скана**, `violations: []`
  во всех; JSON пишет все violations, не только serious/critical, то есть
  0 действительно все. Тесты не ослаблены: только тексты/локаторы, без
  skip/only/удаления проверок.

### Закрытие P2 — money-строка

- `apps/web/src/pages/OrderPage.tsx:169-170`:
  «Исход создания платежа неизвестен. Повторите оплату: тот же ключ не
  создаст второе списание.»
- Грамматика корректна; механизм идемпотентности сохранён (тот же ключ
  в `attemptKeyFor`, повторный запрос не создаёт второе списание).
  Unit-тест `OrderPage.test.tsx:316-320` проверяет точную строку, а
  `:327-330` — один вызов с `ATTEMPT_KEY`; ослабления нет.
- «Тот же ключ» — технический термин для buyer-экрана; это осознанный
  компромисс ради механизма (аудит §6.4), P3, не P2. Если голос важнее
  механизма — «Повторите оплату — повторного списания не будет», но
  текущий вариант точен и протестирован.
- Дубль canceled/failed убран: `OrderPage.tsx:255-260` — заголовок
  статуса + только «Можно попробовать снова или связаться с продавцом.»

### Закрытие P2 — evidence/audit

- `evidence/link-check.txt`: 29 ссылок, 0 битых; мой независимый
  link-check по audit/report/handoff/`.scrum/README.md` — 29/0.
- Счётчик воспроизведён скриптом из аудита §1.1: `filesChecked: 51`,
  `withAnyCyrillic: 33`, `withLiterals: 28`, `literals: 399`, `index: 3`,
  `total: 402`; +3 шаблона `pluralizeItems` = **405** (W1 187, W2 218,
  W3 0). W2 = 20 production-файлов + `index.html` (21 поверхность;
  формулировка §8 «21 production-файл» — P3, см. ниже).
- Выдуманные glossary claims убраны: строки переведены в
  voice/clarity; §6.5 прямо говорит, что в `content.md` нет запрета на
  «заявку»/«посылку», это не нарушение глоссария. Оставшиеся «glossary»
  строки — про реальный термин «Трек» из `content.md:42`.
- Статус: `report.md:3` и `handoff.md:3` — `ready-for-review`; PR #83
  указан в обоих; `report.md:112-118` заменяет «PR не создан» на ссылку
  на PR. Ссылки report/handoff исправлены.
- `git diff --check 041cfa0..09745c7` — exit 0, trailing whitespace нет.
- `slop-check-after.txt` теперь содержит `exit=1`; лексических хитов 0,
  только `PUNCT` на TSX-код.

### Проверки (reviewer, head 09745c7)

| Команда / проверка | Exit | Результат |
|---|---:|---|
| `pnpm verify` | 0 | typecheck, lint, format, check:public (668 tracked), shared 161, web 220, API 224/170 skipped, build, OpenSpec 9/9 |
| `pnpm --filter @localhand/web test` (в verify) | 0 | 25 files, 220 tests |
| `openspec validate --all --strict` (в verify) | 0 | 9/9 |
| link-check audit/report/handoff/README | 0 | checked 29, broken 0 |
| counter script из аудита §1.1 | 0 | 399/28/33/3/402 + 3 = 405 |
| `git diff --check 041cfa0..09745c7` | 0 | clean |
| `grep` старых e2e-строк | 1 | совпадений 0 (ожидаемо) |
| `pnpm test:e2e` | не запускал | нет локального стенда; evidence `e2e.txt` — 13 passed, exit 0 |
| axe JSON (4 файла) | 0 | 72 скана, 0 violations |
| `slop-check` W1 | 1 | только `PUNCT`, `SLOP` 0 |

### Остаточные P3 (не блокируют)

1. **Аудит §3.2, строки 157 и 164** — «Предложение» всё ещё показывает
   отвергнутый промежуточный вариант: для money — «второе списание не
   создастся» (в коде «тот же ключ…»), для canceled/failed — «Платёж
   отменён / Платёж не прошёл + Можно…» (в коде дубля нет). `report.md`
   и §6.4 уже описывают финал; обновить две строки аудита, чтобы
   evidence не расходился с кодом.
2. **PR body, строка 5** — «405 фрагментов (W1 189 / W2 219)»: 189+219 =
   408, аудит/отчёт — 187/218 = 405. Обновить split в PR body.
3. **PR body, строка 1** — `No doc change: only .scrum task/evidence
   workspace updated`, но изменён `.scrum/README.md` (карта, новая
   строка/конвенция). Поставить `Doc change: .scrum/README.md` или
   включить README в причину.
4. **`verify.txt` — 662 tracked files**, на финальном head `git ls-files`
   = 668, мой `pnpm verify` — 668. Разница — 6 новых evidence-файлов,
   добавленных после прогона; перегенерировать verify на финальном head
   (код/тесты/OpenSpec те же, exit 0).
5. **E2E — dev-прогон, LCP info-only**: `[lab-lcp-over-budget]` `/`
   3936 ms, `/checkout` 4120 ms, `/orders/366` 4368 ms; `perf.spec.ts`
   на dev не enforce. Для T0 perf не гейт, но не выдавать этот прогон за
   perf-green; preview LCP не приложен.
6. **Аудит §8** — «W2: 21 production-файл (215 + 3 index = 218)»: для
   консистентности с «33 production-файла + index.html» писать
   «20 production-файлов + `index.html` = 21 поверхность».
7. **Residual voice** — одно состояние подписано «Оплата ещё не начата»
   (`OrderPage.tsx:152`), «Оплата не начата» (`OrdersPage.tsx:219`) и
   «Платёж не начат» (админка). Контекст разный, но решение стоит
   зафиксировать в W2/аудите.

### Финальный вердикт

- **Copywriter: PASS.** P2 money закрыт: грамматика, механизм
  идемпотентности и unit-тест на месте; новых ложных обещаний,
  смягчения ошибок и сломанных a11y-label нет. Остаточные P3 — точность
  evidence/PR body, не качество пользовательского текста.
- **Scrum: APPROVE.** Предыдущие P1/P2 закрыты: 3 e2e-локатора совпадают
  с кодом, полный e2e 13 passed, axe 72/0, ссылки 29/0, счётчик 405
  воспроизведён, diff-check 0, `pnpm verify` 0 (web 220, OpenSpec 9/9).
  W1 scope только; W2/W3, docs/OpenSpec/CI/deps и поведение/API не
  тронуты. P3 не блокируют merge; закрыть в PR или отдельным P3-долгом.

### Риск-итог

Функциональный риск низкий: copy-only, 130 code+tests, без API/CI/deps;
`pnpm verify`, OpenSpec 9/9, e2e 13/13, axe 72/0, links 29/0 и
diff-check зелёные; откат — revert squash. Остаточный риск —
документационный: две устаревшие строки аудита, split счётчика в PR body,
маркер `No doc change` при изменённом `.scrum/README.md` и stale
`check:public` 662/668. После их правки — merge; повторный `pnpm verify`
после merge по AGENTS.
