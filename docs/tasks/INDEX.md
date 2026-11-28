# Доска задач

Правила воркфлоу — ниже. Содержание — в связанных файлах.

## Направление

Цели, в рамках которых планировщик собирает следующий спринт. Пишет и
меняет владелец; агенты только читают.

1. Доказать buyer-first ядро: покупатель находит товар, открывает
   магазин и карточку, оформляет заказ. Без этого остальное не имеет
   смысла.
2. Подключить продавца к деньгам и доставке: статус, ЮKassa, СДЭК.
3. После ядра — цифровые товары и AI-агент; не раньше, чем каталог,
   оплата и доставка стабильны.

## Список спринтов

<!-- - [Спринт 1: …](01-….md) — …. Закрыт ДД.ММ.ГГГГ. -->

Init закрыт 27.11.2026: product, stack, GitHub, walking skeleton
(`2026-11-27-01-walking-skeleton`). Sprint 1 **закрыт** 27.11.2026:
ACCEPT, change `02-seller-onboarding` заархивирован.

- [Спринт 1: онбординг продавца + auth](01-seller-onboarding.md) —
  CLOSED 27.11.2026; S1-1…S1-5 (PR #12/#14/#16/#18/#20/#22), specs
  phone-auth/seller-shop/product-management.
- [Спринт 2: buyer-core](02-buyer-core.md) — CLOSED 27.11.2026;
  S2-1…S2-4 (PR #26/#28/#30/#31/#33), changes `03`/`04`/`05` в архиве.
  LCP: owner-approved lab/preview proxy, field RUM в бэклоге.
- [Спринт 3: money-path](03-money-path.md) — CLOSED 28.11.2026;
  S3-1 payments (PR #39/#41/#45) и S3-2 delivery (PR #47–#79);
  changes `06`/`07` в архиве. ЮKassa/СДЭК — тестовый контур, без
  реальных денег и адресов. S3-3 lifecycle и S3-4 hardening перенесены
  в Sprint 4. Durable workspace:
  [.scrum/sprints/3/sprint.md](../../.scrum/sprints/3/sprint.md).
- [Спринт 4: i18n runtime copy](04-i18n.md) — BUILDING, cycle 1;
  S4-1 foundation, затем W1/W2 migration и 100% gate. `08`/`09`,
  Q1.1/Q1.2 — Sprint 5.
- Sprint 5 — не начат. Кандидаты: `08-order-lifecycle`,
  `09-orders-pagination`, Q1.1/Q1.2, Text review W3; live-интеграции и
  юрпакет — owner-гейты.

## Бэклог

[backlog.md](backlog.md) — весь пул задач, метки P0/P1/P2.
[Quality wave 1](quality-wave-1.md) — программа Q1.1–Q1.6:
TDD/ATDD/contract/mutation/threat model/SLO; Q1.1/Q1.2 — Sprint 4,
Q1.3–Q1.6 — Sprint 5–6.
[Text review](text-review.md) — W1–W3: пользовательские, публичные и
процессные тексты, voice/anti-slop, PR-гейт; W1 — Sprint 4, W2/W3 — Sprint 4–5.

## Milestones

[milestones.md](milestones.md) — концептуальные решения и отмены.

## Правила

- Состав спринта не придумывать: сначала согласовать с владельцем, потом
  зафиксировать файлом.
- Один спринт — один файл `NN-краткое-описание.md`.
- В работе — не больше 1–2 задач на исполнителя; 12 слотов в коде на
  команду.
- Всё, что всплыло, сразу задачей в бэклог с глаголом и приоритетом.
- После закрытия файл спринта остаётся историей: не удаляется.
- Доска — про статус; содержание решений — в чистовике и OpenSpec.
