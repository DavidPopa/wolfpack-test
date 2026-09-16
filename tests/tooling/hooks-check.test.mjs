import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function fakePnpm() {
  const directory = await mkdtemp(join(tmpdir(), "mapchat-hooks-"));
  const executable = join(directory, "pnpm");
  await writeFile(executable, "#!/bin/sh\necho \"$*\" >> \"$HOOK_LOG\"\nif [ \"${FAKE_FAIL_ON:-}\" = \"$*\" ]; then exit 23; fi\n", "utf8");
  await chmod(executable, 0o755);
  return directory;
}

test("Husky entrypoint runs the five gates in order", async () => {
  const bin = await fakePnpm();
  const log = join(bin, "calls.log");
  const result = spawnSync("sh", ["scripts/hooks-check.sh"], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOOK_LOG: log } });
  assert.equal(result.status, 0);
  assert.equal(await readFile(log, "utf8"), "lint\ntypecheck\ntest:api:unit\ntest:api:integration\ntest:web\n");
});

test("Husky entrypoint stops and propagates the first failure", async () => {
  const bin = await fakePnpm();
  const log = join(bin, "calls.log");
  const result = spawnSync("sh", ["scripts/hooks-check.sh"], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOOK_LOG: log, FAKE_FAIL_ON: "test:api:unit" } });
  assert.equal(result.status, 23);
  assert.equal(await readFile(log, "utf8"), "lint\ntypecheck\ntest:api:unit\n");
});

test("missing isolated services fail clearly without touching them", () => {
  const result = spawnSync(process.execPath, ["scripts/check-test-services.mjs"], {
    encoding: "utf8", env: { ...process.env, TEST_POSTGRES_PORT: "1", TEST_REDIS_PORT: "2" }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Required isolated test services unavailable/);
  assert.match(result.stderr, /services:test:up/);
});
