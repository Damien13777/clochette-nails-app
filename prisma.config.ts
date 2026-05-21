import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Charge .env.local pour cohérence avec Next.js
// (Next.js lit déjà .env.local en priorité ; Prisma CLI a besoin
// qu'on le charge explicitement.)
config({ path: ".env.local" });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),

  // Prisma 7 : la connection URL passe par datasource ici (top-level),
  // au lieu du `url = env("DATABASE_URL")` dans le schema.
  // L'adapter @prisma/adapter-pg n'est utilisé que côté runtime
  // (cf. src/lib/prisma.ts).
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
