> **Context:** `status: plan` · `updated: 2026-11-28` · `owner: SM` ·
> `sprint: —` · `task: —` · `change: No spec change: process/voice` ·
> links: [INDEX](INDEX.md) · [content](../design/content.md) ·
> [copywriting codex](../../.opencode/skills/scrum-crew/references/copywriting.md)

# Text review wave

Статус: **программа**. W1 — Sprint 4, W2/W3 — Sprint 4–5.
Owner: SM (процесс/волны); voice reviewer: Copywriter. Дата: 28.11.2026.
Источник: решение владельца «добавить ревью всех текстов» + роль
Copywriter и анти-слоп в `scrum-crew` v0.6.0
(`.opencode/skills/scrum-crew/references/copywriting.md`).

## Цель

Все пользовательские и публичные тексты говорят одним голосом, называют
вещи одинаково, не обещают лишнего и не звучат как пресс-релиз. Каждое
изменение текста проходит ревью Copywriter и проверку `slop-check`.

## Скоуп

| Слой | Что входит | Приоритет |
|---|---|---|
| UI P0 | checkout, оплата, доставка, статусы заказа, ошибки/пустые/loading, 401/404/409/502 | W1 |
| UI P1 | витрина, магазин, карточка, корзина, заказы buyer/seller, админка, auth | W2 |
| Системные тексты | SMS/email (когда появятся), validation, dev-страницы, 404 | W1–W2 |
| Публичные docs | `AGENTS.md`, `docs/*/README.md`, `docs/concept`, `docs/design`, `docs/quality`, `docs/stack`, ADR/runbooks | W3 |
| Процессные docs | `docs/tasks/*.md` (активные/индексы), `.scrum/README.md`, текущий sprint/task workspace | W2–W3 |
| OpenSpec specs | read-only: user-facing формулировки проверяются, правки — только через OpenSpec change/archive | W3 |

Вне скоупа: юридические тексты (владелец/юрист), архивные changes,
старые спринты и исторические sprint/task docs (только ссылки/индексы),
имена кода/API/БД, переводы. Корневой `README.md` появится отдельной
задачей и тогда войдёт в W3.

## Голос и глоссарий

- Профиль из `copywriting.md`: формальность 7, теплота 5, энергия 4,
  орнамент 2, конкретность 9, срочность 1, техничность 3, юмор 2.
- Один факт — одно предложение; одна мысль — один экран.
- Глоссарий: Local Hand, магазин, продавец, покупатель, заказ, оплата,
  доставка, ПВЗ, трек, отправление. Не смешивать «клиент/покупатель»,
  «товар/вещь», «оплата/платёж» без причины.
- Анти-слоп: чёрный список и синтаксис из `copywriting.md`; проверка
  `bash .opencode/skills/scrum-crew/scripts/slop-check.sh <files>`.
- Нет ложных обещаний: сроки, цены, гарантии, «бесплатно», «безопасно» —
  только с источником/фактом.

## Метод

1. **Inventory.** `grep -RIn` по `AGENTS.md`, `apps/web/src`,
   `apps/web/index.html`, `docs`, `openspec/specs`, `.github`, `.scrum`;
   таблица `surface → files → owner → priority → wave`. Строки в коде —
   через компоненты/константы, не по одному файлу. `rg` не требуется.
   Маппинг: checkout/payment/delivery/errors → W1; витрина/заказы/
   админка/auth → W2; docs/README/content → W3; системные тексты
   (SMS/validation/dev/404) → W1–W2; `.scrum`/`docs/tasks` → W2–W3;
   `openspec/specs` — read-only, правки через change.
2. **Baseline.** `slop-check` по текстовым файлам; ручное чтение
   Copywriter; список ложных обещаний и расхождений глоссария.
3. **W1 P0.** Checkout/оплата/доставка/статусы/ошибки; сначала
   ошибки и деньги, потом остальное. Малые PR по поверхности.
4. **W2 P1.** Витрина/карточка/корзина/заказы/админка/auth.
5. **W3 P2.** Публичные и процессные docs; создать/обновить
   `docs/design/content.md` (voice/глоссарий) и ссылку в
   `docs/design/README.md`; контекстные шапки не переписывать массово.
6. **Ongoing gate.** Новый/изменённый user-facing текст — Copywriter
   review не-автора + `slop-check` + `motif-check`; ссылка в PR или
   `No text change: <причина>`.

Правила PR: только текст/разметка, без изменения поведения; если текст
меняет смысл статуса/ошибки — сверить спеку и тесты; скриншоты 320/1440
для UI; axe/клавиатура для error/empty/loading; ПДн не в примерах.
`No text change: <причина>` — допустимый маркер для PR без текста;
`No doc change` остаётся для host-doc.

## AC программы

- [ ] Inventory всех поверхностей и файлов; owner и приоритет у каждого.
- [ ] W1: checkout/оплата/доставка/статусы/ошибки — 100% просмотрено,
      slop-check 0 на изменённых, ложных обещаний 0.
- [ ] W2: витрина/карточка/корзина/заказы/админка/auth — 100%.
- [ ] W3: публичные и процессные docs — 100%, архивы не переписаны.
- [ ] PR-шаблон и DoD содержат text gate; Copywriter review не-автора.
- [ ] Baseline `docs/design/content.md` создан и связан из
      `docs/design/README.md`; W3 — ревизия и расширение примеров.
- [ ] Новые тексты проходят gate `slop-check` + `motif-check`;
      `No text change: <причина>` допустим.
- [ ] `pnpm verify`, `openspec validate --all --strict` зелёные.

## Роли

- **Copywriter** — голос, глоссарий, ревью, anti-slop; не переписывает
  чужие task/state, правки вносит host owner.
- **PO/owner** — обещания, цены, сроки; **Legal** — допустимость claims
  и приватность, вето на релиз.
- **SM** — план волн, WIP, evidence, ретро.
- **Reviewer не-автора** — проверяет text review и drift.
- **Frontend/Backend/Worker** — выносит строки, не меняет поведение.

## Метрики

- Slop hits на новых/изменённых строках: 0; baseline существующих
  hits — в inventory, не считается регрессией.
- Motif repeats на новых текстах: 0; общий образ не повторяется в
  следующих трёх текстах; слова-подписи — в `docs/design/motifs.md`.
- Ложные обещания/недоказанные факты: 0.
- Расхождения глоссария: 0.
- Покрытие ревью изменённых user-facing текстов: 100%.
- Возвраты из-за текста после merge: 0.

## Non-goals

- Массовый rewrite архива и старых спринтов.
- Юридические документы без владельца/юриста.
- Смена позиционирования/названия продукта.
- Новые продуктовые фичи.

## Evidence

- Inventory и baseline-отчёт.
- PR по волнам с `slop-check` и ссылками на ревью.
- `docs/design/content.md` (baseline), PR-шаблон, DoD.
- Итоговый отчёт: метрики, остатки, owner.
