import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EbookForm } from "../ebook-form";

export const metadata: Metadata = {
  title: "Nouvel ebook · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewEbookPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  return (
    <div className="max-w-[900px] px-5 lg:px-8 py-10 space-y-8">
      <nav>
        <Link
          href="/admin/ebooks"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour aux ebooks
        </Link>
      </nav>

      <header>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ebooks
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Nouvel ebook
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          L&apos;ebook sera créé en brouillon. Tu pourras ajouter la cover, le
          PDF et publier après vérification.
        </p>
      </header>

      <EbookForm mode="create" />
    </div>
  );
}
