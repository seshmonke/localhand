import { ApiError } from "../../lib/api.js";

function isCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

export function productErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_request":
        return "Проверьте поля: название, цену, описание и ссылку на изображение.";
      case "shop_required":
        return "Сначала создайте магазин: товары хранятся внутри магазина.";
      case "shop_not_published":
        return "Магазин ещё не опубликован. Опубликуйте магазин, чтобы публиковать товары.";
      case "unauthorized":
        return "Сессия истекла. Войдите снова.";
      case "not_found":
        return "Товар не найден. Возможно, он был удалён.";
      default:
        break;
    }

    if (error.status === 400) {
      return "Проверьте поля: название, цену, описание и ссылку на изображение.";
    }
    if (error.status === 404) {
      return "Товар не найден. Возможно, он был удалён.";
    }
    if (error.status === 409) {
      return "Сейчас товар нельзя изменить. Обновите страницу и попробуйте снова.";
    }
    if (error.status === 401) {
      return "Сессия истекла. Войдите снова.";
    }
    if (error.status >= 500) {
      return "Сервис временно недоступен. Попробуйте ещё раз.";
    }
  }

  return "Не удалось сохранить товар. Проверьте соединение и попробуйте снова.";
}

export function productStatusErrorMessage(error: unknown): {
  message: string;
  shopLink: boolean;
} {
  if (isCode(error, "shop_not_published")) {
    return {
      message: "Магазин не опубликован. Опубликуйте магазин, чтобы публиковать товары.",
      shopLink: true,
    };
  }

  return { message: productErrorMessage(error), shopLink: false };
}
