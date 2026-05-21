/**
 * Cron : envoi des campagnes newsletter programmées (scheduledAt <= now).
 *
 * Schedule prévu (Vercel) : every 5 minutes — voir vercel.json.
 * Auth : Authorization: Bearer <CRON_SECRET>
 *
 * Logique :
 *  - Trouve les campagnes status=SCHEDULED avec scheduledAt <= now
 *  - Pour chacune, appelle executeCampaignSend (lock atomique géré dedans)
 *  - Si plusieurs campagnes à envoyer, on les traite en séquentiel (chaque
 *    envoi peut prendre du temps selon la taille de l'audience).
 *
 * Race condition : executeCampaignSend fait un updateMany conditionnel
 * SCHEDULED → SENDING qui est atomique → 2 instances de cron concurrentes
 * ne déclenchent pas un double envoi.
 *
 * Test local :
 *  curl -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/cron/send-scheduled-newsletters
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignSend } from "@/lib/actions/newsletter-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 5; // Garde-fou : max 5 campagnes envoyées par run

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron newsletter] CRON_SECRET non configuré");
    return NextResponse.json(
      { error: "CRON_SECRET non configuré" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.newsletterCampaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    select: { id: true, subject: true },
    take: BATCH_LIMIT,
    orderBy: { scheduledAt: "asc" },
  });

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const results: Array<{ id: string; subject: string; status: "ok" | "ko"; message: string }> = [];

  for (const c of due) {
    try {
      const result = await executeCampaignSend(c.id, null);
      results.push({
        id: c.id,
        subject: c.subject,
        status: result.ok ? "ok" : "ko",
        message: result.ok ? result.message ?? "envoyée" : result.error,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      results.push({ id: c.id, subject: c.subject, status: "ko", message: msg });
      console.error(
        `[cron newsletter] exception sur campagne ${c.id}:`,
        err,
      );
    }
  }

  console.log(
    `[cron newsletter] ${results.length} campagne(s) traitée(s) :`,
    results.map((r) => `${r.subject} → ${r.status}`).join(", "),
  );

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
