import { formatRubles, kopecks, type DeliverySnapshot } from "@localhand/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DELIVERY_STATUS_LABELS, DeliverySummaryCard } from "./DeliverySummaryCard.js";

// A viewer kind, not a DOM ARIA role; non-literal values avoid jsx-a11y/aria-role.
const buyerRole = "buyer" as const;
const sellerRole = "seller" as const;

afterEach(cleanup);

const lastStatusAt = "2026-11-27T12:00:00.000Z";
const longAddress =
  "Санкт-Петербург, Невский проспект, 100, литера А, помещение 12-Н, пункт выдачи «Тестовый на Невском», вход со двора";

function delivery(overrides: Partial<DeliverySnapshot> = {}): DeliverySnapshot {
  return {
    provider: "cdek",
    status: "delivered",
    cityCode: 44,
    cityName: "Москва",
    pointCode: "MSK001",
    pointAddress: "ул. Тестовая, 1, ПВЗ «Тестовый»",
    recipientName: "Иван Тестов",
    tariffCode: "136",
    tariffName: "Посылка склад-ПВЗ",
    priceKopecks: 45_000,
    periodMin: 2,
    periodMax: 5,
    providerOrderId: "cdek-order-987654",
    providerNumber: "1234567890",
    carrier: null,
    trackNumber: null,
    lastStatusCode: "DELIVERED",
    lastStatusAt,
    ...overrides,
  };
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });

function price(value: number): string {
  return formatRubles(kopecks(value)).replace(/\s+/g, " ");
}

describe("DeliverySummaryCard", () => {
  it("shows one neutral line and no definition list without delivery", () => {
    const { container } = render(<DeliverySummaryCard delivery={null} role={buyerRole} />);

    const region = screen.getByRole("region", { name: "Доставка" });
    expect(within(region).getByText("Доставка не оформлена")).toBeInTheDocument();
    expect(container.querySelector("dl")).toBeNull();
  });

  it("maps every delivery status to a Russian label", () => {
    expect(DELIVERY_STATUS_LABELS).toEqual({
      quoted: "Ожидает отправки",
      created: "Отправление создано",
      in_transit: "В пути",
      delivered: "Доставлено",
      canceled: "Отменено",
      manual: "Ручной трек",
      failed: "Ошибка доставки",
    });
  });

  it("shows the delivered snapshot with a wrapping address, track and formatted status date", () => {
    render(
      <DeliverySummaryCard
        delivery={delivery({
          pointAddress: longAddress,
          carrier: "СДЭК",
          trackNumber: "1234567890",
        })}
        role={buyerRole}
      />,
    );

    const region = screen.getByRole("region", { name: "Доставка" });
    expect(within(region).getByText("Доставлено")).toBeInTheDocument();
    expect(within(region).getByText(longAddress)).toHaveClass("break-words");
    expect(within(region).getByText("Иван Тестов")).toBeInTheDocument();
    expect(within(region).getByText(price(45_000))).toBeInTheDocument();
    expect(within(region).getByText("Посылка склад-ПВЗ")).toBeInTheDocument();
    expect(within(region).getByText("СДЭК · 1234567890")).toBeInTheDocument();
    expect(
      within(region).getByText(dateFormatter.format(new Date(lastStatusAt))),
    ).toBeInTheDocument();
    expect(within(region).queryByText("cdek-order-987654")).not.toBeInTheDocument();
    expect(within(region).queryByText("DELIVERED")).not.toBeInTheDocument();
  });

  it("shows periods and manual carriers for in-transit and manual deliveries", () => {
    render(
      <>
        <DeliverySummaryCard
          delivery={delivery({
            status: "in_transit",
            trackNumber: "9876543210",
            lastStatusAt: null,
          })}
          role={buyerRole}
        />
        <DeliverySummaryCard
          delivery={delivery({
            status: "manual",
            carrier: "Почта России",
            trackNumber: "RA123456789RU",
            periodMin: null,
            periodMax: null,
            lastStatusAt: null,
          })}
          role={sellerRole}
        />
      </>,
    );

    expect(screen.getByText("В пути")).toBeInTheDocument();
    expect(screen.getByText("2–5 дн.")).toBeInTheDocument();
    expect(screen.getByText("Перевозчик · 9876543210")).toBeInTheDocument();
    expect(screen.getByText("Почта России · RA123456789RU")).toBeInTheDocument();
  });

  it("hides placeholder city, PVZ and recipient rows for a legacy manual snapshot", () => {
    render(
      <DeliverySummaryCard
        delivery={delivery({
          provider: "manual",
          status: "manual",
          cityCode: 0,
          cityName: "Не указан",
          pointCode: "manual",
          pointAddress: "Не указан",
          recipientName: "Не указан",
          tariffCode: null,
          tariffName: null,
          priceKopecks: 0,
          periodMin: null,
          periodMax: null,
          providerOrderId: null,
          providerNumber: null,
          carrier: "Почта России",
          trackNumber: "RA123456789RU",
          lastStatusCode: "MANUAL",
        })}
        role={buyerRole}
      />,
    );

    const region = screen.getByRole("region", { name: "Доставка" });
    expect(within(region).getByText("Ручной трек")).toBeInTheDocument();
    expect(within(region).getByText(/Город, ПВЗ и получатель не сохранены/)).toBeInTheDocument();
    expect(within(region).queryByText("Не указан")).toBeNull();
    expect(within(region).getByText("Почта России · RA123456789RU")).toBeInTheDocument();
  });
});
