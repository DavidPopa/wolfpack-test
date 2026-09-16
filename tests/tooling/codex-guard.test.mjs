import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(payload) {
  return spawnSync(process.execPath, [".codex/hooks/pre-tool-use.mjs"], { encoding: "utf8", input: typeof payload === "string" ? payload : JSON.stringify(payload) });
}
function bash(command) { return { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }; }
function denied(result) {
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
}

test("denies malformed payloads with a supported response", () => denied(run("not json")));
test("allows legitimate reads and dummy environment examples", () => {
  assert.equal(run(bash("git status --short && sed -n '1,20p' .env.example")).stdout, "");
  assert.equal(run(bash("printf dummy > infra/.env.test.example")).stdout, "");
});
test("denies commits with quoting, subdirectories, and compound commands", () => {
  denied(run(bash("cd apps/api && git -C '../..' commit -m 'agent commit'")));
  denied(run(bash("git --work-tree=\"/tmp/work tree\" commit -m nope")));
});
test("denies destructive Git, database, Redis, and Docker volume commands", () => {
  for (const command of ["git reset --hard HEAD", "prisma migrate reset", "redis-cli FLUSHALL", "docker compose down --volumes", "docker volume prune -f"]) denied(run(bash(command)));
});
test("denies real secret writes from Bash and apply_patch while allowing example files", () => {
  denied(run(bash("printf secret > apps/api/.env.local")));
  denied(run({ tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Add File: apps/api/.env\n+SECRET=value\n*** End Patch" } }));
  assert.equal(run({ tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Add File: apps/api/.env.example\n+DUMMY=value\n*** End Patch" } }).stdout, "");
});
test("denies root environment-file writes", () => {
  denied(run(bash("printf secret > .env")));
  denied(run({ tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Add File: .env\n+SECRET=value\n*** End Patch" } }));
});
test("does not let an example filename mask a real secret target", () => {
  denied(run(bash("printf secret > apps/api/.env.local && echo .env.example")));
});
test("denies the short Docker Compose volume-removal form", () => {
  denied(run(bash("docker compose down -v")));
});
