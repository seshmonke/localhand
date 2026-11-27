# Spec Delta: seller-shop (shipping)

## ADDED Requirements

### Requirement: Город и ПВЗ отправки

Система SHALL позволять продавцу указать город и ПВЗ сдачи для
платформенного аккаунта CDEK.

#### Scenario: Сохранение

- **WHEN** продавец выбирает город и ПВЗ сдачи
- **THEN** они сохраняются в магазине и используются в quote/create

#### Scenario: Нет города

- **WHEN** город/ПВЗ не заполнены
- **THEN** checkout возвращает 409 `shop_city_missing`
