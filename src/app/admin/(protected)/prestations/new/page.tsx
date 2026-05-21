/**
 * /admin/prestations/new — création d'une prestation.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = {
  title: "Nouvelle prestation · Admin",
};

export default async function NewServicePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  return (
    <div className="max-w-[1000px] px-5 lg:px-8 py-10">
      <Link
        href="/admin/prestations"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] mb-4 transition-colors"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Retour à la liste
      </Link>

      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Catalogue
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Nouvelle prestation
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Sera créée en <strong>brouillon</strong>. À publier depuis sa page une
          fois prête (titre + descriptions + cover photo via{" "}
          <Link href="/admin/photos/prestations" className="underline">médiathèque</Link>).
        </p>
      </header>

      <ServiceForm mode="create" />
    </div>
  );
}
