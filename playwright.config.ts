import { defineConfig, devices } from "@playwright/test";

// Demo credentials and DB settings for the app under test (development branch only).
try {
  process.loadEnvFile(".env.local");
} catch {
  // Use the process environment.
}

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
export const ADMIN_STATE = "playwright/.auth/admin.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Server actions make several round trips to Neon; allow for network latency.
  expect: { timeout: 20_000 },
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs in once as the demo school admin and saves the session cookie.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Many test logins come from one local IP; don't trip the per-IP limit.
    env: { AUTH_LOGIN_IP_LIMIT: "100000" },
  },
});
