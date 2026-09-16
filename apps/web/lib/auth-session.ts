"use client";

import type { BetterFetchError } from "better-auth/react";
import { authClient, type AuthSession } from "./auth-client";

type SessionSnapshot = {
  data: AuthSession | null;
  error: BetterFetchError | null;
  isPending: boolean;
  refetch: () => Promise<void>;
};

export type AuthSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; session: AuthSession }
  | { status: "error"; error: BetterFetchError; retry: () => Promise<void> };

export type AuthSessionHook = () => SessionSnapshot;

export function createUseAuthSession(useSession: AuthSessionHook) {
  return function useAuthSession(): AuthSessionState {
    const session = useSession();

    if (session.isPending) return { status: "loading" };
    if (session.error) return { status: "error", error: session.error, retry: session.refetch };
    if (!session.data) return { status: "signed-out" };

    return { status: "signed-in", session: session.data };
  };
}

export const useAuthSession = createUseAuthSession(authClient.useSession);

export function getSafeReturnTarget(candidate: string | null | undefined, appOrigin: string): string {
  if (!candidate) return "/";

  try {
    const origin = new URL(appOrigin).origin;
    const target = new URL(candidate, `${origin}/`);
    if (target.origin !== origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
