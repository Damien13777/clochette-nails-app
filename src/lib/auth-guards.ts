/**
 * Gardes d'autorisation partagées pour les Server Actions / endpoints admin.
 *
 * Point de vérité UNIQUE de la vérification admin (avant : `requireAdmin`
 * était dupliquée à l'identique dans ~14 fichiers). Centraliser évite la
 * dérive (une copie qui ajoute un check, les autres non).
 *
 * NOTE — stratégie JWT : `isActive` est vérifié au LOGIN (cf. `src/auth.ts`)
 * mais pas re-checké ici à chaque action. Suffisant tant qu'il n'y a qu'un
 * compte admin ; à durcir (re-fetch / callback session) avant d'ouvrir
 * plusieurs comptes.
 */

import { auth } from "@/auth";

export type AdminIdentity = { id: string; email: string };

/**
 * Retourne l'identité admin si la session est valide ET `role === "ADMIN"`,
 * sinon `null`. Le caller décide de la réponse (redirect, ActionResult…).
 */
export async function requireAdmin(): Promise<AdminIdentity | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id, email: session.user.email ?? "" };
}

/** Variante renvoyant directement l'id admin (ou `null`). */
export async function requireAdminUserId(): Promise<string | null> {
  const admin = await requireAdmin();
  return admin?.id ?? null;
}
