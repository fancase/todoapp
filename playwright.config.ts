import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build served on a dedicated port, backed by an in-memory MongoDB
// replica set that e2e/support/server.mjs starts. Real database credentials are never used.
// Build first:  node e2e/support/build.mjs
const PORT = process.env.E2E_PORT ?? "3107";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.(spec|setup)\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.run/auth.json" },
    },
  ],
  webServer: {
    command: "node e2e/support/server.mjs",
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
