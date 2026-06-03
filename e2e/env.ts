/**
 * Charge .env.test dans process.env pour tous les processus E2E
 * (config Playwright, globalSetup, workers). override:true → la base de test
 * gagne toujours, jamais la base de dev.
 */
import { config } from "dotenv";

config({ path: ".env.test", override: true });
