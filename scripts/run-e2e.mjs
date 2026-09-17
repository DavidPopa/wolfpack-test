import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_PROJECTS, discoverE2ESpecs, projectBaseUrl, validateE2EProjectAssignments } from "./e2e-projects.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nginxImage = "nginx:1.30.4-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c";
const productionApiImage = "wolfpack-api:latest";
const productionWebImage = "wolfpack-web:latest";
const fixtureAlias = "realtime-fixture";
const webAlias = "realtime-web";

function parsePort(name, fallback, environment = process.env) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

export function fixtureConfiguration(environment = process.env) {
  const fixturePort = parsePort("ROOM_REALTIME_FIXTURE_PORT", 4108, environment);
  const webPort = parsePort("ROOM_REALTIME_WEB_PORT", 3108, environment);
  const proxyPort = parsePort("ROOM_REALTIME_PROXY_PORT", 18081, environment);
  const fixtureContainer = environment.ROOM_REALTIME_FIXTURE_CONTAINER ?? "wolfpack-e2e-realtime-fixture";
  const webContainer = environment.ROOM_REALTIME_WEB_CONTAINER ?? "wolfpack-e2e-realtime-web";
  const proxyContainer = environment.ROOM_REALTIME_PROXY_CONTAINER ?? "wolfpack-e2e-realtime-proxy";
  const network = environment.ROOM_REALTIME_NETWORK ?? "wolfpack-e2e-realtime";
  for (const [name, value] of [
    ["ROOM_REALTIME_FIXTURE_CONTAINER", fixtureContainer],
    ["ROOM_REALTIME_WEB_CONTAINER", webContainer],
    ["ROOM_REALTIME_PROXY_CONTAINER", proxyContainer],
    ["ROOM_REALTIME_NETWORK", network]
  ]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(value)) {
      throw new Error(`${name} contains unsupported characters`);
    }
  }
  if (new Set([fixtureContainer, webContainer, proxyContainer]).size !== 3) {
    throw new Error("Realtime fixture, web, and proxy container names must be distinct");
  }
  if (new Set([fixturePort, webPort, proxyPort]).size !== 3) {
    throw new Error("Realtime fixture, web, and proxy ports must be distinct");
  }
  return { fixturePort, webPort, proxyPort, fixtureContainer, webContainer, proxyContainer, network };
}

export function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(350);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

function runChild(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function runCapturedChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({
      code: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
  });
}

async function inspectDockerResource(kind, name) {
  const result = await runCapturedChild("docker", [kind, "inspect", "--format", "{{.Id}}", name]);
  if (result.code === 0) return result.stdout.trim();
  if (result.code === 1) return null;
  throw new Error(`Unable to inspect realtime ${kind} ${name}: ${result.stderr.trim()}`);
}

async function inspectContainer(name) {
  return inspectDockerResource("container", name);
}

async function inspectNetwork(name) {
  return inspectDockerResource("network", name);
}

export async function assertFixtureResourcesAvailable(
  configuration,
  dependencies = { isPortListening, inspectContainer, inspectNetwork }
) {
  if (await dependencies.isPortListening(configuration.proxyPort)) {
    throw new Error(`Refusing to reuse occupied realtime proxy port 127.0.0.1:${configuration.proxyPort}`);
  }
  for (const name of [configuration.fixtureContainer, configuration.webContainer, configuration.proxyContainer]) {
    if (await dependencies.inspectContainer(name)) {
      throw new Error(`Refusing to reuse existing container ${name}`);
    }
  }
  if (await dependencies.inspectNetwork(configuration.network)) {
    throw new Error(`Refusing to reuse existing network ${configuration.network}`);
  }
}

async function waitForUrl(url, label, timeoutMs = 30_000, signal) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error(`${label} startup interrupted`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

function startOwnedChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    detached: process.platform !== "win32",
    ...options
  });
  child.once("error", (error) => {
    process.stderr.write(`[e2e] owned process failed to start: ${error.message}\n`);
  });
  return child;
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, 5_000, "timeout");
  });
  const outcome = await Promise.race([exited, timeout]);
  clearTimeout(timeoutId);
  if (outcome === "timeout") {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await exited;
  }
}

export async function runOwnedCommand(command, args, { signal, ...options } = {}) {
  const child = startOwnedChild(command, args, options);
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, childSignal) => resolve({ code: code ?? 1, signal: childSignal }));
  });
  let stopPromise = Promise.resolve();
  const handleAbort = () => {
    stopPromise = stopOwnedChild(child);
  };
  signal?.addEventListener("abort", handleAbort, { once: true });
  if (signal?.aborted) handleAbort();
  try {
    const outcome = await result;
    await stopPromise;
    return signal?.aborted ? { code: 130, signal: outcome.signal } : outcome;
  } finally {
    signal?.removeEventListener("abort", handleAbort);
  }
}

async function removeOwnedContainer(resource) {
  const currentId = await inspectContainer(resource.name);
  if (!currentId) return;
  if (currentId !== resource.id) {
    throw new Error(`Refusing to remove replacement container ${resource.name}`);
  }
  const result = await runChild("docker", ["rm", "--force", resource.id], { stdio: "ignore" });
  if (result.code !== 0) throw new Error(`Could not remove owned realtime container ${resource.name}`);
}

async function startOwnedContainer(name, args) {
  const result = await runCapturedChild("docker", ["run", "--detach", "--rm", "--name", name, ...args]);
  const id = result.stdout.trim();
  if (result.code !== 0 || !/^[a-f0-9]{64}$/.test(id)) {
    throw new Error(`Could not start owned realtime container ${name}: ${result.stderr.trim()}`);
  }
  return { name, id };
}

async function createOwnedNetwork(name) {
  const result = await runCapturedChild("docker", ["network", "create", "--driver", "bridge", name]);
  const id = result.stdout.trim();
  if (result.code !== 0 || !/^[a-f0-9]{64}$/.test(id)) {
    throw new Error(`Could not create owned realtime network ${name}: ${result.stderr.trim()}`);
  }
  return { name, id };
}

async function removeOwnedNetwork(resource) {
  const currentId = await inspectNetwork(resource.name);
  if (!currentId) return;
  if (currentId !== resource.id) {
    throw new Error(`Refusing to remove replacement network ${resource.name}`);
  }
  const result = await runChild("docker", ["network", "rm", resource.id], { stdio: "ignore" });
  if (result.code !== 0) throw new Error(`Could not remove owned realtime network ${resource.name}`);
}

export async function resolveProductionImage(image, runCaptured = runCapturedChild) {
  const result = await runCaptured("docker", ["image", "inspect", "--format", "{{.Id}}", image]);
  const imageId = result.stdout.trim();
  if (result.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(imageId)) {
    throw new Error(`Unable to resolve ${image}; run pnpm stack:up first: ${result.stderr.trim()}`);
  }
  return imageId;
}

export async function resolveProductionWebImage(runCaptured = runCapturedChild) {
  return resolveProductionImage(productionWebImage, runCaptured);
}

export async function cleanupFixtureRuntime(
  runtime,
  dependencies = { stopOwnedChild, removeOwnedContainer, removeOwnedNetwork }
) {
  const errors = [];
  for (const container of [...runtime.containers].reverse()) {
    try { await dependencies.removeOwnedContainer(container); } catch (error) { errors.push(error); }
  }
  for (const child of [...runtime.children].reverse()) {
    try { await dependencies.stopOwnedChild(child); } catch (error) { errors.push(error); }
  }
  for (const network of [...runtime.networks].reverse()) {
    try { await dependencies.removeOwnedNetwork(network); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Realtime fixture cleanup failed");
}

export async function startFixtureRuntime(configuration, { signal } = {}, dependencies = {
  createOwnedNetwork,
  startOwnedContainer,
  resolveProductionImage,
  waitForUrl,
  cleanupFixtureRuntime
}) {
  const runtime = { children: [], containers: [], networks: [] };
  try {
    const network = await dependencies.createOwnedNetwork(configuration.network);
    runtime.networks.push(network);

    const [apiImage, webImage] = await Promise.all([
      dependencies.resolveProductionImage(productionApiImage),
      dependencies.resolveProductionImage(productionWebImage)
    ]);
    const fixtureScript = path.join(repositoryRoot, "tests/e2e/room-realtime-fixture.mjs");
    const fixture = await dependencies.startOwnedContainer(configuration.fixtureContainer, [
      "--network", configuration.network,
      "--network-alias", fixtureAlias,
      "-e", `ROOM_REALTIME_FIXTURE_PORT=${configuration.fixturePort}`,
      "-e", "ROOM_REALTIME_FIXTURE_HOST=0.0.0.0",
      "-v", `${fixtureScript}:/workspace/room-realtime-fixture.mjs:ro`,
      "--entrypoint", "node",
      apiImage,
      "/workspace/room-realtime-fixture.mjs"
    ]);
    runtime.containers.push(fixture);

    const web = await dependencies.startOwnedContainer(configuration.webContainer, [
      "--network", configuration.network,
      "--network-alias", webAlias,
      "-e", `PORT=${configuration.webPort}`,
      webImage
    ]);
    runtime.containers.push(web);

    const nginxTemplate = path.join(repositoryRoot, "tests/e2e/room-realtime.nginx.conf");
    const proxy = await dependencies.startOwnedContainer(configuration.proxyContainer, [
      "--network", configuration.network,
      "-p", `127.0.0.1:${configuration.proxyPort}:8080`,
      "-e", `ROOM_REALTIME_FIXTURE_PORT=${configuration.fixturePort}`,
      "-e", `ROOM_REALTIME_WEB_PORT=${configuration.webPort}`,
      "-v", `${nginxTemplate}:/etc/nginx/templates/default.conf.template:ro`,
      nginxImage
    ]);
    runtime.containers.push(proxy);
    await dependencies.waitForUrl(`http://127.0.0.1:${configuration.proxyPort}/__fixture/state`, "realtime same-origin fixture proxy", 30_000, signal);
    await dependencies.waitForUrl(`http://127.0.0.1:${configuration.proxyPort}`, "realtime same-origin web proxy", 30_000, signal);
    return runtime;
  } catch (error) {
    await dependencies.cleanupFixtureRuntime(runtime).catch((cleanupError) => {
      process.stderr.write(`[e2e] startup cleanup failed: ${cleanupError.message}\n`);
    });
    throw error;
  }
}

async function runPlaywrightProject(project, forwardedArguments = [], environment = process.env, signal) {
  const executable = path.join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  const reportDirectory = path.join("playwright-report", project.name);
  const result = await runOwnedCommand(executable, ["test", `--project=${project.name}`, ...forwardedArguments], {
    signal,
    env: {
      ...environment,
      PLAYWRIGHT_HTML_OUTPUT_DIR: reportDirectory,
      PLAYWRIGHT_PRODUCTION_BASE_URL: projectBaseUrl(E2E_PROJECTS[0], environment),
      PLAYWRIGHT_REALTIME_BASE_URL: projectBaseUrl(E2E_PROJECTS[1], environment)
    }
  });
  return result.code;
}

async function runIntentionalFailureChild(signal) {
  const result = await runOwnedCommand(process.execPath, ["-e", "process.exit(23)"], { signal });
  return result.code;
}

export async function runE2EGate({
  forwardedArguments = [],
  environment = process.env,
  discoverSpecs = discoverE2ESpecs,
  validateAssignments = validateE2EProjectAssignments,
  verifyFixtureResources = assertFixtureResourcesAvailable,
  verifyProduction = waitForUrl,
  runProject = runPlaywrightProject,
  startRuntime = startFixtureRuntime,
  cleanupRuntime = cleanupFixtureRuntime,
  runFailureChild = runIntentionalFailureChild,
  signal
} = {}) {
  const discovered = await discoverSpecs(repositoryRoot);
  const assignments = validateAssignments(discovered, E2E_PROJECTS);
  process.stdout.write(`[e2e] assigned ${assignments.size} spec files exactly once across ${E2E_PROJECTS.length} projects\n`);

  const configuration = fixtureConfiguration(environment);
  await verifyFixtureResources(configuration);
  const runtimeEnvironment = {
    ...environment,
    PLAYWRIGHT_REALTIME_BASE_URL: environment.PLAYWRIGHT_REALTIME_BASE_URL ?? `http://127.0.0.1:${configuration.proxyPort}`
  };
  const productionUrl = projectBaseUrl(E2E_PROJECTS[0], runtimeEnvironment);
  await verifyProduction(`${productionUrl}/api/health`, "production proxy", 10_000);

  const statuses = [];
  statuses.push(await runProject(E2E_PROJECTS[0], forwardedArguments, runtimeEnvironment, signal));
  if (signal?.aborted) return 130;

  let runtime;
  try {
    runtime = await startRuntime(configuration, { signal });
    if (signal?.aborted) return 130;
    let realtimeStatus;
    if (environment.E2E_RUNNER_FORCE_REALTIME_CHILD_FAILURE === "1") {
      process.stdout.write("[e2e] running intentional realtime child failure for cleanup verification\n");
      realtimeStatus = await runFailureChild(signal);
    } else {
      realtimeStatus = await runProject(E2E_PROJECTS[1], forwardedArguments, runtimeEnvironment, signal);
    }
    statuses.push(realtimeStatus);
  } catch (error) {
    process.stderr.write(`[e2e] realtime project failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
    statuses.push(1);
  } finally {
    if (runtime) await cleanupRuntime(runtime);
  }

  return statuses.find((status) => status !== 0) ?? 0;
}

async function main() {
  const controller = new AbortController();
  const markInterrupted = () => controller.abort();
  process.once("SIGINT", markInterrupted);
  process.once("SIGTERM", markInterrupted);
  try {
    const status = await runE2EGate({ forwardedArguments: process.argv.slice(2), signal: controller.signal });
    process.exitCode = controller.signal.aborted ? 130 : status;
  } catch (error) {
    process.stderr.write(`[e2e] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener("SIGINT", markInterrupted);
    process.removeListener("SIGTERM", markInterrupted);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
