# Spec Delta: checkout-orders (delivery)

## ADDED Requirements

### Requirement: Доставка в checkout

Система SHALL принимать выбранную доставку в checkout и включать её в
заказ и итоговую сумму.

#### Scenario: Checkout с доставкой

- **WHEN** покупатель отправляет checkout с подписанным delivery quote
- **THEN** каждый заказ получает delivery snapshot и
  `total_kopecks = items + delivery_kopecks`

#### Scenario: Quote устарел

- **WHEN** quoteToken истёк или состав товаров изменился
- **THEN** система возвращает 409 и не создаёт заказ

#### Scenario: Доставка недоступна

- **WHEN** quote/размеры/город магазина недоступны
- **THEN** система возвращает 409/502 и не создаёт частичный заказ

#### Scenario: Старые заказы

- **WHEN** заказ создан до delivery
- **THEN** `delivery_kopecks = 0`, total не меняется
