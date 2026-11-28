import type { PaymentStatus } from "@localhand/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaymentStatusBadge } from "./PaymentStatusBadge.js";

const cases: Array<[PaymentStatus, string]> = [
  ["pending", "Ожидает оплаты"],
  ["succeeded", "Оплачен"],
  ["canceled", "Оплата отменена"],
  ["failed", "Оплата не прошла"],
  ["manual_review", "Требует проверки"],
];

afterEach(cleanup);

describe("PaymentStatusBadge", () => {
  it.each(cases)("renders %s as %s", (status, label) => {
    render(<PaymentStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
