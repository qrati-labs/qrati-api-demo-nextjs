import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8089;
const APP_URL = "http://localhost:3010";

// End-to-end tests run the real (built) app against a small in-memory fake of the Qrati API
// (e2e/fake-api), plus MongoDB for the demo's own sign-in. No Qrati credentials are needed.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // the fake API's state is shared and reset per test
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: APP_URL,
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/fake-api/server.mjs",
      url: `http://localhost:${API_PORT}/health`,
      env: { FAKE_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm start",
      url: `${APP_URL}/login`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        QRATI_API_KEY: "e2e-secret-key",
        QRATI_BASE_URL: `http://localhost:${API_PORT}/v1`,
        MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/qrati-demo-e2e",
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
        BETTER_AUTH_URL: APP_URL,
      },
    },
  ],
});
