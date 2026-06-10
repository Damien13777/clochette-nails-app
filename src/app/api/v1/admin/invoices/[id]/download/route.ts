/**
 * GET /api/v1/admin/invoices/[id]/download — stream du PDF facture/avoir.
 * Auth ADMIN obligatoire. Fichiers sous private/ (jamais servis statiquement).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { readInvoicePdf } from "@/lib/invoice/invoice-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true, pdfPath: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await readInvoicePdf(invoice.pdfPath);
  } catch {
    return NextResponse.json({ error: "Fichier PDF manquant" }, { status: 404 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Content-Length": pdf.byteLength.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
