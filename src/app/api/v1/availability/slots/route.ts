/**
 * GET /api/v1/availability/slots
 *
 * Query params :
 *  - date=YYYY-MM-DD (required)
 *  - serviceId=cuid (required)
 *  - optionIds=cuid1,cuid2 (optional, comma-separated)
 *
 * Response :
 *  - { slots: string[] } — liste des "HH:MM" disponibles
 *  - { slots: [], reason: "MONTH_NOT_OPEN" | "DAY_CLOSED" | ... }
 *  - { error: string, code: string } sur erreur de validation
 *
 * Cet endpoint ne nécessite pas d'auth — appelé depuis la page de réservation publique.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeAvailableSlots } from "@/lib/availability";
import { getClientIp } from "@/lib/client-ip";
import {
  AVAILABILITY,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().min(1),
  optionIds: z.string().optional(),
});

export async function GET(request: Request) {
  // Rate limit IP : protège contre scraping + DDoS léger (60/min/IP)
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(
    AVAILABILITY.bucket,
    ip,
    AVAILABILITY.max,
    AVAILABILITY.windowMs,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes, ralentissez.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec ?? 60),
        },
      },
    );
  }
  recordRateLimit(AVAILABILITY.bucket, ip, AVAILABILITY.windowMs);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date"),
    serviceId: url.searchParams.get("serviceId"),
    optionIds: url.searchParams.get("optionIds") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const { date, serviceId, optionIds } = parsed.data;
  const optionIdList = optionIds
    ? optionIds.split(",").filter(Boolean)
    : [];

  // Calcule la durée totale (service + options)
  const [service, options] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId, status: "PUBLISHED" },
      select: { durationMinutes: true },
    }),
    optionIdList.length > 0
      ? prisma.serviceOption.findMany({
          where: { id: { in: optionIdList }, status: "PUBLISHED" },
          select: { addedDurationMinutes: true },
        })
      : Promise.resolve([]),
  ]);

  if (!service) {
    return NextResponse.json(
      { error: "Prestation introuvable", code: "RESOURCE_NOT_FOUND" },
      { status: 404 },
    );
  }

  const totalDurationMinutes =
    service.durationMinutes +
    options.reduce((sum, o) => sum + o.addedDurationMinutes, 0);

  const result = await computeAvailableSlots({ date, totalDurationMinutes });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
