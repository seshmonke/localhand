import type { OrderPayment } from "@localhand/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentReadStatus } from "./payment-read.js";

const paidPayment: OrderPayment = {
  id: 5,
  status: "succeeded",
  amountKopecks: 100_000,
  currency: "RUB",
  confirmationUrl: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  paidAt: "2026-11-27T10:01:00.000Z",
};

afterEach(cleanup);

describe("PaymentReadStatus", () => {
  it("shows a loading label", () => {
    render(
      <PaymentReadStatus
        orderStatus="new"
        read={{ kind: "loading" }}
        emptyLabel="Оплата не начата"
      />,
    );

    expect(screen.getByText("Загружаем статус оплаты…")).toBeInTheDocument();
  });

  it("shows an error label with retry", async () => {
    const retry = vi.fn();
    const browser = userEvent.setup();
    render(
      <PaymentReadStatus
        orderStatus="new"
        read={{ kind: "error", retry }}
        emptyLabel="Оплата не начата"
      />,
    );

    expect(screen.getByText("Статус оплаты недоступен")).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Повторить" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the payment status when a payment exists", () => {
    render(
      <PaymentReadStatus
        orderStatus="paid"
        read={{ kind: "ready", payment: paidPayment }}
        emptyLabel="Оплата не начата"
      />,
    );

    expect(screen.getByText("Оплачен")).toBeInTheDocument();
  });

  it("falls back to the empty label for an unpaid order without a payment", () => {
    render(
      <PaymentReadStatus
        orderStatus="new"
        read={{ kind: "ready", payment: null }}
        emptyLabel="Оплата не начата"
      />,
    );

    expect(screen.getByText("Оплата не начата")).toBeInTheDocument();
  });

  it("never renders a paid order without a payment row as empty", () => {
    render(
      <PaymentReadStatus
        orderStatus="paid"
        read={{ kind: "ready", payment: null }}
        emptyLabel="Оплата не начата"
      />,
    );

    expect(screen.getByText("Оплачен")).toBeInTheDocument();
    expect(screen.queryByText("Оплата не начата")).not.toBeInTheDocument();
  });
});
