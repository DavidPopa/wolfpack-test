import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BetterFetchError } from "better-auth/react";
import type { AuthSession } from "@/lib/auth-client";
import type { AuthSessionState } from "@/lib/auth-session";
import { AuthPanelView, signInWithGoogle, signOut } from "./auth-panel";

jest.mock("@/lib/auth-client", () => ({ authClient: { signIn: { social: jest.fn() }, signOut: jest.fn(), useSession: jest.fn() } }));

const signedInState = {
  status: "signed-in",
  session: {
    session: { id: "session-id", userId: "user-id" },
    user: { id: "user-id", name: "Avery Stone", email: "private@example.invalid" }
  } as AuthSession
} satisfies AuthSessionState;

function renderState(state: AuthSessionState, actions: { onSignIn?: jest.Mock; onSignOut?: jest.Mock } = {}) {
  const onSignIn = actions.onSignIn ?? jest.fn(async () => undefined);
  const onSignOut = actions.onSignOut ?? jest.fn(async () => undefined);
  return { ...render(<AuthPanelView state={state} onSignIn={onSignIn} onSignOut={onSignOut} />), onSignIn, onSignOut };
}

describe("auth shell states at the mocked session boundary", () => {
  it("renders clear loading, signed-out, signed-in, and session error states", () => {
    const retry = jest.fn(async () => undefined);
    const view = renderState({ status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Checking your sign-in status");
    view.rerender(<AuthPanelView state={{ status: "signed-out" }} onSignIn={view.onSignIn} onSignOut={view.onSignOut} />);
    expect(screen.getByText("Signed out")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.queryByText(/email|password sign-in/i)).not.toBeInTheDocument();
    view.rerender(<AuthPanelView state={signedInState} onSignIn={view.onSignIn} onSignOut={view.onSignOut} />);
    expect(screen.getByText("Signed in")).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.queryByText("private@example.invalid")).not.toBeInTheDocument();
    const error = { message: "unavailable", status: 503 } as BetterFetchError;
    view.rerender(<AuthPanelView state={{ status: "error", error, retry }} onSignIn={view.onSignIn} onSignOut={view.onSignOut} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not check your session");
    expect(screen.getByRole("button", { name: "Retry session check" })).toBeEnabled();
  });

  it("supports keyboard sign-in and a recoverable action failure", async () => {
    const onSignIn = jest.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderState({ status: "signed-out" }, { onSignIn });
    await user.tab();
    const signInButton = screen.getByRole("button", { name: "Continue with Google" });
    expect(signInButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be started");
    await user.keyboard("{Enter}");
    expect(onSignIn).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports keyboard retry and logout, then follows the next reactive session state", async () => {
    const retry = jest.fn(async () => undefined);
    const onSignOut = jest.fn(async () => undefined);
    const user = userEvent.setup();
    const error = { message: "unavailable", status: 503 } as BetterFetchError;
    const view = renderState({ status: "error", error, retry }, { onSignOut });
    await user.tab();
    expect(screen.getByRole("button", { name: "Retry session check" })).toHaveFocus();
    await user.keyboard(" ");
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(<AuthPanelView state={signedInState} onSignIn={view.onSignIn} onSignOut={onSignOut} />);
    const signOutButton = screen.getByRole("button", { name: "Sign out" });
    signOutButton.focus();
    await user.keyboard("{Enter}");
    expect(onSignOut).toHaveBeenCalledTimes(1);
    view.rerender(<AuthPanelView state={{ status: "signed-out" }} onSignIn={view.onSignIn} onSignOut={onSignOut} />);
    expect(screen.getByText("Signed out")).toBeVisible();
    expect(screen.queryByText("Avery Stone")).not.toBeInTheDocument();
  });
});

describe("Better Auth actions", () => {
  it("starts only Google sign-in with a same-origin return target", async () => {
    window.history.replaceState({}, "", "/?draft=room#composer");
    const client = { signIn: { social: jest.fn(async () => ({ data: { url: "https://accounts.google.test" }, error: null })) }, signOut: jest.fn() } as unknown as NonNullable<Parameters<typeof signInWithGoogle>[0]>;
    await signInWithGoogle(client);
    expect(client.signIn.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/?draft=room#composer" });
  });

  it("ends the Better Auth session and surfaces returned failures", async () => {
    const successClient = { signIn: { social: jest.fn() }, signOut: jest.fn(async () => ({ data: { success: true }, error: null })) } as unknown as NonNullable<Parameters<typeof signOut>[0]>;
    await signOut(successClient);
    expect(successClient.signOut).toHaveBeenCalledTimes(1);
    const failedClient = { signIn: { social: jest.fn() }, signOut: jest.fn(async () => ({ data: null, error: { message: "Session unavailable" } })) } as unknown as NonNullable<Parameters<typeof signOut>[0]>;
    await expect(signOut(failedClient)).rejects.toThrow("Session unavailable");
  });
});
