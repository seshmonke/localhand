import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { authKeys, sellerKeys } from "../../lib/queries.js";
import { SessionExpiredState } from "./SessionExpiredState.js";

const demoUser = { id: 7, phone: ["+7", "999", "000", "00", "07"].join("") };

function LoginProbe() {
  const location = useLocation();
  return <p>{`login:${location.pathname}${location.search}`}</p>;
}

afterEach(() => {
  cleanup();
});

describe("SessionExpiredState", () => {
  it("clears session data and opens login with the encoded next path", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(authKeys.me, { user: demoUser });
    client.setQueryData(sellerKeys.shop, { shop: null });
    client.setQueryData(sellerKeys.products, { products: [] });

    const browser = userEvent.setup();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/products/11"]}>
          <Routes>
            <Route
              path="/admin/products/11"
              element={<SessionExpiredState next="/admin/products/11" />}
            />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await browser.click(screen.getByRole("button", { name: "Войти" }));

    expect(
      await screen.findByText("login:/login?next=%2Fadmin%2Fproducts%2F11"),
    ).toBeInTheDocument();
    expect(client.getQueryData(authKeys.me)).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: sellerKeys.all })).toHaveLength(0);
  });
});
