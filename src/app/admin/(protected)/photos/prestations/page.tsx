/**
 * /admin/photos/prestations — gestion des covers de prestations.
 *
 * Liste les prestations (toutes status, ordre displayOrder) avec leur
 * cover actuelle (= ServicePhoto featured=true) ou un placeholder.
 *
 * Chaque card = ServiceCoverCard (Client) gère upload/replace/delete/alt.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ServiceCoverCard } from "./service-cover-card";

export const metadata: Metadata = {
  title: "Photos prestations · Admin",
};

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  POSE_NATURELS: "Pose sur ongles naturels",
  RALLONGEMENT: "Rallongement",
  PACK_SPECIAL: "Pack spécial",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};

export default async function PrestationsPhotosPage() {
  const services = await prisma.service.findMany({
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      status: true,
      photos: {
        where: { featured: true },
        take: 1,
        select: {
          id: true,
          url: true,
          alt: true,
          width: true,
          height: true,
          sizeBytes: true,
          updatedAt: true,
        },
      },
    },
  });

  if (services.length === 0) {
    return (
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune prestation au catalogue. Créez d&apos;abord des prestations
          dans <strong>Catalogue → Prestations</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {services.map((svc) => (
        <ServiceCoverCard
          key={svc.id}
          serviceId={svc.id}
          title={svc.title}
          categoryLabel={CATEGORY_LABELS[svc.category] ?? svc.category}
          status={svc.status}
          existing={svc.photos[0] ?? null}
        />
      ))}
    </div>
  );
}
