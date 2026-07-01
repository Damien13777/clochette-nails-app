/**
 * Endpoint admin : reconstruit l'historique dans la queue OutboundEvent (canal 1).
 * À lancer UNE FOIS, juste après l'activation de la queue (avant le trafic live),
 * pour éviter le double-comptage. Protégé par Bearer CRON_SECRET.
 *
 *  curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/admin/backfill-outbound
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
  const result = await backfillOutbound();
  return NextResponse.json(result);
}
