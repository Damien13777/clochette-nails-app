/**
 * Génération + hash des codes carte cadeau.
 *
 * Format : `GIFT-XXXX-XXXX-XXXX` où X ∈ alphabet sans ambiguïté
 * (pas de 0/O, 1/I/L). Le code en clair n'est PAS stocké en DB ; on persiste
 * uniquement le bcrypt-hash (`codeHash`) + les 4 derniers chars (`prefix`)
 * pour identification UI.
 *
 * Le `prefix` permet à l'admin de retrouver une carte à partir d'une
 * portion du code (ex : "GIFT-A1B2-C3D4-XXXX" → prefix = "XXXX").
 *
 * Pas de risque de collision côté UI : la colonne `code` (string unique)
 * sert juste de lookup en clair côté backend. Phase 2 : on pourra
 * supprimer `code` et passer 100% hash si on veut le purifier RGPD.
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars sans ambiguïté

function block4(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return s;
}

/** Génère un code lisible `GIFT-XXXX-XXXX-XXXX`. */
export function generateGiftCardCode(): string {
  return `GIFT-${block4()}-${block4()}-${block4()}`;
}

/** Renvoie les 4 derniers chars du code, pour identification UI. */
export function giftCardPrefix(code: string): string {
  return code.slice(-4);
}

export function hashGiftCardCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}
