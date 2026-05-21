/**
 * Token de téléchargement signé pour les ebooks achetés.
 *
 * Flow :
 *  1. À la création d'EbookPurchase, on génère un token aléatoire (32 bytes hex)
 *     + tokenExpiresAt (30 j par défaut).
 *  2. La cliente reçoit le lien /ebooks/telechargement/[token] par mail.
 *  3. L'endpoint vérifie (token existe, ttl ok, paiement PAID), incrémente
 *     downloadCount, streame le PDF.
 *
 * Limites :
 *  - downloadCount limit : pas de hard limit pour MVP (sinon on doit gérer
 *    "lien expiré" UX) mais on log les abus côté admin.
 *  - Pas de rotation : si la cliente perd l'email, elle redemande via support.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const DEFAULT_TOKEN_TTL_DAYS = 30;
const TOKEN_BYTES = 32; // 64 chars hex
export const MAX_DOWNLOADS_PER_TOKEN = 5;
/**
 * Fenêtre pendant laquelle 2 hits sur l'endpoint download comptent pour
 * 1 seul téléchargement. Les navigateurs émettent souvent un HEAD/Range
 * pré-vérification + un GET final, et certains gestionnaires de
 * téléchargement font des retries — sans debounce on compterait double.
 */
const DOWNLOAD_DEBOUNCE_MS = 30_000;

export function generateDownloadToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function computeTokenExpiry(ttlDays: number = DEFAULT_TOKEN_TTL_DAYS): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ttlDays);
  return d;
}

export type TokenReason =
  | "NOT_FOUND"
  | "EXPIRED"
  | "NOT_PAID"
  | "NO_PDF"
  | "EXHAUSTED";

export type ResolveTokenResult =
  | {
      ok: true;
      purchase: {
        id: string;
        ebookId: string;
        clientEmail: string;
        downloadCount: number;
        tokenExpiresAt: Date;
        ebook: {
          title: string;
          shortDesc: string;
          coverImage: string | null;
          coverImageAlt: string | null;
          pdfUrl: string;
          slug: string;
        };
      };
    }
  | { ok: false; reason: TokenReason };

async function loadPurchaseByToken(token: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  return prisma.ebookPurchase.findUnique({
    where: { downloadToken: token },
    select: {
      id: true,
      ebookId: true,
      clientEmail: true,
      paymentStatus: true,
      downloadCount: true,
      tokenExpiresAt: true,
      ebook: {
        select: {
          title: true,
          shortDesc: true,
          coverImage: true,
          coverImageAlt: true,
          pdfUrl: true,
          slug: true,
        },
      },
    },
  });
}

function evaluatePurchase(
  purchase: Awaited<ReturnType<typeof loadPurchaseByToken>>,
): TokenReason | null {
  if (!purchase) return "NOT_FOUND";
  if (purchase.paymentStatus !== "PAID") return "NOT_PAID";
  if (purchase.tokenExpiresAt < new Date()) return "EXPIRED";
  if (!purchase.ebook.pdfUrl) return "NO_PDF";
  if (purchase.downloadCount >= MAX_DOWNLOADS_PER_TOKEN) return "EXHAUSTED";
  return null;
}

/**
 * Inspecte un token SANS incrémenter le compteur — utilisé par la page
 * publique `/ebooks/telechargement/[token]` pour afficher l'état + un
 * bouton de téléchargement.
 */
export async function inspectDownloadToken(
  token: string,
): Promise<ResolveTokenResult> {
  const purchase = await loadPurchaseByToken(token);
  const err = evaluatePurchase(purchase);
  if (err || !purchase) return { ok: false, reason: err ?? "NOT_FOUND" };

  return {
    ok: true,
    purchase: {
      id: purchase.id,
      ebookId: purchase.ebookId,
      clientEmail: purchase.clientEmail,
      downloadCount: purchase.downloadCount,
      tokenExpiresAt: purchase.tokenExpiresAt,
      ebook: {
        title: purchase.ebook.title,
        shortDesc: purchase.ebook.shortDesc,
        coverImage: purchase.ebook.coverImage,
        coverImageAlt: purchase.ebook.coverImageAlt,
        pdfUrl: purchase.ebook.pdfUrl!,
        slug: purchase.ebook.slug,
      },
    },
  };
}

/**
 * Résout un token + incrémente le compteur de façon atomique, avec un
 * debounce de DOWNLOAD_DEBOUNCE_MS (un même clic peut générer plusieurs
 * hits HTTP — HEAD + GET, retries... — ils ne comptent que pour 1).
 * Appelée par l'endpoint /api/v1/ebooks/download/[token] qui streame le PDF.
 */
export async function resolveDownloadToken(
  token: string,
): Promise<ResolveTokenResult> {
  const purchase = await loadPurchaseByToken(token);
  const err = evaluatePurchase(purchase);
  if (err || !purchase) return { ok: false, reason: err ?? "NOT_FOUND" };

  const now = new Date();
  const debounceFloor = new Date(now.getTime() - DOWNLOAD_DEBOUNCE_MS);

  // Increment atomique conditionné par :
  //  - downloadCount < MAX (cap pas encore atteint)
  //  - lastDownloadAt null OU plus vieux que la fenêtre de debounce
  // Si count == 0, soit on a atteint le cap, soit on est dans la fenêtre
  // de debounce (= on laisse passer le DL sans incrémenter).
  const inc = await prisma.ebookPurchase.updateMany({
    where: {
      id: purchase.id,
      downloadCount: { lt: MAX_DOWNLOADS_PER_TOKEN },
      OR: [
        { lastDownloadAt: null },
        { lastDownloadAt: { lt: debounceFloor } },
      ],
    },
    data: {
      downloadCount: { increment: 1 },
      lastDownloadAt: now,
    },
  });

  let effectiveCount = purchase.downloadCount + 1;
  if (inc.count === 0) {
    // Re-vérifie pour distinguer cap atteint vs debounce
    const current = await prisma.ebookPurchase.findUnique({
      where: { id: purchase.id },
      select: { downloadCount: true },
    });
    const currentCount = current?.downloadCount ?? purchase.downloadCount;
    if (currentCount >= MAX_DOWNLOADS_PER_TOKEN) {
      return { ok: false, reason: "EXHAUSTED" };
    }
    // Debounce : on laisse passer sans incrémenter
    effectiveCount = currentCount;
  }

  return {
    ok: true,
    purchase: {
      id: purchase.id,
      ebookId: purchase.ebookId,
      clientEmail: purchase.clientEmail,
      downloadCount: effectiveCount,
      tokenExpiresAt: purchase.tokenExpiresAt,
      ebook: {
        title: purchase.ebook.title,
        shortDesc: purchase.ebook.shortDesc,
        coverImage: purchase.ebook.coverImage,
        coverImageAlt: purchase.ebook.coverImageAlt,
        pdfUrl: purchase.ebook.pdfUrl!,
        slug: purchase.ebook.slug,
      },
    },
  };
}
