import type { prismaAdapter } from "@better-auth/prisma-adapter";
import type { BetterAuthOptions } from "better-auth";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "node:http";
import type { AuthConfig } from "./config.js";
import type { RuntimePrismaClient } from "./prisma.js";

type PrismaAdapterFactory = typeof prismaAdapter;

export interface AuthenticatedIdentity {
  userId: string;
}

export interface VerifiedSession {
  user: { id: string };
}

export type SessionVerifier = (headers: IncomingHttpHeaders) => Promise<VerifiedSession | null>;
export type SessionResolver = (request: { headers: IncomingHttpHeaders }) => Promise<AuthenticatedIdentity | null>;

export interface AuthBoundary {
  handler: RequestHandler;
  resolveIdentity: SessionResolver;
}

export function createSessionResolver(verifySession: SessionVerifier): SessionResolver {
  return async (request) => {
    const verifiedSession = await verifySession(request.headers);
    return verifiedSession ? { userId: verifiedSession.user.id } : null;
  };
}

export function buildAuthOptions(
  prisma: RuntimePrismaClient,
  config: AuthConfig,
  createDatabase: PrismaAdapterFactory
): BetterAuthOptions {
  return {
    appName: "Map Chat",
    secret: config.secret,
    baseURL: config.baseUrl,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    database: createDatabase(prisma, { provider: "postgresql" }),
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret
      }
    },
    advanced: {
      useSecureCookies: new URL(config.baseUrl).protocol === "https:"
    }
  };
}

export async function createAuthBoundary(prisma: RuntimePrismaClient, config: AuthConfig): Promise<AuthBoundary> {
  const [{ prismaAdapter }, { betterAuth }, { fromNodeHeaders, toNodeHandler }] = await Promise.all([
    import("@better-auth/prisma-adapter"),
    import("better-auth"),
    import("better-auth/node")
  ]);
  const auth = betterAuth(buildAuthOptions(prisma, config, prismaAdapter));
  return {
    handler: toNodeHandler(auth),
    resolveIdentity: createSessionResolver(async (headers) => {
      const verifiedSession = await auth.api.getSession({
        headers: fromNodeHeaders(headers),
        query: { disableCookieCache: true, disableRefresh: true }
      });
      return verifiedSession ? { user: { id: verifiedSession.user.id } } : null;
    })
  };
}
