import type { MessageCursor } from "./cursor.js";
import type { PrismaClient } from "../generated/prisma/client.js";

export interface MessageReadRecord {
  id: string;
  roomId: string;
  body: string;
  createdAt: Date;
  author: { name: string; image: string | null };
}

export interface MessageCreateRecord extends MessageReadRecord {
  authorId: string;
  clientRequestId: string;
}

export interface CreateMessageData {
  roomId: string;
  authorId: string;
  body: string;
  clientRequestId: string;
}

export type MessagePageDirection = "newest" | "before" | "after";

export interface MessagePageRequest {
  roomId: string;
  direction: MessagePageDirection;
  cursor?: MessageCursor;
  limit: number;
}

export interface MessagePageRecords {
  messages: MessageReadRecord[];
  hasOlder: boolean;
  hasNewer: boolean;
}

const publicMessageSelect = {
  id: true,
  roomId: true,
  body: true,
  createdAt: true,
  author: { select: { name: true, image: true } }
} as const;

const messageCreateSelect = {
  ...publicMessageSelect,
  authorId: true,
  clientRequestId: true
} as const;

type CursorComparison =
  | { createdAt: { lt: Date }; id?: never }
  | { createdAt: { gt: Date }; id?: never }
  | { createdAt: Date; id: { lt: string } }
  | { createdAt: Date; id: { gt: string } };

interface MessageReadPrismaQuery {
  where: { roomId: string; OR?: CursorComparison[] };
  select: typeof publicMessageSelect;
  orderBy: [{ createdAt: "asc" | "desc" }, { id: "asc" | "desc" }];
  take: number;
}

export interface MessageReadPrismaClient {
  room: {
    findUnique: (query: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
  message: {
    findFirst: (query: {
      where: { id: string; roomId: string; createdAt: Date };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    findMany: (query: MessageReadPrismaQuery) => Promise<MessageReadRecord[]>;
  };
}

export interface MessageReadRepository {
  roomExists: (roomId: string) => Promise<boolean>;
  cursorExists: (roomId: string, cursor: MessageCursor) => Promise<boolean>;
  listPage: (request: MessagePageRequest) => Promise<MessagePageRecords>;
}

export interface MessageCreatePrismaClient {
  room: {
    findUnique: (query: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
  message: {
    findUnique: (query: {
      where: { authorId_clientRequestId: { authorId: string; clientRequestId: string } };
      select: typeof messageCreateSelect;
    }) => Promise<MessageCreateRecord | null>;
    create: (query: {
      data: CreateMessageData;
      select: typeof messageCreateSelect;
    }) => Promise<MessageCreateRecord>;
  };
}

export interface MessageCreateRepository {
  roomExists: (roomId: string) => Promise<boolean>;
  findByAuthorRequest: (authorId: string, clientRequestId: string) => Promise<MessageCreateRecord | null>;
  createOrFindAfterConflict: (data: CreateMessageData) => Promise<{ created: boolean; message: MessageCreateRecord }>;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function cursorWhere(direction: "before" | "after", cursor: MessageCursor): CursorComparison[] {
  const comparison = direction === "before" ? "lt" : "gt";
  return [
    { createdAt: { [comparison]: cursor.createdAt } } as CursorComparison,
    { createdAt: cursor.createdAt, id: { [comparison]: cursor.id } } as CursorComparison
  ];
}

export function createPrismaMessageReadRepository(prisma: PrismaClient): MessageReadRepository;
export function createPrismaMessageReadRepository(prisma: MessageReadPrismaClient): MessageReadRepository;
export function createPrismaMessageReadRepository(
  prisma: PrismaClient | MessageReadPrismaClient
): MessageReadRepository {
  const client = prisma as MessageReadPrismaClient;
  return {
    async roomExists(roomId) {
      return (await client.room.findUnique({ where: { id: roomId }, select: { id: true } })) !== null;
    },
    async cursorExists(roomId, cursor) {
      return (await client.message.findFirst({
        where: { id: cursor.id, roomId, createdAt: cursor.createdAt },
        select: { id: true }
      })) !== null;
    },
    async listPage(request) {
      const descending = request.direction !== "after";
      const rows = await client.message.findMany({
        where: {
          roomId: request.roomId,
          ...(request.cursor ? { OR: cursorWhere(request.direction as "before" | "after", request.cursor) } : {})
        },
        select: publicMessageSelect,
        orderBy: [
          { createdAt: descending ? "desc" : "asc" },
          { id: descending ? "desc" : "asc" }
        ],
        take: request.limit + 1
      });
      const hasExtra = rows.length > request.limit;
      const limited = rows.slice(0, request.limit);
      const messages = descending ? limited.reverse() : limited;
      return {
        messages,
        hasOlder: request.direction === "after" || hasExtra,
        hasNewer: request.direction === "before" || (request.direction === "after" && hasExtra)
      };
    }
  };
}

export function createPrismaMessageCreateRepository(prisma: MessageCreatePrismaClient): MessageCreateRepository {
  const findByAuthorRequest = (authorId: string, clientRequestId: string) => prisma.message.findUnique({
    where: { authorId_clientRequestId: { authorId, clientRequestId } },
    select: messageCreateSelect
  });

  return {
    async roomExists(roomId) {
      return (await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } })) !== null;
    },
    findByAuthorRequest,
    async createOrFindAfterConflict(data) {
      try {
        return {
          created: true,
          message: await prisma.message.create({ data, select: messageCreateSelect })
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const existing = await findByAuthorRequest(data.authorId, data.clientRequestId);
        if (!existing) throw error;
        return { created: false, message: existing };
      }
    }
  };
}
