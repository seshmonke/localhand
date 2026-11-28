import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock } from "../test/mock-api.js";
import { renderApp } from "../test/render-app.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotFoundPage copy", () => {
  it("renders the 404 copy and a link back to the catalog", () => {
    installFetchMock({});

    renderApp(["/missing-page"]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Страница не найдена" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Такой страницы нет. Вернитесь в каталог и начните оттуда."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "В каталог" })).toHaveAttribute("href", "/");
  });
});
