/**
 * Exécuté une fois avant la suite : vide la base de test puis reseed.
 * Le schéma préexiste (posé une fois par l'humain, cf. Task 2) → ce setup ne
 * fait QUE du SQL applicatif (TRUNCATE + INSERT) → aucun garde-fou Prisma.
 */
import { db, truncateAll } from "./db";
import { seedBaseline } from "./fixtures";

export default async function globalSetup(): Promise<void> {
  await truncateAll();
  await seedBaseline();
  await db.$disconnect();
}
