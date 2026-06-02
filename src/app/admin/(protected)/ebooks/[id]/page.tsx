import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EbookForm, type EbookFormValues } from "../ebook-form";
import { BackButton } from "@/components/admin/back-button";

export const metadata: Metadata = {
  title: "Édition ebook · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function centsToEurosString(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export default async function EditEbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from ? `/admin/ebooks?${from}` : "/admin/ebooks";
  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook) notFound();

  const initialValues: EbookFormValues = {
    title: ebook.title,
    slug: ebook.slug,
    shortDesc: ebook.shortDesc,
    description: ebook.description,
    priceEuros: centsToEurosString(ebook.priceCents),
    comparePriceEuros: centsToEurosString(ebook.comparePriceCents),
    tags: ebook.tags.join(", "),
    metaTitle: ebook.metaTitle ?? "",
    metaDesc: ebook.metaDesc ?? "",
    coverImageAlt: ebook.coverImageAlt ?? "",
    coverImage: ebook.coverImage,
    pdfUrl: ebook.pdfUrl,
    pdfSizeBytes: ebook.pdfSizeBytes,
    pdfOriginalName: ebook.pdfOriginalName,
    status: ebook.status,
  };

  return (
    <div className="max-w-[900px] px-5 lg:px-8 py-10 space-y-8">
      <BackButton fallbackHref={backHref} />

      <header>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ebooks · Ebook
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {ebook.title}
        </h1>
        {ebook.status === "PUBLISHED" && (
          <p
            className="mt-2 text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <Link
              href={`/ebooks/${ebook.slug}`}
              target="_blank"
              className="text-[var(--color-violet-700)] hover:underline"
            >
              Voir sur le site →
            </Link>
          </p>
        )}
      </header>

      <EbookForm mode="edit" ebookId={ebook.id} initialValues={initialValues} backHref={backHref} />
    </div>
  );
}
