/**
 * Cron : nettoyage des photos uploadées par les clientes.
 *
 * Schedule recommandé : 1 fois par jour (e.g. crontab à 3h du matin VPS).
 * Auth : Authorization: Bearer <CRON_SECRET>
 *
 * Politique de rétention :
 *  - Orphelins : fichiers présents sur disque sans BookingFile en DB
 *    et créés depuis > 24h → supprimés.
 *  - RDV annulés / expirés / no-show : photos supprimées 30 jours après
 *    cancelledAt (ou updatedAt si cancelledAt manquant).
 *  - RDV honorés (COMPLETED) : photos supprimées 6 mois après completedAt.
 *
 * Effet :
 *  - Fichiers .webp supprimés sur disque
 *  - Records BookingFile supprimés en DB
 *  - clientMessage du booking préservé
 *  - Audit log inscrit (action: "uploads.cleaned")
 *
 * Idempotent : si déjà supprimé, no-op (try/catch ENOENT).
 *
 * Test local :
 *  curl -H "Authorization: Bearer $CRON_SECRET" \
 *    http://localhost:3000/api/v1/cron/cleanup-uploads
 */

import { unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOOKING_FILES_DIR, BOOKING_FILES_URL_PREFIX } from "@/lib/booking-files";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CANCELLED_TTL_DAYS = 30;
const COMPLETED_TTL_DAYS = 6 * 30; // 6 mois (approx)
const BATCH_LIMIT = 500; // garde-fou par phase

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────
  const cronAuth = verifyCronAuth(request);
  if (!cronAuth.ok) {
    return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status });
  }

  const now = new Date();
  const cancelledCutoff = new Date(
    now.getTime() - CANCELLED_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const completedCutoff = new Date(
    now.getTime() - COMPLETED_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  let orphanDeleted = 0;
  let cancelledDeleted = 0;
  let completedDeleted = 0;
  const errors: string[] = [];

  // ── Phase 1 — Orphelins ──────────────────────────────────
  // Fichiers sur disque sans BookingFile correspondant en DB ET > 24h.
  try {
    const files = await readdir(BOOKING_FILES_DIR).catch(() => [] as string[]);
    if (files.length > 0) {
      // Récupère toutes les URLs référencées en DB
      const referenced = await prisma.bookingFile.findMany({
        select: { url: true },
      });
      const referencedFilenames = new Set(
        referenced.map((r) => path.basename(r.url)),
      );

      const orphanCheckLimit = Math.min(files.length, BATCH_LIMIT);
      for (let i = 0; i < orphanCheckLimit; i++) {
        const filename = files[i];
        if (!filename.endsWith(".webp")) continue;
        if (referencedFilenames.has(filename)) continue;

        const filepath = path.join(BOOKING_FILES_DIR, filename);
        try {
          const stats = await stat(filepath);
          const age = now.getTime() - stats.mtimeMs;
          if (age < ORPHAN_TTL_MS) continue;

          await unlink(filepath);
          orphanDeleted++;
        } catch (err) {
          errors.push(
            `orphan ${filename}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } catch (err) {
    errors.push(
      `phase orphan: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Phase 2 — RDV annulés/expirés/no-show > 30j ──────────
  try {
    const toClean = await prisma.bookingFile.findMany({
      where: {
        booking: {
          status: {
            in: ["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "EXPIRED", "NO_SHOW"],
          },
          OR: [
            { cancelledAt: { lt: cancelledCutoff } },
            // fallback si cancelledAt null (EXPIRED legacy etc.)
            { AND: [{ cancelledAt: null }, { updatedAt: { lt: cancelledCutoff } }] },
          ],
        },
      },
      take: BATCH_LIMIT,
      select: { id: true, url: true },
    });

    for (const f of toClean) {
      const filename = path.basename(f.url);
      const filepath = path.join(BOOKING_FILES_DIR, filename);
      try {
        await unlink(filepath).catch(() => {
          // ENOENT : déjà supprimé physiquement, on continue pour purger la DB
        });
        await prisma.bookingFile.delete({ where: { id: f.id } });
        cancelledDeleted++;
      } catch (err) {
        errors.push(
          `cancelled ${filename}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    errors.push(
      `phase cancelled: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Phase 3 — RDV honorés > 6 mois ───────────────────────
  try {
    const toClean = await prisma.bookingFile.findMany({
      where: {
        booking: {
          status: "COMPLETED",
          completedAt: { lt: completedCutoff },
        },
      },
      take: BATCH_LIMIT,
      select: { id: true, url: true },
    });

    for (const f of toClean) {
      const filename = path.basename(f.url);
      const filepath = path.join(BOOKING_FILES_DIR, filename);
      try {
        await unlink(filepath).catch(() => {
          // ENOENT : on continue pour purger la DB quand même
        });
        await prisma.bookingFile.delete({ where: { id: f.id } });
        completedDeleted++;
      } catch (err) {
        errors.push(
          `completed ${filename}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    errors.push(
      `phase completed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Audit log (1 entrée par run, regroupe les compteurs) ─
  try {
    const totalDeleted = orphanDeleted + cancelledDeleted + completedDeleted;
    if (totalDeleted > 0 || errors.length > 0) {
      // Pas d'adminId pour un cron : on utilise le premier admin actif
      const sysAdmin = await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (sysAdmin) {
        await prisma.auditLog.create({
          data: {
            adminId: sysAdmin.id,
            action: "uploads.cleaned",
            metadata: {
              orphanDeleted,
              cancelledDeleted,
              completedDeleted,
              errors: errors.slice(0, 10),
              ranAt: now.toISOString(),
            } as object,
          },
        });
      }
    }
  } catch (err) {
    console.error("[cron cleanup-uploads] audit log failed:", err);
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      orphan: orphanDeleted,
      cancelled: cancelledDeleted,
      completed: completedDeleted,
      total: orphanDeleted + cancelledDeleted + completedDeleted,
    },
    errors,
    config: {
      orphanTtlHours: ORPHAN_TTL_MS / 1000 / 3600,
      cancelledTtlDays: CANCELLED_TTL_DAYS,
      completedTtlDays: COMPLETED_TTL_DAYS,
      uploadDir: BOOKING_FILES_URL_PREFIX,
    },
  });
}
