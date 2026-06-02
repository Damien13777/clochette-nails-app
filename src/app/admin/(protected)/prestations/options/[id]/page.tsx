/**
 * /admin/prestations/options/[id] — édition d'une option.
 */

import type { Metadata } from "next";
import { BackButton } from "@/components/admin/back-button";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteServiceOption } from "@/lib/actions/service-options";
import { DeleteArchivedButton } from "@/components/admin/delete-archived-button";
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
      <BackButton fallbackHref={backHref} />

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

      <OptionForm mode="edit" optionId={option.id} initialValues={initialValues} backHref={backHref} />

      {option.status === "ARCHIVED" && (
        <DeleteArchivedButton
          onDelete={deleteServiceOption.bind(null, option.id)}
          redirectTo={backHref}
          confirmLabel="cette option"
        />
      )}
    </div>
  );
}
