/**
 * Proxy serveur vers l'ERP (canal 2, LECTURE — T4). Le secret ERP_QUERY_SECRET
 * ne quitte jamais le serveur Clochette : l'admin passe par des server actions /
 * server pages qui appellent ces helpers.
 *
 * Tout est fail-soft : ERP injoignable, non configuré, timeout ou réponse
 * invalide → vide/null. Le tunnel de résa ne doit JAMAIS dépendre de la
 * disponibilité de l'ERP (l'admin retombe sur la saisie manuelle).
 */

import "server-only";
import type { ErpClientDetail, ErpLoyaltyResult, ErpSearchOutcome } from "./erp-client-types";

const ERP_URL = process.env.ERP_QUERY_URL;
const ERP_SECRET = process.env.ERP_QUERY_SECRET;
const TIMEOUT_MS = 4000;

export function isErpConfigured(): boolean {
  return Boolean(ERP_URL && ERP_SECRET);
}

async function erpFetch(path: string, init?: RequestInit): Promise<Response | null> {
  if (!ERP_URL || !ERP_SECRET) return null;
  try {
    return await fetch(`${ERP_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
      headers: { authorization: `Bearer ${ERP_SECRET}`, ...(init?.headers ?? {}) },
    });
  } catch {
    return null; // réseau / timeout → fail-soft
  }
}

export async function searchErpClients(q: string): Promise<ErpSearchOutcome> {
  const query = q.trim();
  if (query.length < 2) return { reachable: true, clients: [] };
  const res = await erpFetch(`/api/v2/clients/search?q=${encodeURIComponent(query)}`);
  if (!res || !res.ok) return { reachable: false, clients: [] };
  try {
    const body = (await res.json()) as { clients?: ErpSearchOutcome["clients"] };
    return { reachable: true, clients: Array.isArray(body.clients) ? body.clients : [] };
  } catch {
    return { reachable: false, clients: [] };
  }
}

export async function getErpClient(id: string): Promise<ErpClientDetail | null> {
  const res = await erpFetch(`/api/v2/clients/${encodeURIComponent(id)}`);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as ErpClientDetail;
  } catch {
    return null;
  }
}

/** Interroge la fidélité de la cliente au « marquer honoré » (canal 2, T5).
 *  `pending: 1` = le RDV en cours d'honoré (pas encore projeté dans l'ERP).
 *  Fail-soft : null si ERP injoignable/non configuré → l'honoré passe sans message. */
export async function getErpLoyalty(
  email: string | null,
  phone: string | null,
): Promise<ErpLoyaltyResult | null> {
  const res = await erpFetch(`/api/v2/clients/loyalty`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, phone, pending: 1 }),
  });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as ErpLoyaltyResult;
  } catch {
    return null;
  }
}
