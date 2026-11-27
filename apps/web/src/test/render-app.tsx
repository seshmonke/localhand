import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { App } from "../App.js";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" hidden>
      {`${location.pathname}${location.search}`}
    </div>
  );
}

export function renderApp(initialEntries: string[] = ["/"], externalClient?: QueryClient) {
  const client =
    externalClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });

  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...result, client };
}
