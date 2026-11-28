import { t } from "@localhand/i18n";

export function pluralizeItems(count: number): string {
  return `${count} ${t("cart.item", { count })}`;
}
