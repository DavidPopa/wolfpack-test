import { readdir } from "node:fs/promises";
import path from "node:path";

export const E2E_PROJECTS = Object.freeze([
  Object.freeze({
    name: "production-chromium",
    baseUrlEnvironment: "PLAYWRIGHT_PRODUCTION_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:8081",
    specs: Object.freeze(["foundation.spec.ts", "map.spec.ts"])
  }),
  Object.freeze({
    name: "realtime-chromium",
    baseUrlEnvironment: "PLAYWRIGHT_REALTIME_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:18081",
    specs: Object.freeze(["room-realtime.spec.ts"])
  })
]);

export async function discoverE2ESpecs(rootDirectory = process.cwd()) {
  const directory = path.join(rootDirectory, "tests/e2e");
  return (await readdir(directory))
    .filter((file) => file.endsWith(".spec.ts"))
    .sort();
}

export function validateE2EProjectAssignments(discoveredSpecs, projects = E2E_PROJECTS) {
  const owners = new Map();
  for (const project of projects) {
    for (const spec of project.specs) {
      const currentOwners = owners.get(spec) ?? [];
      currentOwners.push(project.name);
      owners.set(spec, currentOwners);
    }
  }

  const missing = discoveredSpecs.filter((spec) => !owners.has(spec));
  const duplicate = [...owners]
    .filter(([, projectNames]) => projectNames.length !== 1)
    .map(([spec, projectNames]) => `${spec} (${projectNames.join(", ")})`);
  const stale = [...owners.keys()].filter((spec) => !discoveredSpecs.includes(spec));

  if (missing.length || duplicate.length || stale.length) {
    const details = [
      missing.length ? `unassigned: ${missing.join(", ")}` : null,
      duplicate.length ? `assigned more than once: ${duplicate.join(", ")}` : null,
      stale.length ? `configured but missing: ${stale.join(", ")}` : null
    ].filter(Boolean);
    throw new Error(`Invalid E2E project assignment (${details.join("; ")})`);
  }

  return new Map(discoveredSpecs.map((spec) => [spec, owners.get(spec)[0]]));
}

export function projectBaseUrl(project, environment = process.env) {
  return environment[project.baseUrlEnvironment] ?? project.defaultBaseUrl;
}
