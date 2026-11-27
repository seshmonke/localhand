import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const createdAt = "2026-11-27T10:00:00.000Z";
const shop = {
  id: 1,
  slug: "demo-shop",
  name: "Демо-магазин",
  description: null,
  cdekCityCode: null,
  cdekCityName: null,
  cdekShipmentPoint: null,
  status: "published" as const,
};
const order = {
  id: 42,
  shop: { slug: "demo-shop", name: "Демо-магазин" },
  status: "payment_pending" as const,
  totalKopecks: 420_000,
  buyerPhone: demoUser.phone,
  comment: null,
  createdAt,
  items: [{ productId: 1, name: "Куртка 90-х", priceKopecks: 420_000, quantity: 1 as const }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DevPaymentsConnectPage", () => {
  it("confirms the fake OAuth code through the callback and returns to the shop", async () => {
    let callbackQuery: Record<string, string> = {};
    const fetchMock = installFetchMock({
      "GET /seller/payments/callback": ({ query }) => {
        callbackQuery = query;
        return {
          body: {
            account: {
              id: 3,
              provider: "fake",
              providerAccountId: "****c123",
              isTest: true,
              status: "active",
              expiresAt: null,
              connectedAt: createdAt,
              updatedAt: createdAt,
            },
          },
        };
      },
      // The redirect target mounts the real admin shop page.
      "GET /auth/me": { body: { user: demoUser } },
      "GET /seller/shop": { body: { shop } },
      "GET /seller/payments/account": {
        body: {
          account: {
            id: 3,
            provider: "fake",
            providerAccountId: "****c123",
            isTest: true,
            status: "active",
            expiresAt: null,
            connectedAt: createdAt,
            updatedAt: createdAt,
          },
        },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/dev/payments/connect?state=state-123"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: /Подключение ЮKassa/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/тестовый режим/i)).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Подтвердить подключение" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/shop"));
    expect(callbackQuery["state"]).toBe("state-123");
    expect(callbackQuery["code"]).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/seller/payments/callback")),
    ).toBe(true);
  });

  it("shows an honest error for an expired state", async () => {
    installFetchMock({
      "GET /seller/payments/callback": { status: 400, body: { error: "invalid_request" } },
    });

    const browser = userEvent.setup();
    renderApp(["/dev/payments/connect?state=state-123"]);

    await browser.click(await screen.findByRole("button", { name: "Подтвердить подключение" }));

    expect(
      await screen.findByText(/Ссылка устарела — начните подключение заново/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/invalid_request|400/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться в кабинет" })).toHaveAttribute(
      "href",
      "/admin/shop",
    );
  });
});

describe("DevPaymentCompletePage", () => {
  it("completes the fake payment, sends the real webhook and returns to the order", async () => {
    let completeBody: unknown;
    let webhookBody: unknown;
    installFetchMock({
      "POST /dev/payments/5/complete": ({ body }) => {
        completeBody = body;
        return { body: { ok: true, orderId: 42, providerPaymentId: "fake_1" } };
      },
      "POST /payments/yookassa/webhook": ({ body }) => {
        webhookBody = body;
        return { body: { ok: true } };
      },
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": {
        body: {
          payment: {
            id: 5,
            status: "succeeded",
            amountKopecks: 420_000,
            currency: "RUB",
            confirmationUrl: null,
            createdAt,
            paidAt: createdAt,
          },
        },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/dev/payments/5/complete"]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Тестовая оплата" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Платёж №5/)).toBeInTheDocument();
    expect(screen.getByText(/Реальные деньги не списываются/)).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Оплатить тестовым платежом" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/orders/42?payment=return"),
    );
    expect(completeBody).toBeUndefined();
    expect(webhookBody).toEqual({
      type: "payment.succeeded",
      event: "payment.succeeded",
      object: { id: "fake_1", status: "succeeded" },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Заказ №42" })).toBeInTheDocument();
  });

  it("explains a stale or foreign payment instead of leaking the error code", async () => {
    installFetchMock({
      "POST /dev/payments/5/complete": { status: 409, body: { error: "invalid_order_transition" } },
    });

    const browser = userEvent.setup();
    renderApp(["/dev/payments/5/complete"]);

    await browser.click(await screen.findByRole("button", { name: "Оплатить тестовым платежом" }));

    expect(await screen.findByText(/Платёж уже завершён или недоступен/)).toBeInTheDocument();
    expect(screen.queryByText(/invalid_order_transition|409/)).not.toBeInTheDocument();
  });

  it("keeps a link to the order when the webhook cannot be delivered", async () => {
    installFetchMock({
      "POST /dev/payments/5/complete": {
        body: { ok: true, orderId: 42, providerPaymentId: "fake_1" },
      },
      "POST /payments/yookassa/webhook": { status: 502, body: { error: "provider_unavailable" } },
    });

    const browser = userEvent.setup();
    renderApp(["/dev/payments/5/complete"]);

    await browser.click(await screen.findByRole("button", { name: "Оплатить тестовым платежом" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/статус не обновился/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться к заказу" })).toHaveAttribute(
      "href",
      "/orders/42?payment=return",
    );
  });
});
