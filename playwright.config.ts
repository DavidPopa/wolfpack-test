import { defineConfig, devices } from "@playwright/test";
import { E2E_PROJECTS, projectBaseUrl } from "./scripts/e2e-projects.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? "playwright-report" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"]
  },
  projects: E2E_PROJECTS.map((project) => ({
    name: project.name,
    testMatch: project.specs,
    outputDir: `test-results/${project.name}`,
    use: { ...devices["Desktop Chrome"], baseURL: projectBaseUrl(project) }
  }))
});
