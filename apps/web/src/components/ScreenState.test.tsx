import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenState } from "./ScreenState.js";

afterEach(cleanup);

describe("ScreenState", () => {
  it("announces loading as a polite status", () => {
    render(<ScreenState kind="loading" title="Загрузка каталога" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Загрузка каталога");
  });

  it("announces errors as an alert", () => {
    render(<ScreenState kind="error" title="Каталог не загрузился" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Каталог не загрузился");
  });
});
