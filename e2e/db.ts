/**
 * Client Prisma pointé sur la base de TEST (clochette_test) + reset applicatif.
 * truncateAll() vide toutes les tables via TRUNCATE (SQL applicatif) → aucun
 * garde-fou Prisma, rejouable à l'infini. Ne JAMAIS pointer sur clochette_dev.
 */
import "./env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const db = new PrismaClient({ adapter });

export async function truncateAll(): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
