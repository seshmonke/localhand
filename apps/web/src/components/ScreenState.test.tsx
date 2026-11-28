import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductGridSkeleton, ScreenState } from "./ScreenState.js";

afterEach(cleanup);

describe("ScreenState", () => {
  it("announces loading as a polite status", () => {
    render(<ScreenState kind="loading" title="Загрузка каталога" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Загрузка");
    expect(status).toHaveTextContent("Загрузка каталога");
  });

  it("labels the empty state", () => {
    render(<ScreenState kind="empty" title="Товаров пока нет" />);

    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Товаров пока нет")).toBeInTheDocument();
  });

  it("announces errors as an alert", () => {
    render(<ScreenState kind="error" title="Каталог не загрузился" />);

    expect(screen.getByText("Ошибка")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Каталог не загрузился");
  });

  it("labels the product grid skeleton", () => {
    render(<ProductGridSkeleton />);

    expect(screen.getByText("Загрузка товаров")).toBeInTheDocument();
  });
});
