import { formatRubles, kopecks, type ProductCard as ProductCardData } from "@localhand/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ProductCard } from "./ProductCard.js";

afterEach(cleanup);

const longName = "Сверхдлинноеназваниевинтажнойкурткииздевяностых";

const product: ProductCardData = {
  id: 12,
  name: longName,
  priceKopecks: 4_299_900,
  imageUrl: null,
  shop: { slug: "smoke-7392012", name: "Винтаж на районе" },
};

function normalizedText(value: string): string {
  return value.replace(/\s/g, "");
}

describe("ProductCard", () => {
  it("keeps a long product name and the price inside the card link", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 3, name: longName })).toBeInTheDocument();
    const price = normalizedText(formatRubles(kopecks(product.priceKopecks)));
    expect(
      screen.getByText((_, element) => normalizedText(element?.textContent ?? "") === price),
    ).toBeInTheDocument();
    expect(screen.getByText(product.shop.name)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/products/${product.id}`);
  });
});
