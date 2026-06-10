/**
 * Émission d'events business vers la queue OutboundEvent (future intégration
 * ERP Chloé — cf. MANAGEMENT_API.md). Sans MANAGEMENT_API_URL configurée,
 * log console uniquement (dev). Fail-soft : ne jette jamais.
 */

import { prisma } from "@/lib/prisma";

export async function emitOutboundEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const targetUrl = process.env.MANAGEMENT_API_URL;
    if (!targetUrl) {
      console.log(`[outbound] ${type}`, payload);
      return;
    }
    await prisma.outboundEvent.create({
      data: {
        type,
        payload: payload as object,
        targetUrl,
        targetService: "management",
      },
    });
  } catch (err) {
    console.error(`[outbound] emit ${type} échec:`, err);
  }
}
