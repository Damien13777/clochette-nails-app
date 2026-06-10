/**
 * InvoiceBlock — Server Component autonome. Affiche la facture (et avoirs)
 * d'une vente : numéro, date, montant, statut envoi + actions client
 * (télécharger / renvoyer / générer en fallback si absente).
 * canGenerate : false quand la source n'est pas facturable (ex. ADMIN_GIFT,
 * booking non honoré) → le bloc est masqué s'il n'y a pas non plus de facture.
 */

import { prisma } from "@/lib/prisma";
import { InvoiceBlockActions } from "./invoice-block-actions";

type Source =
  | { sourceType: "BOOKING"; bookingId: string }
  | { sourceType: "GIFT_CARD"; giftCardId: string }
  | { sourceType: "EBOOK"; ebookPurchaseId: string };

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export async function InvoiceBlock({
  source,
  canGenerate,
}: {
  source: Source;
  canGenerate: boolean;
}) {
  const where =
    source.sourceType === "BOOKING"
      ? { bookingId: source.bookingId }
      : source.sourceType === "GIFT_CARD"
        ? { giftCardId: source.giftCardId }
        : { ebookPurchaseId: source.ebookPurchaseId };

  const documents = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: "asc" },
    select: {
      id: true,
      number: true,
      docType: true,
      status: true,
      totalCents: true,
      issuedAt: true,
      sentAt: true,
      sentTo: true,
    },
  });

  const sourceId =
    source.sourceType === "BOOKING"
      ? source.bookingId
      : source.sourceType === "GIFT_CARD"
        ? source.giftCardId
        : source.ebookPurchaseId;

  if (documents.length === 0 && !canGenerate) return null;

  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 space-y-3">
      <h2
        className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Facturation
      </h2>

      {documents.length === 0 ? (
        <InvoiceBlockActions
          mode="generate"
          sourceType={source.sourceType}
          sourceId={sourceId}
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <div>
                <span className="font-mono text-xs">{doc.number}</span>
                {doc.docType === "CREDIT_NOTE" && (
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-violet-100)] text-[var(--color-violet-700)]">
                    Avoir
                  </span>
                )}
                <span className="block text-xs text-[var(--color-ink-500)]">
                  {euros(doc.totalCents)} · émise le {doc.issuedAt.toLocaleDateString("fr-FR")} ·{" "}
                  {doc.sentAt ? `envoyée à ${doc.sentTo}` : "non envoyée"}
                </span>
              </div>
              <InvoiceBlockActions mode="document" invoiceId={doc.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
