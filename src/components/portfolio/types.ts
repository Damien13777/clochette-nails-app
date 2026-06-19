/**
 * Types et libellés partagés des galeries portfolio (teaser landing + page
 * /realisations). Pas de dépendance serveur → importable client ET serveur.
 */
import type { ServiceCategory } from "@prisma/client";

export type PortfolioPhoto = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  category: ServiceCategory;
  variants: unknown;
};

export type PortfolioCategory = { id: ServiceCategory; label: string };

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Pose sur ongles naturels",
  RALLONGEMENT: "Rallongements",
  PACK_SPECIAL: "Packs",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};
