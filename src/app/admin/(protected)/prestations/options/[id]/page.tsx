/**
 * /admin/prestations/options/[id] — édition d'une option.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { OptionForm, type OptionFormValues } from "../option-form";

export const metadata: Metadata = {
  title: "Édition option · Admin",
};

export const dynamic = "force-dynamic";

const LIST_FILTERS = ["draft", "published", "archived"] as const;

export default async function EditOptionPage({
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
  const backHref = LIST_FILTERS.includes(from as (typeof LIST_FILTERS)[number])
    ? `/admin/prestations/options?status=${from}`
    : "/admin/prestations/options";
  const option = await prisma.serviceOption.findUnique({
    where: { id },
  });
  if (!option) notFound();

  const initialValues: OptionFormValues = {
    title: option.title,
    slug: option.slug,
    description: option.description ?? "",
    addedDurationMinutes: option.addedDurationMinutes,
    addedPriceEuros: option.addedPriceCents / 100,
    applicableCategories: option.applicableCategories,
    displayOrder: option.displayOrder,
    disclaimer: option.disclaimer ?? "",
    status: option.status,
  };

  return (
    <div className="max-w-[900px] px-5 lg:px-8 py-10 space-y-8">
      <nav>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour aux options
        </Link>
      </nav>

      <header>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Catalogue · Option
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {option.title}
        </h1>
      </header>

      <OptionForm mode="edit" optionId={option.id} initialValues={initialValues} />
    </div>
  );
}
