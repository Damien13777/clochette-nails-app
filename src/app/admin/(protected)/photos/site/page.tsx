/**
 * /admin/photos/site — gestion des slots site nommés.
 *
 * V1 : 2 slots (hero_desktop, hero_mobile).
 * Évolutif : ajoute d'autres slots dans SLOT_DEFS et c'est plug-and-play.
 *
 * Chaque slot = 1 carte avec :
 *  - Prévisualisation (image actuelle ou placeholder vide)
 *  - Format attendu (ratio + dimensions)
 *  - Upload zone (drag-drop ou file picker)
 *  - Édition de l'alt text
 *  - Bouton supprimer si déjà uploadée
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SiteMediaSlot } from "./slot-card";

export const metadata: Metadata = {
  title: "Photos site · Admin",
};

export const dynamic = "force-dynamic";

const SLOT_DEFS = [
  {
    key: "hero_desktop",
    label: "Hero desktop",
    description:
      "Affichée à droite du titre principal sur la home (écrans ≥ 1024px). Format portrait recommandé.",
    aspectClass: "aspect-[4/5]",
    recommended: "1296 × 1620 px (ratio 4:5 portrait)",
  },
  {
    key: "hero_mobile",
    label: "Hero mobile",
    description:
      "Affichée sous les CTAs sur la home mobile (< 1024px). Format paysage recommandé.",
    aspectClass: "aspect-[4/3]",
    recommended: "1440 × 1080 px (ratio 4:3 paysage)",
  },
] as const;

export default async function SitePhotosPage() {
  const slugs = SLOT_DEFS.map((d) => d.key);
  const records = await prisma.siteMedia.findMany({
    where: { slot: { in: [...slugs] } },
    select: {
      slot: true,
      url: true,
      variants: true,
      alt: true,
      width: true,
      height: true,
      sizeBytes: true,
      mimeType: true,
      updatedAt: true,
    },
  });
  const bySlot = new Map(records.map((r) => [r.slot, r]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {SLOT_DEFS.map((def) => (
        <SiteMediaSlot
          key={def.key}
          slotKey={def.key}
          label={def.label}
          description={def.description}
          aspectClass={def.aspectClass}
          recommended={def.recommended}
          existing={bySlot.get(def.key) ?? null}
        />
      ))}
    </div>
  );
}
