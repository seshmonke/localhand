import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const card = {
  id: 1,
  name: "Куртка 90-х",
  priceKopecks: 420_000,
  imageUrl: null,
  shop: { slug: "local-hand-demo", name: "Винтаж на районе" },
};

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the marketplace goal and catalog from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          products: [card],
          page: 1,
          pageSize: 12,
          total: 1,
          hasMore: false,
        }),
      }),
    );

    renderApp();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /секонд-хенд и локальные бренды/i,
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText("Куртка 90-х")).toBeInTheDocument();
    expect(screen.getByText("Винтаж на районе")).toBeInTheDocument();
  });
});
