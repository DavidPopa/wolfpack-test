"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { getSafeReturnTarget, useAuthSession, type AuthSessionState } from "@/lib/auth-session";
import { Button } from "./ui/button";

type AuthActionResult = { error?: { message?: string | undefined } | null } | void;
type AuthAction = () => Promise<AuthActionResult>;

type AuthPanelViewProps = {
  state: AuthSessionState;
  onSignIn: AuthAction;
  onSignOut: AuthAction;
};

function actionError(result: AuthActionResult, fallback: string) {
  if (result?.error) throw new Error(result.error.message || fallback);
}

export async function signInWithGoogle(client: typeof authClient = authClient) {
  const callbackURL = getSafeReturnTarget(window.location.href, window.location.origin);
  const result = await client.signIn.social({ provider: "google", callbackURL });
  actionError(result, "Google sign-in could not be started.");
}

export async function signOut(client: typeof authClient = authClient) {
  const result = await client.signOut();
  actionError(result, "Sign out could not be completed.");
}

export function AuthPanelView({ state, onSignIn, onSignOut }: AuthPanelViewProps) {
  const [pendingAction, setPendingAction] = useState<"sign-in" | "sign-out" | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  async function runAction(kind: "sign-in" | "sign-out", action: AuthAction) {
    setActionErrorMessage(null);
    setPendingAction(kind);
    try {
      const result = await action();
      actionError(result, kind === "sign-in" ? "Google sign-in could not be started." : "Sign out could not be completed.");
    } catch {
      setActionErrorMessage(kind === "sign-in"
        ? "Google sign-in could not be started. Please try again."
        : "We could not sign you out. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return <section className="auth-card" aria-labelledby="account-title">
    <div className="auth-card__heading">
      <p className="eyebrow">Your account</p>
      <h2 id="account-title">Join the conversation</h2>
    </div>

    {state.status === "loading" && <div className="auth-state auth-state--loading" role="status">
      <span className="status-mark" aria-hidden="true" />
      <div><strong>Checking your sign-in status</strong><p>This should only take a moment.</p></div>
    </div>}

    {state.status === "error" && <div className="auth-state auth-state--error" role="alert">
      <span className="status-symbol" aria-hidden="true">!</span>
      <div>
        <strong>We could not check your session</strong>
        <p>Your account is unchanged. Check your connection and try again.</p>
        <Button type="button" variant="secondary" onClick={() => void state.retry()}>Retry session check</Button>
      </div>
    </div>}

    {state.status === "signed-out" && <div className="auth-state">
      <p className="state-label"><span className="state-dot" aria-hidden="true" /> Signed out</p>
      <p>Sign in to create rooms and send messages. Reading public conversations will stay open to everyone.</p>
      <Button type="button" aria-label="Continue with Google" disabled={pendingAction !== null} onClick={() => void runAction("sign-in", onSignIn)}>
        <span className="google-mark" aria-hidden="true">G</span>
        {pendingAction === "sign-in" ? "Opening Google…" : "Continue with Google"}
      </Button>
      <p className="auth-note">Google is the only sign-in option. No local password is stored.</p>
    </div>}

    {state.status === "signed-in" && <div className="auth-state">
      <p className="state-label state-label--success"><span className="state-dot" aria-hidden="true" /> Signed in</p>
      <p className="identity">Welcome, <strong>{state.session.user.name || "Google user"}</strong>.</p>
      <p>You can create rooms and take part in conversations.</p>
      <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => void runAction("sign-out", onSignOut)}>
        {pendingAction === "sign-out" ? "Signing out…" : "Sign out"}
      </Button>
    </div>}

    {pendingAction && <p className="sr-only" role="status">{pendingAction === "sign-in" ? "Opening Google sign-in" : "Signing out"}</p>}
    {actionErrorMessage && <p className="action-error" role="alert">{actionErrorMessage}</p>}
  </section>;
}

export function AuthPanel() {
  const state = useAuthSession();
  return <AuthPanelView state={state} onSignIn={signInWithGoogle} onSignOut={signOut} />;
}
