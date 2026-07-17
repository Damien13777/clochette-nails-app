"use server";

/**
 * Server action de recherche cliente via l'ERP (canal 2, T4). Utilisée par
 * l'autocomplétion de la modale de résa admin. Guard admin, le secret reste
 * côté serveur (délégué à erp-client). Fail-soft : liste vide si l'ERP est
 * injoignable ou non configuré (l'admin continue en saisie manuelle).
 */

import { auth } from "@/auth";
import { isErpConfigured, searchErpClients } from "@/lib/erp-client";
import type { ErpSearchResult } from "@/lib/erp-client-types";

export async function searchErpClientsAction(q: string): Promise<ErpSearchResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }

  if (!isErpConfigured()) {
    return { ok: true, configured: false, reachable: false, clients: [] };
  }

  const { reachable, clients } = await searchErpClients(q);
  return { ok: true, configured: true, reachable, clients };
}
