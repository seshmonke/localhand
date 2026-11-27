import { CART_MAX_ITEMS, type CartItem } from "@localhand/shared";
import { Button, type ButtonProps } from "@localhand/ui";
import { useState } from "react";
import { useCart } from "./CartContext.js";

type AddToCartButtonProps = {
  item: CartItem;
  size?: ButtonProps["size"];
  className?: string;
};

export function AddToCartButton({ item, size = "md", className }: AddToCartButtonProps) {
  const { addItem, hasItem } = useCart();
  const [limitMessage, setLimitMessage] = useState("");
  const inCart = hasItem(item.productId);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={inCart ? "outline" : "default"}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const status = addItem(item);
          setLimitMessage(
            status === "limit" ? `В корзине не может быть больше ${CART_MAX_ITEMS} товаров.` : "",
          );
        }}
      >
        {inCart ? "В корзине" : "В корзину"}
      </Button>
      {limitMessage ? (
        <span className="mt-2 block text-xs font-semibold text-accent-red-text">
          {limitMessage}
        </span>
      ) : null}
    </>
  );
}
