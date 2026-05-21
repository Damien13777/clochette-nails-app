/**
 * POST /api/v1/admin/finances/export
 *
 * Génère un CSV des transactions sur une période donnée (journal de caisse).
 *
 * Body JSON : { from: ISO, to: ISO }
 *
 * Auth : session admin (cookie NextAuth).
 *
 * Retourne text/csv avec Content-Disposition pour download.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildTransactionsCsv, computeFinances } from "@/lib/finances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { from?: string; to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body.from || !body.to) {
    return NextResponse.json(
      { error: "Champs from + to requis (ISO 8601)" },
      { status: 400 },
    );
  }

  const from = new Date(body.from);
  const to = new Date(body.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
  }
  if (from >= to) {
    return NextResponse.json(
      { error: "from doit être < to" },
      { status: 400 },
    );
  }

  const { transactions } = await computeFinances(from, to);
  const csv = buildTransactionsCsv(transactions);

  const filename = `clochette-finances_${isoDateOnly(from)}_${isoDateOnly(to)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function isoDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
