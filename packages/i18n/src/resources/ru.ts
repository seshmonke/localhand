/**
 * Single ru catalog for runtime copy.
 *
 * Keys are flat and use the `surface.key` shape. i18next runs with
 * `keySeparator: false`, so the whole key is looked up as-is. Plural forms
 * are the i18next suffixes `_one/_few/_many/_other` for ru.
 */
export const ru = {
  "common.greeting": "Здравствуйте, {{name}}",
  "common.state.loading": "Загрузка",
  "common.state.empty": "Пусто",
  "common.state.error": "Ошибка",
  "common.state.loadingProducts": "Загрузка товаров",
  "common.retry": "Повторить",
  "common.sessionExpired.title": "Сессия истекла",
  "common.sessionExpired.description": "Войдите снова, чтобы продолжить.",
  "common.sessionExpired.inline": "Сессия истекла. Войдите снова.",
  "common.sessionExpired.login": "Войти",
  "common.sessionExpired.redirecting": "Переходим…",
  "cart.item": "товар",
  "cart.item_one": "товар",
  "cart.item_few": "товара",
  "cart.item_many": "товаров",
  "cart.item_other": "товара",
  "checkout.eyebrow": "Оформление заказа",
  "checkout.title": "Проверьте заказ",
  "checkout.description":
    "У каждого магазина свой заказ. Оплата проходит на странице ЮKassa, деньги получает продавец.",
  "checkout.loading.title": "Проверяем корзину",
  "checkout.loading.description": "Восстанавливаем товары с этого устройства.",
  "checkout.empty.title": "Корзина пуста",
  "checkout.empty.description": "Добавьте товары из каталога, чтобы оформить заказ.",
  "checkout.empty.action": "Перейти в каталог",
  "checkout.success.title": "Заказ оформлен",
  "checkout.success.description": "Переходим к заказу и оплате.",
  "checkout.shopTotal": "Итого:",
  "checkout.delivery.title": "Доставка",
  "checkout.delivery.intro":
    "Выберите город и пункт выдачи СДЭК. Стоимость и срок рассчитаем после выбора ПВЗ.",
  "checkout.delivery.cityLabel": "Город доставки",
  "checkout.delivery.cityLoading": "Загружаем города…",
  "checkout.delivery.cityPlaceholder": "Выберите город",
  "checkout.delivery.pointLabel": "Пункт выдачи",
  "checkout.delivery.pointHint": "Список ПВЗ выбранного города.",
  "checkout.delivery.pointLoading": "Загружаем ПВЗ…",
  "checkout.delivery.pointPlaceholder": "Выберите ПВЗ",
  "checkout.delivery.recipientLabel": "Имя получателя",
  "checkout.delivery.recipientHint": "Имя, на которое оформлена доставка.",
  "checkout.delivery.citiesError": "Не удалось загрузить города.",
  "checkout.delivery.pointsError": "Не удалось загрузить пункты выдачи.",
  "checkout.delivery.period": "Срок",
  "checkout.delivery.days": "{{count}} дн.",
  "checkout.contacts.title": "Контакты",
  "checkout.contacts.phoneLabel": "Телефон для связи:",
  "checkout.contacts.phoneNote": ". Заказ привязан к вашему номеру.",
  "checkout.contacts.commentLabel": "Комментарий продавцу",
  "checkout.contacts.commentHint":
    "Необязательно. До 500 символов: удобное время, вопросы по товару.",
  "checkout.summary.title": "Итог",
  "checkout.summary.items": "Товаров",
  "checkout.summary.total": "Итого",
  "checkout.unavailable": "Часть товаров уже недоступна. Уберите их из корзины и попробуйте снова.",
  "checkout.unavailable.action": "Проверить корзину",
  "checkout.submit": "Оформить заказ",
  "checkout.submitting": "Оформляем…",
  "checkout.disclaimer":
    "Нажимая кнопку, вы отправляете заказ продавцам. После оформления перейдёте к оплате. Если продавец не подключил приём платежей, вы увидите это в заказе.",
  "checkout.error.deliveryRequired":
    "Укажите город, пункт выдачи и имя получателя: без доставки заказ не оформить.",
  "checkout.error.cartRange": "Проверьте корзину: в одном заказе от 1 до 50 товаров.",
  "checkout.error.rateLimited":
    "Слишком много попыток оформления. Подождите минуту и попробуйте снова.",
  "checkout.error.unavailable":
    "Некоторые товары больше недоступны. Проверьте корзину и попробуйте снова.",
  "checkout.error.generic": "Не удалось оформить заказ. Проверьте соединение и попробуйте снова.",
  "checkout.error.quoteStale": "Цена доставки изменилась. Выберите ПВЗ заново.",
  "checkout.error.deliveryUnavailable": "Доставка временно недоступна. Попробуйте позже.",
  "checkout.error.deliveryStarted": "Выберите город, пункт выдачи и укажите имя получателя.",
  "checkout.quoteError.dimensionsMissing":
    "У одного из товаров не указаны вес и габариты. Напишите продавцу.",
  "checkout.quoteError.shopCityMissing": "Продавец ещё не настроил отправку из своего города.",
  "checkout.quoteError.pointInvalid": "Этот пункт выдачи не подходит для выбранного города.",
  "checkout.quoteError.generic":
    "Не удалось рассчитать доставку. Выберите другой пункт выдачи или попробуйте снова.",
} as const;

export type TranslationKey = keyof typeof ru;
