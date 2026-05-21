/**
 * Prisma Client singleton — Clochette Nails
 *
 * Prisma 7 requiert le driver adapter `@prisma/adapter-pg` (driver adapters
 * sont GA depuis Prisma 7). En dev, on garde une instance globale pour éviter
 * la multiplication des connexions lors du HMR Next.js.
 *
 * Connection pool : `max: 20` (matche notre tuning prod sur le VPS).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const createPrisma = () => {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
