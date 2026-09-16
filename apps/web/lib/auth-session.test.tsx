import { act, renderHook } from "@testing-library/react";
import type { BetterFetchError } from "better-auth/react";
import type { AuthSession } from "./auth-client";
import { createUseAuthSession, getSafeReturnTarget, type AuthSessionHook } from "./auth-session";

jest.mock("./auth-client", () => ({ authClient: { useSession: jest.fn() } }));

const session = {
  session: { id: "session-id", userId: "user-id" },
  user: { id: "user-id", name: "Test User", email: "test@example.invalid" }
} as AuthSession;

function renderMockedSession(initial: ReturnType<AuthSessionHook>) {
  let snapshot = initial;
  const boundary = jest.fn(() => snapshot);
  const { result, rerender } = renderHook(createUseAuthSession(boundary));

  return {
    boundary,
    result,
    update(next: ReturnType<AuthSessionHook>) {
      snapshot = next;
      rerender();
    }
  };
}

describe("auth session state adapter with a mocked Better Auth client boundary", () => {
  const refetch = jest.fn(async () => undefined);

  beforeEach(() => refetch.mockClear());

  it("projects reactive loading, signed-out, and signed-in snapshots without copied state", () => {
    const view = renderMockedSession({ data: null, error: null, isPending: true, refetch });
    expect(view.result.current).toEqual({ status: "loading" });

    view.update({ data: null, error: null, isPending: false, refetch });
    expect(view.result.current).toEqual({ status: "signed-out" });

    view.update({ data: session, error: null, isPending: false, refetch });
    expect(view.result.current).toEqual({ status: "signed-in", session });

    view.update({ data: null, error: null, isPending: false, refetch });
    expect(view.result.current).toEqual({ status: "signed-out" });
    expect(view.boundary).toHaveBeenCalledTimes(4);
  });

  it("exposes a recoverable error whose retry delegates to Better Auth", async () => {
    const error = { message: "Session unavailable", status: 503 } as BetterFetchError;
    const view = renderMockedSession({ data: null, error, isPending: false, refetch });

    expect(view.result.current.status).toBe("error");
    if (view.result.current.status !== "error") throw new Error("Expected error state");

    await act(() => view.result.current.status === "error" ? view.result.current.retry() : undefined);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("same-origin return targets", () => {
  const origin = "https://chat.example";

  it.each([
    ["/rooms/one?draft=1#latest", "/rooms/one?draft=1#latest"],
    ["https://chat.example/rooms/two", "/rooms/two"],
    ["rooms/three", "/rooms/three"]
  ])("keeps an in-app target %s", (candidate, expected) => {
    expect(getSafeReturnTarget(candidate, origin)).toBe(expected);
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "javascript:alert(1)",
    "\\\\attacker.example/steal"
  ])("replaces escaping target %s with the application root", (candidate) => {
    expect(getSafeReturnTarget(candidate, origin)).toBe("/");
  });

  it("uses the application root for absent or invalid input", () => {
    expect(getSafeReturnTarget(undefined, origin)).toBe("/");
    expect(getSafeReturnTarget("/rooms/one", "not-an-origin")).toBe("/");
  });
});
