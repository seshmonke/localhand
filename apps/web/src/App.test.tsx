import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the product goal", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /секонд-хенд и локальные бренды/i,
      }),
    ).toBeInTheDocument();
  });
});
