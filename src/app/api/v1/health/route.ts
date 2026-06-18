/**
 * GET /api/v1/health — sonde de disponibilité (healthchecks.io, deploy.sh).
 * Vérifie la connexion DB via un SELECT 1. 200 si tout est up, 503 sinon.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", ts: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
