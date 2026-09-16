import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for data foundation integration tests");

const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });

async function inRolledBackTransaction(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function insertUser(client: PoolClient, id: string): Promise<void> {
  await client.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, "Data foundation fixture", `${id}@example.invalid`]
  );
}

describe("Prisma data foundation", () => {
  afterAll(async () => pool.end());

  it("contains every Better Auth and domain table", async () => {
    const requiredTables = ["account", "message", "room", "session", "user", "verification"];
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [requiredTables]
    );
    expect(result.rows.map(({ table_name }) => table_name)).toEqual(requiredTables);
  });

  it("has the required user, room, and message foreign keys", async () => {
    const result = await pool.query<{ constraint_name: string; child_table: string; parent_table: string }>(
      `SELECT constraint_row.conname AS constraint_name,
              child.relname AS child_table,
              parent.relname AS parent_table
       FROM pg_constraint AS constraint_row
       JOIN pg_class AS child ON child.oid = constraint_row.conrelid
       JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
       JOIN pg_namespace AS namespace ON namespace.oid = child.relnamespace
       WHERE constraint_row.contype = 'f'
         AND namespace.nspname = current_schema()
       ORDER BY constraint_row.conname`
    );
    expect(result.rows).toEqual(expect.arrayContaining([
      { constraint_name: "account_userId_fkey", child_table: "account", parent_table: "user" },
      { constraint_name: "message_authorId_fkey", child_table: "message", parent_table: "user" },
      { constraint_name: "message_roomId_fkey", child_table: "message", parent_table: "room" },
      { constraint_name: "room_creatorId_fkey", child_table: "room", parent_table: "user" },
      { constraint_name: "session_userId_fkey", child_table: "session", parent_table: "user" }
    ]));
  });

  it("enforces room creator/request idempotency", async () => {
    await inRolledBackTransaction(async (client) => {
      const creatorId = randomUUID();
      const requestId = randomUUID();
      await insertUser(client, creatorId);
      await client.query(
        `INSERT INTO "room" ("id", "title", "latitude", "longitude", "creatorId", "clientRequestId")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), "Fixture room", 44.4268, 26.1025, creatorId, requestId]
      );
      await expect(client.query(
        `INSERT INTO "room" ("id", "title", "latitude", "longitude", "creatorId", "clientRequestId")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), "Duplicate fixture room", 44.43, 26.11, creatorId, requestId]
      )).rejects.toMatchObject({ code: "23505", constraint: "room_creatorId_clientRequestId_key" });
    });
  });

  it("enforces message author/request idempotency", async () => {
    await inRolledBackTransaction(async (client) => {
      const authorId = randomUUID();
      const roomId = randomUUID();
      const requestId = randomUUID();
      await insertUser(client, authorId);
      await client.query(
        `INSERT INTO "room" ("id", "title", "latitude", "longitude", "creatorId", "clientRequestId")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [roomId, "Fixture room", 44.4268, 26.1025, authorId, randomUUID()]
      );
      await client.query(
        `INSERT INTO "message" ("id", "roomId", "authorId", "body", "clientRequestId")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), roomId, authorId, "Fixture message", requestId]
      );
      await expect(client.query(
        `INSERT INTO "message" ("id", "roomId", "authorId", "body", "clientRequestId")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), roomId, authorId, "Duplicate fixture message", requestId]
      )).rejects.toMatchObject({ code: "23505", constraint: "message_authorId_clientRequestId_key" });
    });
  });

  it("indexes public rooms and chronological message cursors in query order", async () => {
    const result = await pool.query<{ index_name: string; is_unique: boolean; columns: string[] }>(
      `SELECT index_relation.relname AS index_name,
              index_row.indisunique AS is_unique,
              array_agg(attribute.attname::text ORDER BY indexed_column.ordinality) AS columns
       FROM pg_index AS index_row
       JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
       JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
       JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
       CROSS JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY AS indexed_column(attnum, ordinality)
       JOIN pg_attribute AS attribute
         ON attribute.attrelid = table_relation.oid AND attribute.attnum = indexed_column.attnum
       WHERE namespace.nspname = current_schema() AND table_relation.relname IN ('room', 'message')
       GROUP BY index_relation.relname, index_row.indisunique
       ORDER BY index_relation.relname`
    );
    expect(result.rows).toEqual(expect.arrayContaining([
      { index_name: "message_authorId_clientRequestId_key", is_unique: true, columns: ["authorId", "clientRequestId"] },
      { index_name: "message_roomId_createdAt_id_idx", is_unique: false, columns: ["roomId", "createdAt", "id"] },
      { index_name: "room_createdAt_id_idx", is_unique: false, columns: ["createdAt", "id"] },
      { index_name: "room_creatorId_clientRequestId_key", is_unique: true, columns: ["creatorId", "clientRequestId"] }
    ]));
  });
});
