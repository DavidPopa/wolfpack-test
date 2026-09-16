import { connect } from "node:net";

const targets = [
  { name: "PostgreSQL", host: process.env.TEST_POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.TEST_POSTGRES_PORT ?? "55431") },
  { name: "Redis", host: process.env.TEST_REDIS_HOST ?? "127.0.0.1", port: Number(process.env.TEST_REDIS_PORT ?? "56381") }
];

function reachable({ host, port }) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(750, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

const results = await Promise.all(targets.map(async (target) => ({ ...target, ok: await reachable(target) })));
const missing = results.filter((result) => !result.ok);
if (missing.length) {
  process.stderr.write(`Required isolated test services unavailable: ${missing.map(({ name, host, port }) => `${name} at ${host}:${port}`).join(", ")}. Run pnpm services:test:up.\n`);
  process.exitCode = 1;
}
