import { vi } from "vitest";

type MockRequest = {
  path: string;
  method: string;
  body: unknown;
  query: Record<string, string>;
  url: string;
};

export type MockResult = {
  status?: number;
  body?: unknown;
};

export type MockHandler = (request: MockRequest) => MockResult | Promise<MockResult>;

export type MockRoutes = Record<string, MockResult | MockHandler>;

export function installFetchMock(routes: MockRoutes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsedUrl = new URL(url, "http://localhost");
    const path = parsedUrl.pathname.replace(/^\/api/, "");
    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? (JSON.parse(rawBody) as unknown) : undefined;

    const route = routes[`${method} ${path}`];
    if (!route) {
      throw new Error(`Unexpected request: ${method} ${path}`);
    }

    const result =
      typeof route === "function" ? await route({ path, method, body, query, url }) : route;
    const status = result.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => result.body,
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
