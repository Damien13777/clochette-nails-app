/**
 * GET /api/v1/ebooks/download/[token]
 *
 * Téléchargement signé du PDF d'un ebook acheté. Le token est créé à
 * la création d'EbookPurchase et stocké dans la DB avec un tokenExpiresAt
 * (30 j par défaut). Pas d'auth nécessaire — le secret du token est
 * suffisant (64 chars hex).
 *
 * Sécurité :
 *  - PDF stocké HORS public/ (cf. EBOOK_PDF_DIR)
 *  - Token résolu + status PAID vérifié + ttl vérifié
 *  - downloadCount incrémenté pour audit
 *  - Filename = slug de l'ebook (UX), pas le storage key
 */

import { NextResponse } from "next/server";
import { readEbookPdf } from "@/lib/ebook-files";
import { resolveDownloadToken } from "@/lib/ebook-download-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const resolved = await resolveDownloadToken(token);
  if (!resolved.ok) {
    // Si la cliente arrive ici directement (lien email cliqué avant qu'on
    // ait switché les templates, ou clic répété malgré le cap), on la
    // redirige vers la page friendly qui affiche le message en clair.
    const url = new URL(`/ebooks/telechargement/${token}`, request.url);
    return NextResponse.redirect(url, 303);
  }

  const buffer = await readEbookPdf(resolved.purchase.ebook.pdfUrl);
  if (!buffer) {
    const url = new URL(`/ebooks/telechargement/${token}`, request.url);
    return NextResponse.redirect(url, 303);
  }

  const safeName = `${resolved.purchase.ebook.slug || "ebook"}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
