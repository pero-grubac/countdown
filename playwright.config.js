// End-to-end smoke tests. `npm run test:e2e`
//
// Locally you can point Playwright at an existing Chromium instead of
// downloading one: PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
// E2E_PORT picks another port if 4321 is already taken.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT) || 4321;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Vanilla apps: "/"  ·  Vite apps: the `base` from vite.config.js, e.g. "/devkit/"
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Vanilla apps: the zero-dependency static server below.
    // Vite apps:    "npm run build && npx vite preview --port 4321 --strictPort"
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
