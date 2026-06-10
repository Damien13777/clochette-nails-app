/**
 * Page /admin/finances/factures — liste plate des factures et avoirs.
 *
 * Filtres querystring : ?q= (numéro/nom/email), ?source= (BOOKING|GIFT_CARD|EBOOK),
 * ?doc= (INVOICE|CREDIT_NOTE), ?page=. L'historique par cliente = recherche q.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InvoicesTable } from "./invoices-table";

export const metadata: Metadata = { title: "Factures · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const SOURCES = ["BOOKING", "GIFT_CARD", "EBOOK"] as const;
const DOCS = ["INVOICE", "CREDIT_NOTE"] as const;

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; doc?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const source = SOURCES.includes(sp.source as (typeof SOURCES)[number])
    ? (sp.source as (typeof SOURCES)[number])
    : undefined;
  const doc = DOCS.includes(sp.doc as (typeof DOCS)[number])
    ? (sp.doc as (typeof DOCS)[number])
    : undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.InvoiceWhereInput = {
    ...(source ? { sourceType: source } : {}),
    ...(doc ? { docType: doc } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [invoices, totalCount, sums] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        docType: true,
        sourceType: true,
        status: true,
        customerName: true,
        customerEmail: true,
        totalCents: true,
        issuedAt: true,
        sentAt: true,
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { totalCents: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const queryBase = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(source ? { source } : {}),
    ...(doc ? { doc } : {}),
  }).toString();

  return (
    <div className="max-w-[1100px] mx-auto px-5 lg:px-8 py-10 space-y-6">
      <header>
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Link
            href="/admin/finances"
            className="hover:text-[var(--color-violet-700)] transition-colors"
          >
            Finances
          </Link>{" "}
          / Factures
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Factures
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {totalCount} document{totalCount > 1 ? "s" : ""} · total{" "}
          {((sums._sum.totalCents ?? 0) / 100).toFixed(2).replace(".", ",")} € sur la sélection.
        </p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 items-center"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="N° de facture, nom ou email…"
          className="flex-1 min-w-[220px] px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
        />
        <select
          name="source"
          defaultValue={source ?? ""}
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm"
        >
          <option value="">Toutes les ventes</option>
          <option value="BOOKING">Prestations</option>
          <option value="GIFT_CARD">Cartes cadeau</option>
          <option value="EBOOK">Ebooks</option>
        </select>
        <select
          name="doc"
          defaultValue={doc ?? ""}
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm"
        >
          <option value="">Factures + avoirs</option>
          <option value="INVOICE">Factures</option>
          <option value="CREDIT_NOTE">Avoirs</option>
        </select>
        <button
          type="submit"
          className="px-4 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Filtrer
        </button>
      </form>

      <InvoicesTable
        invoices={invoices.map((i) => ({
          ...i,
          issuedAt: i.issuedAt.toISOString(),
          sentAt: i.sentAt?.toISOString() ?? null,
        }))}
      />

      {totalPages > 1 && (
        <nav
          className="flex gap-2 justify-center text-sm"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {page > 1 && (
            <Link
              href={`?${queryBase}&page=${page - 1}`}
              className="px-3 py-1.5 border border-[var(--color-line)] rounded hover:border-[var(--color-violet-600)] transition-colors"
            >
              ← Précédent
            </Link>
          )}
          <span className="px-3 py-1.5 text-[var(--color-ink-500)]">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`?${queryBase}&page=${page + 1}`}
              className="px-3 py-1.5 border border-[var(--color-line)] rounded hover:border-[var(--color-violet-600)] transition-colors"
            >
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
