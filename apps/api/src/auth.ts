import type { prismaAdapter } from "@better-auth/prisma-adapter";
import type { BetterAuthOptions } from "better-auth";
import type { RequestHandler } from "express";
import type { AuthConfig } from "./config.js";
import type { RuntimePrismaClient } from "./prisma.js";

type PrismaAdapterFactory = typeof prismaAdapter;

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

export async function createAuthHandler(prisma: RuntimePrismaClient, config: AuthConfig): Promise<RequestHandler> {
  const [{ prismaAdapter }, { betterAuth }, { toNodeHandler }] = await Promise.all([
    import("@better-auth/prisma-adapter"),
    import("better-auth"),
    import("better-auth/node")
  ]);
  const auth = betterAuth(buildAuthOptions(prisma, config, prismaAdapter));
  return toNodeHandler(auth);
}
