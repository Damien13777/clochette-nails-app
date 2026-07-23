/**
 * Backfill ONE-SHOT des options de prestation vers l'ERP.
 *
 * ⚠️ POURQUOI UN EVENT DÉDIÉ ET NON UN REJEU DU BACKFILL FINANCIER :
 * l'ERP dédoublonne ses écritures comptables par `eventId`. Re-émettre des
 * `booking.confirmed` / `booking.completed` créerait de NOUVEAUX eventId, donc de
 * NOUVELLES lignes d'acompte/solde dans le ledger → CA DOUBLÉ, silencieusement.
 *
 * On émet donc `booking.options`, un event purement DESCRIPTIF qui ne porte AUCUN
 * montant. Côté ERP il n'a volontairement aucun handler ledger (`projectEvent`
 * renvoie null → zéro écriture comptable) ; seule la projection CRM patche le RDV.
 *
 * Rejouable sans risque : ré-émettre repose les mêmes titres (remplacement, pas
 * fusion), et toujours zéro impact comptable.
 *
 * Usage : node --env-file=.env.local --import tsx scripts/backfill-booking-options.ts
 */

import { prisma } from "@/lib/prisma";
import { emitOutboundEvent } from "@/lib/outbound-events";

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { options: { some: {} } }, // uniquement les RDV QUI ONT des options
    select: {
      id: true,
      options: { select: { serviceOption: { select: { title: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${bookings.length} RDV avec options à remonter.`);
  let sent = 0;
  for (const b of bookings) {
    const optionsTitles = b.options.map((o) => o.serviceOption.title);
    if (optionsTitles.length === 0) continue;
    await emitOutboundEvent("booking.options", { bookingId: b.id, optionsTitles });
    sent += 1;
  }
  console.log(`Terminé : ${sent} event(s) booking.options émis (aucun montant, aucun impact ledger).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
