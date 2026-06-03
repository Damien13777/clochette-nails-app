/**
 * Config Playwright — Clochette Nails E2E.
 * webServer = next dev sur 3100, Stripe/Resend/reCAPTCHA désactivés (clés vides)
 * → booking auto-confirme (fallback dev), pas d'appel réseau externe.
 * DATABASE_URL = base de test (chargée via e2e/env.ts).
 */
import { defineConfig, devices } from "@playwright/test";
import "./e2e/env";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      STRIPE_SECRET_KEY: "",
      RESEND_API_KEY: "",
      RECAPTCHA_SECRET_KEY: "",
      NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
