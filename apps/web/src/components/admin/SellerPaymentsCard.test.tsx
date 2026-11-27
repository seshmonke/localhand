import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../../test/mock-api.js";
import { renderApp } from "../../test/render-app.js";

vi.mock("../../lib/navigation.js", () => ({
  goToExternal: vi.fn(),
}));

const { goToExternal } = await import("../../lib/navigation.js");

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const publishedShop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  status: "published" as const,
};
const createdAt = "2026-11-27T10:00:00.000Z";

const activeAccount = {
  id: 3,
  provider: "fake" as const,
  providerAccountId: "****c123",
  isTest: true,
  status: "active" as const,
  expiresAt: null,
  connectedAt: createdAt,
  updatedAt: createdAt,
};

const baseRoutes = {
  "GET /auth/me": { body: { user: demoUser } },
  "GET /seller/shop": { body: { shop: publishedShop } },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(goToExternal).mockReset();
});

describe("SellerPaymentsCard", () => {
  it("starts the provider connection from the empty state", async () => {
    const consentUrl = "https://yookassa.example/consent?state=abc";
    const fetchMock = installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": { body: { account: null } },
      "POST /seller/payments/connect": { body: { consentUrl } },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    expect(await within(card).findByText("Не подключено")).toBeInTheDocument();
    expect(within(card).getByText(/Деньги поступают напрямую на ваш счёт/)).toBeInTheDocument();

    await browser.click(within(card).getByRole("button", { name: "Подключить ЮKassa" }));

    await waitFor(() => expect(goToExternal).toHaveBeenCalledWith(consentUrl));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/seller/payments/connect") && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("shows an active test account with a masked id and disconnects it", async () => {
    let disconnected = false;
    const fetchMock = installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": () => ({
        body: { account: disconnected ? { ...activeAccount, status: "disabled" } : activeAccount },
      }),
      "DELETE /seller/payments/account": () => {
        disconnected = true;
        return { body: { account: { ...activeAccount, status: "disabled" } } };
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    expect(await within(card).findByText("Подключено")).toBeInTheDocument();
    expect(within(card).getByText("Тестовый магазин")).toBeInTheDocument();
    expect(within(card).getByText("****c123")).toBeInTheDocument();
    expect(within(card).queryByText(/fake_access|token/i)).not.toBeInTheDocument();

    await browser.click(within(card).getByRole("button", { name: "Отключить приём платежей" }));

    expect(await within(card).findByText("Отключено")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/seller/payments/account") &&
          (init?.method ?? "GET") === "DELETE",
      ),
    ).toBe(true);
  });

  it("explains a 409 disconnect conflict without technical details", async () => {
    installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": { body: { account: activeAccount } },
      "DELETE /seller/payments/account": {
        status: 409,
        body: { error: "payment_in_progress" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    await within(card).findByText("Подключено");
    await browser.click(within(card).getByRole("button", { name: "Отключить приём платежей" }));

    expect(
      await within(card).findByText(/Нельзя отключить: есть незавершённые платежи/),
    ).toBeInTheDocument();
    expect(await within(card).findByText("Подключено")).toBeInTheDocument();
    expect(within(card).queryByText(/payment_in_progress|409/)).not.toBeInTheDocument();
  });

  it("retries a failed connection from the error state", async () => {
    const fetchMock = installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": {
        body: { account: { ...activeAccount, status: "error" } },
      },
      "POST /seller/payments/connect": {
        body: { consentUrl: "https://yookassa.example/consent?state=retry" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    expect(await within(card).findByText("Ошибка подключения")).toBeInTheDocument();

    await browser.click(within(card).getByRole("button", { name: "Повторить подключение" }));

    await waitFor(() =>
      expect(goToExternal).toHaveBeenCalledWith("https://yookassa.example/consent?state=retry"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/seller/payments/connect") && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("reconnects a disabled account", async () => {
    installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": {
        body: { account: { ...activeAccount, status: "disabled" } },
      },
      "POST /seller/payments/connect": {
        body: { consentUrl: "https://yookassa.example/consent?state=again" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    expect(await within(card).findByText("Отключено")).toBeInTheDocument();

    await browser.click(within(card).getByRole("button", { name: "Подключить снова" }));

    await waitFor(() =>
      expect(goToExternal).toHaveBeenCalledWith("https://yookassa.example/consent?state=again"),
    );
  });

  it("shows a neutral message when the account request fails", async () => {
    installFetchMock({
      ...baseRoutes,
      "GET /seller/payments/account": { status: 500, body: { error: "internal_error" } },
    });

    renderApp(["/admin/shop"]);

    const card = await screen.findByRole("region", { name: "Приём платежей" });
    expect(
      await within(card).findByText("Не удалось загрузить приём платежей."),
    ).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(within(card).queryByText(/internal_error|500/)).not.toBeInTheDocument();
  });
});
