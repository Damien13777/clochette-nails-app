/**
 * Worker dispatcher — dépile la queue `OutboundEvent` et livre les events à
 * l'ERP (canal 1). Signé HMAC, idempotent côté ERP (siteId, eventId).
 *
 *  - 2xx           → DELIVERED
 *  - 4xx           → ABANDONED (non rejouable : event rejeté/malformé)
 *  - 5xx / réseau  → retry avec backoff (5 min → 15 min → 1 h → 6 h), puis
 *                    ABANDONED après `maxAttempts`.
 *
 * On ne fait pas de lock complexe : cadence 2 min + traitement rapide, et l'ERP
 * déduplique sur (siteId, eventId) → un double envoi est inoffensif.
 * Dépendances injectables (db / fetch / now) pour les tests.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildEnvelope, signCnPayload } from "./sign";

const BACKOFF_MS = [5, 15, 60, 360].map((m) => m * 60_000); // 5 min, 15 min, 1 h, 6 h

export type DispatchDeps = {
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
  now?: Date;
  siteId?: string;
  secret?: string;
  limit?: number;
};

export async function dispatchPendingOutbound(deps: DispatchDeps = {}) {
  const db = deps.db ?? prisma;
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const siteId = deps.siteId ?? process.env.OUTBOUND_SITE_ID ?? "clochette-nails";
  const secret = deps.secret ?? process.env.MANAGEMENT_API_HMAC_SECRET ?? "";
  const limit = deps.limit ?? 10;

  const pending = await db.outboundEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let retried = 0;
  let abandoned = 0;

  for (const ev of pending) {
    const eventId = ev.eventId ?? ev.id;
    const ts = Math.floor(now.getTime() / 1000);
    const rawBody = JSON.stringify(
      buildEnvelope({
        type: ev.type,
        version: "v1",
        timestamp: ev.createdAt.toISOString(),
        siteId,
        eventId,
        data: ev.payload,
      }),
    );
    const url = `${ev.targetUrl.replace(/\/+$/, "")}/api/v1/incoming/${siteId}`;

    let status = 0;
    let errText = "";
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cn-site-id": siteId,
          "x-cn-signature": signCnPayload({ ts, siteId, rawBody, secret }),
        },
        body: rawBody,
      });
      status = res.status;
      if (status < 200 || status >= 300) {
        errText = (await res.text()).slice(0, 500);
      }
    } catch (err) {
      errText = err instanceof Error ? err.message : "network_error";
    }

    if (status >= 200 && status < 300) {
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: { status: "DELIVERED", deliveredAt: now },
      });
      delivered++;
    } else if (status >= 400 && status < 500) {
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: {
          status: "ABANDONED",
          attempts: ev.attempts + 1,
          lastError: `HTTP ${status}: ${errText}`,
        },
      });
      abandoned++;
    } else {
      const nextAttempts = ev.attempts + 1;
      if (nextAttempts >= ev.maxAttempts) {
        await db.outboundEvent.update({
          where: { id: ev.id },
          data: {
            status: "ABANDONED",
            attempts: nextAttempts,
            lastError: errText || `HTTP ${status}`,
          },
        });
        abandoned++;
      } else {
        const delay = BACKOFF_MS[Math.min(nextAttempts - 1, BACKOFF_MS.length - 1)];
        await db.outboundEvent.update({
          where: { id: ev.id },
          data: {
            attempts: nextAttempts,
            nextAttemptAt: new Date(now.getTime() + delay),
            lastError: errText || `HTTP ${status}`,
          },
        });
        retried++;
      }
    }
  }

  return { processed: pending.length, delivered, retried, abandoned };
}
