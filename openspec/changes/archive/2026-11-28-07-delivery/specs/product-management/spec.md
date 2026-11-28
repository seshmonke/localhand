# Spec Delta: product-management (dimensions)

## ADDED Requirements

### Requirement: Габариты физического товара

Система SHALL позволять продавцу указать вес и габариты товара.

#### Scenario: Сохранение

- **WHEN** продавец сохраняет `weight_g`/`length_cm`/`width_cm`/
  `height_cm`
- **THEN** значения сохраняются и доступны для quote

#### Scenario: Невалидные

- **WHEN** вес/габарит ≤ 0
- **THEN** система возвращает 400 и не сохраняет
