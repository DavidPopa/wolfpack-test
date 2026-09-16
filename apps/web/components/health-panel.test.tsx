import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { HealthPanel } from "./health-panel";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
beforeEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: jest.fn() }));
afterEach(() => jest.restoreAllMocks());

it("shows loading and then a validated success", async () => {
  let resolveFetch: ((value: Response) => void) | undefined;
  jest.mocked(globalThis.fetch).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
  render(<HealthPanel />, { wrapper: wrapper() });
  expect(screen.getByRole("status")).toHaveTextContent("Checking API health");
  resolveFetch?.(response({ status: "ok", service: "api" }));
  expect(await screen.findByText(/API status:/)).toHaveTextContent("ok");
});
it("shows a retryable error and retries using the labelled button", async () => {
  const fetchMock = jest.mocked(globalThis.fetch).mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response({ status: "ok", service: "api" }));
  const user = userEvent.setup();
  render(<HealthPanel />, { wrapper: wrapper() });
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be completed");
  const retry = screen.getByRole("button", { name: "Retry health check" });
  retry.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByText(/API status:/)).toHaveTextContent("ok");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
