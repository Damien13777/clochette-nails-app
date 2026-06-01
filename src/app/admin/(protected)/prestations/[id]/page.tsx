/**
 * /admin/prestations/[id] — édition d'une prestation.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteService } from "@/lib/actions/services";
import { DeleteArchivedButton } from "@/components/admin/delete-archived-button";
import { ServiceForm, type ServiceFormValues } from "../service-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const svc = await prisma.service.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: svc ? `${svc.title} · Admin` : "Prestation · Admin" };
}

const LIST_FILTERS = ["draft", "published", "archived"] as const;

export default async function EditServicePage({
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
    ? `/admin/prestations?status=${from}`
    : "/admin/prestations";
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      shortDesc: true,
      description: true,
      category: true,
      durationMinutes: true,
      priceCents: true,
      displayOrder: true,
      disclaimer: true,
      status: true,
      updatedAt: true,
      _count: { select: { bookings: true } },
    },
  });

  if (!service) notFound();

  const initialValues: ServiceFormValues = {
    title: service.title,
    slug: service.slug,
    shortDesc: service.shortDesc,
    description: service.description,
    category: service.category,
    durationMinutes: service.durationMinutes,
    priceEuros: service.priceCents / 100,
    displayOrder: service.displayOrder,
    disclaimer: service.disclaimer ?? "",
    status: service.status,
  };

  return (
    <div className="max-w-[1000px] px-5 lg:px-8 py-10">
      <Link
        href={backHref}
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
          Modifier
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)] leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {service.title}
        </h1>
        <p
          className="mt-2 text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {service._count.bookings}{" "}
          {service._count.bookings > 1 ? "réservations associées" : "réservation associée"}
          {" · Dernière modif "}
          {service.updatedAt.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      <ServiceForm
        mode="edit"
        serviceId={service.id}
        initialValues={initialValues}
        backHref={backHref}
      />

      {service.status === "ARCHIVED" && (
        <DeleteArchivedButton
          onDelete={deleteService.bind(null, service.id)}
          redirectTo={backHref}
          confirmLabel="cette prestation"
        />
      )}
    </div>
  );
}
