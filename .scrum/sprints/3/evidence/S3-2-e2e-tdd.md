# S3-2-E2E: API/DB delivery end-to-end

Дата: 2026-11-28. Ветка `task/S3-2-e2e-api`, база `main` @ `339f0c5`.
Tier: T2 test slice (external provider, PII, order transitions). Change
`07-delivery`, tasks 3.9. Production-код не менялся.

## AC → тест (`apps/api/src/delivery/delivery.e2e.db.test.ts`)

| AC спеки | Тест |
|---|---|
| Quote по городу/ПВЗ, тариф магазина | `runs quote -> …` → `POST /delivery/quote` 200, `price=38000`, `tariffCode=136` |
| Checkout с подписанным quote: snapshot, `delivery_kopecks`, `total=items+delivery` | там же → 201, статус заказа `new`, snapshot `quoted`, total `458000` |
| Оплата как предусловие | fixture `UPDATE orders SET status='paid'` (payment e2e — S3-1) |
| Seller видит оплаченный тариф/цену | там же → GET tariffs 200, `paid={136,38000}` совпадает со snapshot |
| Успешное создание: provider id/number, `created` | там же → POST 201, `fake-{id}`/`order-{id}`, БД `created`, событие CREATED |
| Webhook `DELIVERED` → `delivered`, событие | там же → fake status + webhook 200, БД/snapshot `delivered`, event DELIVERED |
| Покупатель и продавец видят один статус/трек | там же → buyer GET и seller GET: status/lastStatusCode/providerNumber/trackNumber совпадают, `no-store` |
| Повтор вебхука идемпотентен | там же → replay 200, число событий 2 без изменений |
| Повтор создания не создаёт второе отправление | там же → POST 201, `createShipment` не вызван, snapshot/БД не перезаписаны, `order_deliveries`=1 |
| Провайдер отказал (definitive), manual разрешён | `falls back …` → POST 502 `delivery_provider_error`, snapshot `quoted`, provider id/событий нет |
| Ручной трек виден покупателю/продавцу | там же → PATCH 200 `manual`, buyer/seller GET видят `MANUAL-E2E-1`, событие MANUAL |
| Повтор manual → 409 | там же → PATCH 409 `delivery_already_exists`, трек не перезаписан |
| Логи без PII | `keeps recipient PII …` → captured pino: нет имени, телефонов, адреса ПВЗ, комментария, `payload_hash`; id/status/URL присутствуют |

Authz 404/401, no-store и empty events уже покрыты
`shipment.db.test.ts`/`shipment.manual.db.test.ts`; здесь не дублируются.

## RED / GREEN

- RED: production-gap не найден. Цепочка работала, поэтому записан
  regression-lock и 4 мутационных проверки вместо фальшивого RED:
  маппинг `DELIVERED`, ранний return идемпотентного create, уникальность
  события вебхука, логирование `recipientName`. Все 4 дают падение,
  после restore — GREEN. Детали: `S3-2-e2e-tdd-red.txt`.
- GREEN: `S3-2-e2e-tdd-green.txt`, `S3-2-e2e-verify.txt`.
- Мутация B вскрыла слабое место самих тестов: дубликат create мог
  перезаписать `providerNumber` через adopt-by-number, а проверка этого
  не ловила. Добавлены assert-ы неизменности snapshot/БД; после фикса
  мутация падает.

## Решения

- `BuildAppOptions.deliveryProvider` питает только reconcile/подписку;
  маршруты вызывают `getDeliveryProvider()`. Поэтому отказ провайдера
  моделируется test double на кэшированном fake-инстансе (throw в
  `createShipment`/`getShipment`), restore — в `finally`. Прод-код не
  трогали.
- Payment — прямой DB fixture, не выдаётся за payment e2e (S3-1).
- Фикстуры вымышленные: `Иван Тестов`, `+7999…`, ПВЗ СДЭК из fake.
  Секретов в файле нет, только существующий тестовый quote-secret.
- Fake-провайдер process-local и переживает TRUNCATE; id заказов
  монотонны, методы восстанавливаются после каждого теста.
