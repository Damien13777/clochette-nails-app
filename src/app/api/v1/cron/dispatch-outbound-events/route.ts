/**
 * Cron : dépile la queue OutboundEvent et livre les events à l'ERP (canal 1).
 * Schedule : toutes les 2 min via crontab VPS (curl + Bearer CRON_SECRET).
 * Additif + fail-open : si l'ERP est down, les events restent PENDING et sont
 * rejoués ; le flux résa/honoré n'est jamais impacté.
 *
 * Test local :
 *  curl -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/cron/dispatch-outbound-events
 */

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { dispatchPendingOutbound } from "@/lib/outbound/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronAuth = verifyCronAuth(request);
  if (!cronAuth.ok) {
    return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status });
  }
  const result = await dispatchPendingOutbound();
  return NextResponse.json(result);
}
