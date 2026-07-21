/**
 * Endpoint admin : reconstruit l'historique dans la queue OutboundEvent (canal 1).
 * À lancer UNE FOIS, juste après l'activation de la queue (avant le trafic live),
 * pour éviter le double-comptage. Protégé par Bearer CRON_SECRET.
 *
 * ⚠️ La date de cutover `?before=` est OBLIGATOIRE. Elle borne la reconstruction
 * aux faits ANTÉRIEURS à la bascule live : au-delà, chaque fait a déjà émis son
 * event live, et le reconstruire créerait un doublon que l'ERP ne sait pas
 * dédupliquer (eventId `backfill:*` vs cuid live) → double comptage du CA.
 * Un re-run exige par ailleurs la procédure de purge complète du 18/07.
 *
 *  curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *    "http://localhost:3000/api/v1/admin/backfill-outbound?before=2026-07-18T00:00:00Z"
 */

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { backfillOutbound } from "@/lib/outbound/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronAuth = verifyCronAuth(request);
  if (!cronAuth.ok) {
    return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status });
  }
  const raw = new URL(request.url).searchParams.get("before");
  if (!raw) {
    return NextResponse.json(
      {
        error:
          "Paramètre ?before= obligatoire (date ISO de la bascule live). Sans lui, un re-run double-compterait côté ERP tout fait postérieur à la bascule.",
      },
      { status: 400 },
    );
  }
  const before = new Date(raw);
  if (Number.isNaN(before.getTime())) {
    return NextResponse.json(
      { error: `Date ?before= invalide : ${raw}` },
      { status: 400 },
    );
  }

  const result = await backfillOutbound({ before });
  return NextResponse.json(result);
}
