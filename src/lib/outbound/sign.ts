/**
 * Signature HMAC + enveloppe des events sortants (canal 1 → ERP).
 * Miroir EXACT de la vérif côté ERP (`src/lib/incoming/verify-signature.ts`
 * dans erp-clochette) : `signedPayload = ${ts}.${siteId}.${rawBody}`.
 */

import { createHmac } from "node:crypto";

export function signCnPayload(params: {
  ts: number;
  siteId: string;
  rawBody: string;
  secret: string;
}): string {
  const { ts, siteId, rawBody, secret } = params;
  const v1 = createHmac("sha256", secret)
    .update(`${ts}.${siteId}.${rawBody}`)
    .digest("base64");
  return `t=${ts},v1=${v1}`;
}

/** Enveloppe standard attendue par l'ERP : {event, version, timestamp, siteId, eventId, data}. */
export function buildEnvelope(params: {
  type: string;
  version: string;
  timestamp: string;
  siteId: string;
  eventId: string;
  data: unknown;
}) {
  return {
    event: params.type,
    version: params.version,
    timestamp: params.timestamp,
    siteId: params.siteId,
    eventId: params.eventId,
    data: params.data,
  };
}
