import { createAuthClient } from "better-auth/react";

export const AUTH_BASE_PATH = "/api/auth";

// Omitting baseURL keeps every browser request on the current application origin.
export const authClient = createAuthClient({ basePath: AUTH_BASE_PATH });

export type AuthSession = typeof authClient.$Infer.Session;
