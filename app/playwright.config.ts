import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 20_000,
  use: { baseURL: "http://localhost:1430" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 760 } } }],
  webServer: { command: "npm run dev", url: "http://localhost:1430", reuseExistingServer: true, timeout: 60_000 },
});
