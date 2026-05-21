/**
 * POST /api/v1/admin/newsletter/audience-count
 *
 * Renvoie le nombre d'abonnées qui matchent les filtres d'audience donnés
 * (preview live dans le form de campagne).
 *
 * Body JSON : { sources?: string[], createdAfter?: string|null, createdBefore?: string|null }
 * Réponse : { count: number }
 *
 * Auth : ADMIN obligatoire.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  type AudienceFilters,
  countAudience,
  sanitizeAudienceFilters,
} from "@/lib/newsletter-audience";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const filters: AudienceFilters = sanitizeAudienceFilters(
    raw as AudienceFilters | null | undefined,
  );

  try {
    const count = await countAudience(filters);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[audience-count]", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 },
    );
  }
}
