# Sprint 3 daily

## Cycle 1 — 27.11.2026

### Планирование money-path

- Владелец согласовал скоуп 27.11.2026: payments (ЮKassa sandbox),
  delivery (СДЭК test), order lifecycle, hardening S2.
- Sprint Goal: покупатель оплачивает заказ продавцу в тестовом контуре,
  продавец видит оплату, оформляет СДЭК и ведёт заказ до трека; без
  реальных денег/ключей/адресов.
- План: [03-money-path.md](../../../docs/tasks/03-money-path.md).
- Changes: `06-payments`, `07-delivery`, `08-order-lifecycle`,
  `09-orders-pagination` — по волнам, одна capability на change.
- S3-1 `in_progress`, owner `scrum-worker`, ветка
  `task/S3-1-payments`, lease до 18:00Z.
- `06-payments` создан: proposal/design/spec/tasks;
  `openspec validate 06-payments --strict` — valid.
- Spec review #1: REQUEST_CHANGES (P1 webhook subscription, unknown
  webhook 200, create/webhook race, account versioning). Исправлено:
  адаптер + subscribe/reconcile, 503/unknown, order-lock, версии
  аккаунта, manual_review, keyring, PR A/B.
- `06-payments` прошёл 5 раундов ревью; итог **APPROVE**:
  зафиксированы webhook subscription, 503/reconcile, версии аккаунта,
  order-lock + replay до гейта, 5xx → pending/manual_review вместо
  второго списания, три исхода manual_review, UI-ключ попытки.
- `openspec validate 06-payments --strict` — valid.
- Дальше: planning PR, затем foundation PR A.
- Блокеры: тестовые ключи ЮKassa — владелец; без них fake-провайдер,
  live smoke не блокирует merge.
- Эскалаций нет.

### Итог синка

- Продолжаем: S3-1 payments.
- Перепланирование не нужно.
- Владелец нужен для тестовых ключей ЮKassa/СДЭК и юридического
  контура, но старт не блокируется.
