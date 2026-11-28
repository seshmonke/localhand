# Spec Delta: seller-shop (shipping)

## ADDED Requirements

### Requirement: Город и ПВЗ отправки

Система SHALL позволять продавцу указать город и ПВЗ сдачи для
платформенного аккаунта CDEK.

#### Scenario: Сохранение

- **WHEN** продавец выбирает город и ПВЗ сдачи
- **THEN** они сохраняются в магазине и используются в quote/create

#### Scenario: Нет города

- **WHEN** город отправки не заполнен
- **THEN** checkout возвращает 409 `shop_city_missing`

#### Scenario: Нет ПВЗ сдачи

- **WHEN** город заполнен, а ПВЗ сдачи нет
- **THEN** checkout возвращает 409 `shop_shipment_point_missing`

#### Scenario: Очистка города отправки

- **WHEN** продавец сохраняет `cdekCityCode: null`
- **THEN** `cdekCityCode`, `cdekCityName` и `cdekShipmentPoint`
  становятся `null`, а quote/create больше не используют этот город и
  ПВЗ сдачи
