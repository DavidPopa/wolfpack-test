import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import type { RoomReadPrismaClient } from "./rooms/repository.js";

export interface RuntimePrismaClient extends RoomReadPrismaClient {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
