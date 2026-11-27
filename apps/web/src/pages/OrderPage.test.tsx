import { formatRubles, kopecks, type OrderPayment, type OrderSummary } from "@localhand/shared";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";
import { formatOrderDate, formatOrderPhone } from "./OrdersPage.js";

vi.mock("../lib/navigation.js", () => ({
  goToExternal: vi.fn(),
}));

const { goToExternal } = await import("../lib/navigation.js");

function phone(...parts: string[]): string {
  return parts.join("");
}

const demoUser = { id: 7, phone: phone("+7", "999", "000", "00", "07") };
const createdAt = "2026-11-27T10:00:00.000Z";
const confirmationUrl = "https://yookassa.example/confirm/abc";
const ATTEMPT_KEY = "11111111-1111-4111-8111-111111111111";

const order: OrderSummary = {
  id: 42,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
  status: "new",
  totalKopecks: 509_900,
  buyerPhone: demoUser.phone,
  comment: "Позвоните после 18:00",
  createdAt,
  items: [
    {
      productId: 1,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    },
    {
      productId: 2,
      name: "Ваза из стекла",
      priceKopecks: 89_900,
      quantity: 1,
    },
  ],
};

function payment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: 5,
    status: "pending",
    amountKopecks: 509_900,
    currency: "RUB",
    confirmationUrl,
    createdAt,
    paidAt: null,
    ...overrides,
  };
}

function price(value: number): string {
  return formatRubles(kopecks(value)).replace(/\s+/g, " ");
}

function paymentRequests(fetchMock: ReturnType<typeof installFetchMock>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/orders/42/payment"));
}

function createPaymentCalls(fetchMock: ReturnType<typeof installFetchMock>) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith("/api/orders/42/payments") && init?.method === "POST",
  );
}

function idempotencyKey(init?: RequestInit): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["Idempotency-Key"] ?? headers?.["idempotency-key"];
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(goToExternal).mockReset();
});

describe("OrderPage", () => {
  it("shows the buyer order with items, total, phone, comment and created date", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: null } },
    });

    renderApp(["/orders/42"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Заказ №42" })).toBeInTheDocument();
    expect(await screen.findByText("Новый")).toBeInTheDocument();
    expect(screen.getByText(`Создан ${formatOrderDate(createdAt)}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Винтаж на районе" })).toHaveAttribute(
      "href",
      "/shops/vintage-shop",
    );
    expect(screen.getByRole("link", { name: "Куртка 90-х" })).toHaveAttribute(
      "href",
      "/products/1",
    );
    expect(screen.getByRole("link", { name: "Ваза из стекла" })).toHaveAttribute(
      "href",
      "/products/2",
    );
    expect(screen.getAllByText(price(420_000)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(price(89_900)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(price(509_900)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: formatOrderPhone(demoUser.phone) })).toHaveAttribute(
      "href",
      `tel:${demoUser.phone}`,
    );
    expect(screen.getByText("Позвоните после 18:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К заказам" })).toHaveAttribute("href", "/orders");

    const paymentSection = screen.getByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Оплата не подключена")).toBeInTheDocument();
    expect(within(paymentSection).getByRole("button", { name: "Оплатить" })).toBeInTheDocument();
  });

  it("creates a payment with an idempotency key and opens the confirmation page", async () => {
    const created = payment();
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: null } },
      "POST /orders/42/payments": { status: 201, body: { payment: created } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    await waitFor(() => expect(goToExternal).toHaveBeenCalledWith(confirmationUrl));
    const calls = createPaymentCalls(fetchMock);
    expect(calls).toHaveLength(1);
    const key = idempotencyKey(calls[0]?.[1]);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("keeps the same attempt key when the provider call fails", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: null } },
      "POST /orders/42/payments": { status: 502, body: { error: "provider_unavailable" } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await within(paymentSection).findByRole("button", { name: "Оплатить" });
    const pay = () =>
      browser.click(within(paymentSection).getByRole("button", { name: "Оплатить" }));

    await pay();
    expect(
      await within(paymentSection).findByText(/Платёжный сервис недоступен/),
    ).toBeInTheDocument();
    await pay();

    await waitFor(() => expect(createPaymentCalls(fetchMock)).toHaveLength(2));
    const keys = createPaymentCalls(fetchMock).map(([, init]) => idempotencyKey(init));
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });

  it("starts a new attempt key after a canceled payment", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": {
        body: { payment: payment({ status: "canceled", confirmationUrl: null }) },
      },
      "POST /orders/42/payments": { status: 201, body: { payment: payment() } },
    });
    window.sessionStorage.setItem("localhand.payment.attempt.42", ATTEMPT_KEY);

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Оплата отменена")).toBeInTheDocument();
    await browser.click(
      await within(paymentSection).findByRole("button", { name: "Оплатить снова" }),
    );

    await waitFor(() => expect(createPaymentCalls(fetchMock)).toHaveLength(1));
    const key = idempotencyKey(createPaymentCalls(fetchMock)[0]?.[1]);
    expect(key).not.toBe(ATTEMPT_KEY);
  });

  it("refetches the order after a canceled payment and restores retry without reload", async () => {
    let orderReads = 0;
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": () => ({
        body: {
          order: orderReads++ === 0 ? { ...order, status: "payment_pending" } : order,
        },
      }),
      "GET /orders/42/payment": {
        body: { payment: payment({ status: "canceled", confirmationUrl: null }) },
      },
      "POST /orders/42/payments": { status: 201, body: { payment: payment() } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Оплата отменена")).toBeInTheDocument();
    const retry = await within(paymentSection).findByRole("button", {
      name: "Оплатить снова",
    });
    await browser.click(retry);

    await waitFor(() => expect(createPaymentCalls(fetchMock)).toHaveLength(1));
    expect(orderReads).toBeGreaterThanOrEqual(2);
  });

  it("reuses a stored attempt key while no payment exists", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: null } },
      "POST /orders/42/payments": { status: 201, body: { payment: payment() } },
    });
    window.sessionStorage.setItem("localhand.payment.attempt.42", ATTEMPT_KEY);

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    await waitFor(() => expect(createPaymentCalls(fetchMock)).toHaveLength(1));
    expect(idempotencyKey(createPaymentCalls(fetchMock)[0]?.[1])).toBe(ATTEMPT_KEY);
  });

  it("resumes a pending attempt without a confirmation URL with the stored key", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": {
        body: { payment: payment({ confirmationUrl: null }) },
      },
      "POST /orders/42/payments": { status: 201, body: { payment: payment() } },
    });
    window.sessionStorage.setItem("localhand.payment.attempt.42", ATTEMPT_KEY);

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(
      await within(paymentSection).findByText("Не удалось подтвердить оплату"),
    ).toBeInTheDocument();
    expect(within(paymentSection).queryByText(/Проверяем оплату/)).not.toBeInTheDocument();

    await browser.click(
      await within(paymentSection).findByRole("button", { name: "Повторить оплату" }),
    );

    await waitFor(() => expect(goToExternal).toHaveBeenCalledWith(confirmationUrl));
    const calls = createPaymentCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(idempotencyKey(calls[0]?.[1])).toBe(ATTEMPT_KEY);
  });

  it("prioritizes a pending payment over the order status", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: payment() } },
    });

    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Ожидает оплаты")).toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("button", { name: "Оплатить" }),
    ).not.toBeInTheDocument();
    expect(within(paymentSection).getByText(price(509_900))).toBeInTheDocument();
    expect(screen.getAllByText("Ожидает оплаты").length).toBeGreaterThan(0);
    expect(screen.queryByText("Новый")).not.toBeInTheDocument();

    const continueButton = within(paymentSection).getByRole("link", { name: "Продолжить оплату" });
    expect(continueButton).toHaveAttribute("href", confirmationUrl);
  });

  it("shows manual_review as a separate payment state without a pay button", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order: { ...order, status: "payment_pending" } } },
      "GET /orders/42/payment": {
        body: { payment: payment({ status: "manual_review", confirmationUrl: null }) },
      },
    });

    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Требует проверки")).toBeInTheDocument();
    expect(within(paymentSection).getByText(/Поддержка разберётся/)).toBeInTheDocument();
    expect(within(paymentSection).queryByText(/runbook|ops/i)).not.toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("button", { name: /Оплатить/ }),
    ).not.toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("link", { name: /Продолжить оплату/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a succeeded payment and the paid date", async () => {
    const paidAt = "2026-11-27T12:00:00.000Z";
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order: { ...order, status: "paid" } } },
      "GET /orders/42/payment": {
        body: {
          payment: payment({ status: "succeeded", confirmationUrl: null, paidAt }),
        },
      },
    });

    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    expect(await within(paymentSection).findByText("Оплачен")).toBeInTheDocument();
    expect(
      within(paymentSection).getByText(`Оплачен ${formatOrderDate(paidAt)}`),
    ).toBeInTheDocument();
    expect(
      within(paymentSection).queryByRole("button", { name: /Оплатить/ }),
    ).not.toBeInTheDocument();
  });

  it("refetches the active payment on a 409 payment_in_progress", async () => {
    let paymentReads = 0;
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": () => {
        paymentReads += 1;
        return { body: { payment: paymentReads === 1 ? null : payment() } };
      },
      "POST /orders/42/payments": { status: 409, body: { error: "payment_in_progress" } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    expect(await within(paymentSection).findByText("Ожидает оплаты")).toBeInTheDocument();
    expect(paymentRequests(fetchMock).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/payment_in_progress/)).not.toBeInTheDocument();
  });

  it("refetches the order and payment on a 409 invalid_order_transition", async () => {
    let paymentReads = 0;
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": () => {
        paymentReads += 1;
        return { body: { payment: paymentReads === 1 ? null : payment() } };
      },
      "POST /orders/42/payments": { status: 409, body: { error: "invalid_order_transition" } },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    expect(await within(paymentSection).findByText("Ожидает оплаты")).toBeInTheDocument();
    expect(paymentReads).toBeGreaterThanOrEqual(2);
    expect(paymentRequests(fetchMock).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/invalid_order_transition/)).not.toBeInTheDocument();
  });

  it("rechecks seller payment availability after a 409 and restores the pay button", async () => {
    let paymentReads = 0;
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": () => {
        paymentReads += 1;
        return { body: { payment: null } };
      },
      "POST /orders/42/payments": {
        status: 409,
        body: { error: "seller_payment_unavailable" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    expect(
      await within(paymentSection).findByText(/Продавец не подключил приём платежей/),
    ).toBeInTheDocument();
    expect(paymentRequests(fetchMock).length).toBeGreaterThanOrEqual(1);

    await browser.click(
      await within(paymentSection).findByRole("button", { name: "Проверить ещё раз" }),
    );

    await waitFor(() => expect(paymentReads).toBeGreaterThanOrEqual(2));
    expect(
      await within(paymentSection).findByRole("button", { name: "Оплатить" }),
    ).toBeInTheDocument();
  });

  it("tells the buyer honestly when the seller has no connected payments", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order } },
      "GET /orders/42/payment": { body: { payment: null } },
      "POST /orders/42/payments": {
        status: 409,
        body: { error: "seller_payment_unavailable" },
      },
    });

    const browser = userEvent.setup();
    renderApp(["/orders/42"]);

    const paymentSection = await screen.findByRole("region", { name: "Оплата" });
    await browser.click(await within(paymentSection).findByRole("button", { name: "Оплатить" }));

    expect(
      await within(paymentSection).findByText(/Продавец не подключил приём платежей/),
    ).toBeInTheDocument();
    expect(within(paymentSection).getByText("Оплата не подключена")).toBeInTheDocument();
    expect(screen.queryByText(/seller_payment_unavailable|409/)).not.toBeInTheDocument();
  });

  it("polls the payment status after returning from the provider", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order: { ...order, status: "payment_pending" } } },
      "GET /orders/42/payment": () => {
        reads += 1;
        return {
          body: {
            payment:
              reads === 1
                ? payment()
                : payment({ status: "succeeded", confirmationUrl: null, paidAt: createdAt }),
          },
        };
      },
    });

    renderApp(["/orders/42?payment=return"]);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Оплата" })).toHaveTextContent("Ожидает оплаты"),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Оплата" })).toHaveTextContent("Оплачен"),
    );
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it("offers a manual re-check after 60 seconds of polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/42": { body: { order: { ...order, status: "payment_pending" } } },
      "GET /orders/42/payment": () => {
        reads += 1;
        return { body: { payment: payment() } };
      },
    });

    renderApp(["/orders/42?payment=return"]);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Оплата" })).toHaveTextContent("Ожидает оплаты"),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    const recheck = await screen.findByRole("button", { name: "Проверить ещё раз" });
    const before = reads;
    await act(async () => {
      recheck.click();
    });
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it("shows a not-found state for a missing or foreign order", async () => {
    installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
      "GET /orders/999": { status: 404, body: { error: "not_found" } },
    });

    renderApp(["/orders/999"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказ не найден" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К списку заказов" })).toHaveAttribute(
      "href",
      "/orders",
    );
  });

  it("does not request an invalid order id", async () => {
    const fetchMock = installFetchMock({
      "GET /auth/me": { body: { user: demoUser } },
    });

    renderApp(["/orders/not-a-number"]);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Заказ не найден" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/orders/not-a-number")),
    ).toBe(false);
  });
});
