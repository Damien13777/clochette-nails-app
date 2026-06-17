/**
 * Page /admin/parametres/avis — gestion des avis clientes de la landing.
 *
 * Liste CRUD (modale ajout/édition, flèches d'ordre, publier/dépublier,
 * suppression) + édition de la ligne agrégat Google.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TestimonialsManager } from "./testimonials-manager";

export const metadata: Metadata = { title: "Avis clientes · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const [testimonials, settings] = await Promise.all([
    prisma.testimonial.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        quote: true,
        rating: true,
        authorName: true,
        authorLabel: true,
        published: true,
      },
    }),
    prisma.platformSettings.findFirstOrThrow({
      select: { testimonialsGoogleLine: true },
    }),
  ]);

  return (
    <div className="max-w-3xl px-5 lg:px-8 py-10">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Link
            href="/admin/parametres"
            className="hover:text-[var(--color-violet-700)] transition-colors"
          >
            Configuration
          </Link>{" "}
          / Avis
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Avis clientes
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Les avis publiés apparaissent dans la section « Vos avis, mes plus
          belles récompenses » de la page d&apos;accueil, dans l&apos;ordre
          ci-dessous.
        </p>
      </header>

      <TestimonialsManager
        initial={testimonials}
        googleLine={settings.testimonialsGoogleLine ?? ""}
      />
    </div>
  );
}
