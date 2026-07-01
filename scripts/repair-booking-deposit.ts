/**
 * Réparation `depositCents` — restaure l'acompte RÉELLEMENT encaissé sur un
 * booking dont la prestation a été éditée APRÈS paiement.
 *
 * Contexte du bug (corrigé en amont dans updateBookingDetails) : éditer la
 * prestation d'un RDV déjà payé recalculait `depositCents` selon la nouvelle
 * prestation, écrasant le montant réel perçu. Comme `depositCents` est la
 * source unique de l'acompte pour l'affichage paiement, le remboursement
 * proposé et le CA (/admin/finances), toute la chaîne devenait fausse.
 *
 * Source de vérité = Stripe : on relit `amount_received` du PaymentIntent
 * (impossible de se tromper de montant), puis on ajoute la portion acompte
 * couverte par carte cadeau (redemptions BOOKING_DEPOSIT actives). Le résultat
 * est le `depositCents` correct. Pour un acompte hors Stripe (physique ou
 * 100% carte cadeau) sans PaymentIntent, fournir le montant via `--set`.
 *
 * Sécurités :
 *  - DRY-RUN par défaut : lit, compare, rapporte — n'écrit RIEN.
 *  - Écriture réelle seulement avec `--apply`, et seulement si le montant
 *    diffère. Chaque correction est tracée dans AuditLog (booking.deposit_repaired).
 *  - `--scan` : audite TOUS les bookings payés par Stripe et liste les écarts,
 *    sans rien modifier (repérer d'éventuelles autres lignes corrompues).
 *
 * Usage (à lancer avec l'env prod chargé — DATABASE_URL + STRIPE_SECRET_KEY) :
 *   pnpm tsx scripts/repair-booking-deposit.ts --scan
 *   pnpm tsx scripts/repair-booking-deposit.ts <bookingId>            # dry-run
 *   pnpm tsx scripts/repair-booking-deposit.ts <bookingId> --apply
 *   pnpm tsx scripts/repair-booking-deposit.ts <bookingId> --set 3450 --apply
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Stripe from "stripe";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const scan = args.includes("--scan");
const setIdx = args.indexOf("--set");
const setValueArg = setIdx !== -1 ? args[setIdx + 1] : undefined;
const manualSetCents = setValueArg ? Number(setValueArg) : null;
const bookingId = args.find((a) => !a.startsWith("--") && a !== setValueArg);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL manquante (env non chargé ?).");
const stripeKey = process.env.STRIPE_SECRET_KEY;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const stripe = stripeKey
  ? new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia", typescript: true })
  : null;

const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",") + " €";

async function gcDepositCentsFor(id: string): Promise<number> {
  const redemptions = await prisma.giftCardRedemption.findMany({
    where: { bookingId: id, type: "BOOKING_DEPOSIT", reversedAt: null },
    select: { amountUsedCents: true },
  });
  return redemptions.reduce((s, r) => s + r.amountUsedCents, 0);
}

async function stripeCapturedFor(paymentIntentId: string): Promise<number | null> {
  if (!stripe) return null;
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return pi.amount_received || pi.amount || null;
}

/** Montant correct attendu pour depositCents, ou null si indéterminable ici. */
async function expectedDeposit(b: {
  id: string;
  paymentMethod: string | null;
  stripePaymentId: string | null;
}): Promise<number | null> {
  const gc = await gcDepositCentsFor(b.id);
  if (b.paymentMethod === "stripe" && b.stripePaymentId) {
    const captured = await stripeCapturedFor(b.stripePaymentId);
    if (captured == null) return null;
    return captured + gc;
  }
  if (manualSetCents != null) return manualSetCents + gc;
  return null;
}

async function runScan() {
  const bookings = await prisma.booking.findMany({
    where: { paymentMethod: "stripe", stripePaymentId: { not: null }, paidAt: { not: null } },
    select: { id: true, paymentMethod: true, stripePaymentId: true, depositCents: true, clientFirstName: true, clientLastName: true, date: true },
    orderBy: { paidAt: "desc" },
  });
  console.log(`\n🔎 Scan de ${bookings.length} booking(s) payés par Stripe…\n`);
  let mismatches = 0;
  for (const b of bookings) {
    let expected: number | null;
    try {
      expected = await expectedDeposit(b);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ? ${b.id}  Stripe illisible (${msg}) — ignoré`);
      continue;
    }
    if (expected == null) {
      console.log(`  ? ${b.id}  Stripe illisible (clé absente ?) — ignoré`);
      continue;
    }
    if (expected !== b.depositCents) {
      mismatches++;
      console.log(
        `  ✗ ${b.id}  ${b.clientFirstName} ${b.clientLastName}  stocké ${euros(b.depositCents)} → réel ${euros(expected)}`,
      );
    }
  }
  console.log(
    mismatches === 0
      ? "\n✅ Aucun écart : tous les acomptes stockés correspondent à Stripe.\n"
      : `\n⚠️  ${mismatches} booking(s) à réparer (relancer avec l'id + --apply).\n`,
  );
}

async function runOne(id: string) {
  const b = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true, status: true, paymentMethod: true, stripePaymentId: true,
      depositCents: true, paidAt: true, clientFirstName: true, clientLastName: true,
    },
  });
  if (!b) throw new Error(`Booking introuvable : ${id}`);

  const expected = await expectedDeposit(b);
  console.log(`\nBooking ${b.id} — ${b.clientFirstName} ${b.clientLastName} (${b.status})`);
  console.log(`  paiement          : ${b.paymentMethod ?? "—"}`);
  console.log(`  depositCents actuel: ${euros(b.depositCents)}`);
  if (expected == null) {
    console.log(
      "\n⚠️  Montant réel indéterminable ici (pas de PaymentIntent Stripe).\n" +
        "    → fournir le montant encaissé via --set <cents> (ex: --set 3450).\n",
    );
    return;
  }
  console.log(`  depositCents réel  : ${euros(expected)}  (Stripe amount_received + acompte GC)`);

  if (expected === b.depositCents) {
    console.log("\n✅ Déjà correct — rien à faire.\n");
    return;
  }

  if (!apply) {
    console.log(`\n💡 DRY-RUN : relancer avec --apply pour écrire ${euros(expected)}.\n`);
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) throw new Error("Aucun admin en base pour tracer l'audit.");

  await prisma.$transaction([
    prisma.booking.update({ where: { id: b.id }, data: { depositCents: expected } }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "booking.deposit_repaired",
        metadata: {
          bookingId: b.id,
          previousDepositCents: b.depositCents,
          repairedDepositCents: expected,
          source: b.stripePaymentId ? "stripe.amount_received" : "manual --set",
        } as object,
      },
    }),
  ]);
  console.log(`\n✅ Corrigé : ${euros(b.depositCents)} → ${euros(expected)} (audité).\n`);
}

async function main() {
  if (scan) {
    await runScan();
  } else if (bookingId) {
    await runOne(bookingId);
  } else {
    console.log(
      "Usage : pnpm tsx scripts/repair-booking-deposit.ts (--scan | <bookingId> [--set <cents>] [--apply])",
    );
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
