/**
 * /admin/photos/portfolio — gestion de la galerie portfolio.
 *
 * Filtres : ?cat=POSE_NATURELS|RALLONGEMENT|... (défaut = all)
 *
 * Affichage : grid de photos avec catégorie + season/mood badges.
 * Actions : upload multi (dialog), édition par photo (dialog), suppression.
 */

import type { Metadata } from "next";
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PortfolioUploadButton } from "./upload-button";
import { PortfolioGrid } from "./portfolio-grid";
import { CategoryFilter } from "./category-filter";

export const metadata: Metadata = {
  title: "Photos portfolio · Admin",
};

export const dynamic = "force-dynamic";

const CATEGORY_KEYS: ServiceCategory[] = [
  "POSE_NATURELS",
  "RALLONGEMENT",
  "PACK_SPECIAL",
  "SOIN_MAINS",
  "SOIN_PIEDS",
  "DEPOSE",
];

type SearchParams = {
  cat?: string;
};

export default async function PortfolioPhotosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeCategory = isValidCategory(params.cat) ? params.cat : null;

  const where = {
    featured: false,
    ...(activeCategory ? { category: activeCategory } : {}),
  };

  const [photos, counts] = await Promise.all([
    prisma.servicePhoto.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        url: true,
        alt: true,
        caption: true,
        category: true,
        season: true,
        mood: true,
        occasion: true,
        tags: true,
        width: true,
        height: true,
        sizeBytes: true,
        displayOrder: true,
        createdAt: true,
      },
    }),
    fetchCategoryCounts(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header + upload */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {photos.length} photo{photos.length > 1 ? "s" : ""}
          {activeCategory && (
            <>
              {" "}
              dans <strong>{CATEGORY_LABELS[activeCategory]}</strong>
            </>
          )}
        </p>
        <PortfolioUploadButton
          defaultCategory={activeCategory ?? "POSE_NATURELS"}
        />
      </div>

      {/* Category filter */}
      <CategoryFilter
        active={activeCategory}
        counts={counts}
        categoryKeys={CATEGORY_KEYS}
        labels={CATEGORY_LABELS}
      />

      {/* Grid */}
      <PortfolioGrid photos={photos} />
    </div>
  );
}

function isValidCategory(value: unknown): value is ServiceCategory {
  return (
    typeof value === "string" &&
    CATEGORY_KEYS.includes(value as ServiceCategory)
  );
}

async function fetchCategoryCounts(): Promise<
  Record<ServiceCategory | "all", number>
> {
  const groups = await prisma.servicePhoto.groupBy({
    by: ["category"],
    where: { featured: false },
    _count: true,
  });
  const counts: Record<string, number> = { all: 0 };
  for (const k of CATEGORY_KEYS) counts[k] = 0;
  for (const g of groups) {
    counts[g.category] = g._count;
    counts.all += g._count;
  }
  return counts as Record<ServiceCategory | "all", number>;
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  POSE_NATURELS: "Ongles naturels",
  RALLONGEMENT: "Rallongements",
  PACK_SPECIAL: "Packs",
  SOIN_MAINS: "Soin mains",
  SOIN_PIEDS: "Soin pieds",
  DEPOSE: "Dépose",
};
