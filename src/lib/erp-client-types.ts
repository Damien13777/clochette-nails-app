/**
 * Types partagés du canal 2 (recherche cliente ERP, T4). Aucune dépendance
 * serveur → importable depuis les Client Components (autocomplétion de la modale
 * de résa admin) sans tirer Prisma/`server-only` dans le bundle navigateur.
 */

export type ErpClientMatch = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  allergies: string | null;
  preferences: string | null;
  bookingCount: number;
};

export type ErpClientDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  allergies: string | null;
  preferences: string | null;
  birthDate: string | null;
  notes: { body: string; createdAt: string }[];
  bookings: {
    serviceTitle: string;
    date: string | null;
    status: string;
    // Nullable : le CA réel n'est renseigné qu'au RDV honoré (côté ERP).
    revenueCents: number | null;
  }[];
};

/** Résultat brut du proxy : `reachable` distingue une vraie panne ERP (fetch
 *  KO / timeout / réponse invalide) d'une recherche qui renvoie 0 résultat. */
export type ErpSearchOutcome = { reachable: boolean; clients: ErpClientMatch[] };

export type ErpSearchResult =
  | { ok: true; configured: boolean; reachable: boolean; clients: ErpClientMatch[] }
  | { ok: false; error: string };
