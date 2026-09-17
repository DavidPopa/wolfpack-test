import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  E2E_PROJECTS,
  discoverE2ESpecs,
  validateE2EProjectAssignments
} from "../../scripts/e2e-projects.mjs";
import {
  assertFixtureResourcesAvailable,
  cleanupFixtureRuntime,
  fixtureConfiguration,
  resolveProductionWebImage,
  runOwnedCommand,
  startFixtureRuntime,
  runE2EGate
} from "../../scripts/run-e2e.mjs";

test("every E2E spec belongs to exactly one explicit runtime project", async () => {
  const discovered = await discoverE2ESpecs();
  const assignments = validateE2EProjectAssignments(discovered);
  assert.deepEqual(discovered, ["foundation.spec.ts", "map.spec.ts", "room-realtime.spec.ts"]);
  assert.deepEqual([...assignments], [
    ["foundation.spec.ts", "production-chromium"],
    ["map.spec.ts", "production-chromium"],
    ["room-realtime.spec.ts", "realtime-chromium"]
  ]);
  assert.throws(
    () => validateE2EProjectAssignments([...discovered, "new-runtime.spec.ts"]),
    /unassigned: new-runtime\.spec\.ts/
  );
});

test("the root command runs both projects, propagates a child failure, and still cleans its fixture", async () => {
  const events = [];
  const status = await runE2EGate({
    environment: {},
    discoverSpecs: async () => E2E_PROJECTS.flatMap((project) => project.specs),
    validateAssignments: (specs) => validateE2EProjectAssignments(specs),
    verifyFixtureResources: async () => events.push("preflight"),
    verifyProduction: async () => events.push("production-ready"),
    runProject: async (project) => {
      events.push(`run:${project.name}`);
      return project.name === "realtime-chromium" ? 17 : 0;
    },
    startRuntime: async () => {
      events.push("fixture-start");
      return { children: [], containers: [{ name: "owned-web" }, { name: "owned-proxy" }], networks: [{ name: "owned-network" }] };
    },
    cleanupRuntime: async (runtime) => events.push(`cleanup:${runtime.containers.map(({ name }) => name).join("+")}:${runtime.networks[0].name}`)
  });
  assert.equal(status, 17);
  assert.deepEqual(events, [
    "preflight",
    "production-ready",
    "run:production-chromium",
    "fixture-start",
    "run:realtime-chromium",
    "cleanup:owned-web+owned-proxy:owned-network"
  ]);

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:e2e"], "node scripts/run-e2e.mjs");
});

test("fixture collision checks happen before any runtime process is started", async () => {
  const configuration = fixtureConfiguration({
    ROOM_REALTIME_FIXTURE_PORT: "14108",
    ROOM_REALTIME_WEB_PORT: "13108",
    ROOM_REALTIME_PROXY_PORT: "18082",
    ROOM_REALTIME_FIXTURE_CONTAINER: "owned-fixture",
    ROOM_REALTIME_WEB_CONTAINER: "owned-web",
    ROOM_REALTIME_PROXY_CONTAINER: "owned-proxy",
    ROOM_REALTIME_NETWORK: "owned-network"
  });
  const inspected = [];
  await assert.rejects(
    assertFixtureResourcesAvailable(configuration, {
      isPortListening: async (port) => {
        inspected.push(port);
        return port === configuration.proxyPort;
      },
      inspectContainer: async () => {
        throw new Error("container inspection must not run after a port collision");
      },
      inspectNetwork: async () => {
        throw new Error("network inspection must not run after a port collision");
      }
    }),
    /Refusing to reuse occupied realtime proxy port/
  );
  assert.deepEqual(inspected, [configuration.proxyPort]);
});

test("cleanup targets only recorded child handles and exact owned container/network identities", async () => {
  const first = { id: "fixture" };
  const second = { id: "web" };
  const stopped = [];
  const removed = [];
  const networks = [];
  await cleanupFixtureRuntime(
    {
      children: [first, second],
      containers: [{ name: "owned-web", id: "web-id" }, { name: "owned-proxy", id: "proxy-id" }],
      networks: [{ name: "owned-network", id: "network-id" }]
    },
    {
      stopOwnedChild: async (child) => stopped.push(child.id),
      removeOwnedContainer: async (resource) => removed.push(`${resource.name}:${resource.id}`),
      removeOwnedNetwork: async (resource) => networks.push(`${resource.name}:${resource.id}`)
    }
  );
  assert.deepEqual(stopped, ["web", "fixture"]);
  assert.deepEqual(removed, ["owned-proxy:proxy-id", "owned-web:web-id"]);
  assert.deepEqual(networks, ["owned-network:network-id"]);
});

test("the realtime web runtime resolves the exact image currently tagged by the production build", async () => {
  const calls = [];
  const imageId = `sha256:${"a".repeat(64)}`;
  assert.equal(await resolveProductionWebImage(async (command, args) => {
    calls.push([command, args]);
    return { code: 0, stdout: `${imageId}\n`, stderr: "" };
  }), imageId);
  assert.deepEqual(calls, [[
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", "wolfpack-web:latest"]
  ]]);
});

test("realtime services share one owned network and only the proxy publishes loopback", async () => {
  const configuration = fixtureConfiguration({
    ROOM_REALTIME_FIXTURE_PORT: "14108",
    ROOM_REALTIME_WEB_PORT: "13108",
    ROOM_REALTIME_PROXY_PORT: "18082",
    ROOM_REALTIME_FIXTURE_CONTAINER: "owned-fixture",
    ROOM_REALTIME_WEB_CONTAINER: "owned-web",
    ROOM_REALTIME_PROXY_CONTAINER: "owned-proxy",
    ROOM_REALTIME_NETWORK: "owned-network"
  });
  const starts = [];
  const waits = [];
  const runtime = await startFixtureRuntime(configuration, {}, {
    createOwnedNetwork: async (name) => ({ name, id: "network-id" }),
    resolveProductionImage: async (image) => `sha256:${(image.startsWith("wolfpack-api") ? "a" : "b").repeat(64)}`,
    startOwnedContainer: async (name, args) => {
      starts.push({ name, args });
      return { name, id: `${name}-id` };
    },
    waitForUrl: async (url) => waits.push(url),
    cleanupFixtureRuntime: async () => assert.fail("successful startup must not clean early")
  });

  assert.deepEqual(runtime.networks, [{ name: "owned-network", id: "network-id" }]);
  assert.deepEqual(starts.map(({ name }) => name), ["owned-fixture", "owned-web", "owned-proxy"]);
  for (const { args } of starts) {
    assert.deepEqual(args.slice(0, 2), ["--network", "owned-network"]);
    assert.equal(args.some((value) => String(value).includes("host.docker.internal")), false);
  }
  assert.equal(starts[0].args.includes("realtime-fixture"), true);
  assert.equal(starts[1].args.includes("realtime-web"), true);
  assert.equal(starts[0].args.includes("-p"), false);
  assert.equal(starts[1].args.includes("-p"), false);
  assert.deepEqual(starts[2].args.slice(2, 4), ["-p", "127.0.0.1:18082:8080"]);
  assert.deepEqual(waits, [
    "http://127.0.0.1:18082/__fixture/state",
    "http://127.0.0.1:18082"
  ]);
});

test("aborting a pending realtime project returns 130 after child termination and cleanup", async () => {
  const controller = new AbortController();
  const events = [];
  let realtimeStarted;
  const started = new Promise((resolve) => { realtimeStarted = resolve; });
  const gate = runE2EGate({
    environment: {},
    discoverSpecs: async () => E2E_PROJECTS.flatMap((project) => project.specs),
    verifyFixtureResources: async () => {},
    verifyProduction: async () => {},
    runProject: async (project, _args, _environment, signal) => {
      if (project.name === "production-chromium") return 0;
      events.push("realtime-pending");
      realtimeStarted();
      return new Promise((resolve) => signal.addEventListener("abort", () => {
        events.push("child-terminated");
        resolve(130);
      }, { once: true }));
    },
    startRuntime: async () => ({ children: [], containers: [], networks: [] }),
    cleanupRuntime: async () => events.push("cleanup"),
    signal: controller.signal
  });
  await started;
  controller.abort();
  const status = await Promise.race([
    gate,
    new Promise((_, reject) => setTimeout(() => reject(new Error("abort did not settle promptly")), 1_000))
  ]);
  assert.equal(status, 130);
  assert.deepEqual(events, ["realtime-pending", "child-terminated", "cleanup"]);
});

test("owned command abort terminates its process group promptly", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const startedAt = Date.now();
  const result = await runOwnedCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    signal: controller.signal,
    stdio: "ignore"
  });
  assert.equal(result.code, 130);
  assert.ok(Date.now() - startedAt < 2_000);
});
