/**
 * ServicesSection — Server Component.
 *
 * Branché sur Prisma (fetch les 6 prestations PUBLISHED vedettes).
 * Pas d'affichage de prix (politique salon Clochette).
 * Card → lien vers /prestations/[slug] (page détail à venir).
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildSrcSet } from "@/lib/image-srcset";

const CATEGORY_BADGES: Record<string, { label: string; cls: string } | undefined> = {
  POSE_NATURELS: { label: "Signature", cls: "bg-[var(--color-rose-100)] text-[#8a3c4a]" },
  RALLONGEMENT: { label: "Premium", cls: "bg-[var(--color-gold-200)] text-[#6b5413]" },
  PACK_SPECIAL: { label: "Sur mesure", cls: "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]" },
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export async function ServicesSection() {
  const services = await prisma.service.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { displayOrder: "asc" },
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      category: true,
      durationMinutes: true,
      photos: {
        where: { featured: true },
        take: 1,
        select: { url: true, alt: true, variants: true },
      },
    },
  });

  return (
    <section
      id="prestations"
      className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
        <div>
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nos savoir-faire
          </p>
          <h2
            className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Prestations
          </h2>
        </div>
        <Link
          href="/prestations"
          className="text-sm text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] inline-flex items-center gap-1 transition-colors"
        >
          Voir tout le catalogue
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Mobile : carousel horizontal, snap par paire */}
      <div className="sm:hidden -mx-5 overflow-x-auto snap-x snap-mandatory scroll-pl-8 scroll-pr-8">
        <div className="flex gap-4 pb-4 pl-8">
          {services.map((svc, i) => {
            const isPairEnd = i % 2 === 1;
            const isLast = i === services.length - 1;
            return (
              <div
                key={svc.id}
                className={`shrink-0 basis-[calc((100vw-5rem)/2)] ${
                  i % 2 === 0 ? "snap-start" : ""
                }`}
                style={
                  isPairEnd && !isLast ? { marginRight: "2rem" } : undefined
                }
              >
                <ServiceCard svc={svc} compact />
              </div>
            );
          })}
          {/* Trailing spacer : garantit 2rem (gap-4 + 1rem) d'espace après la dernière card */}
          <div aria-hidden="true" className="shrink-0" style={{ width: "1rem" }} />
        </div>
      </div>

      {/* Desktop : grid 2/3 cols */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
        {services.map((svc) => (
          <ServiceCard key={svc.id} svc={svc} />
        ))}
      </div>
    </section>
  );
}

type ServiceCardProps = {
  svc: {
    id: string;
    slug: string;
    title: string;
    shortDesc: string;
    category: string;
    durationMinutes: number;
    photos: { url: string; alt: string; variants: unknown }[];
  };
  compact?: boolean;
};

function ServiceCard({ svc, compact = false }: ServiceCardProps) {
  const badge = CATEGORY_BADGES[svc.category];
  const cover = svc.photos[0] ?? null;
  const coverSrcSet = cover ? buildSrcSet(cover.variants) : undefined;
  // Mobile carousel : 2 cards par viewport (~50vw). sm-lg : 2 cols grid (~50vw). lg+ : 3 cols (~33vw).
  const coverSizes = "(min-width: 1024px) 33vw, 50vw";
  return (
    <Link
      href={`/prestations/${svc.slug}`}
      className="group bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)] flex flex-col h-full"
    >
      {/* Cover : photo si dispo, sinon placeholder hachuré */}
      <div
        className={`relative ${compact ? "aspect-square" : "aspect-[4/3]"} overflow-hidden`}
        style={
          cover
            ? undefined
            : {
                backgroundColor: "var(--color-rose-50)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
              }
        }
      >
        {cover && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover.url}
            srcSet={coverSrcSet}
            sizes={coverSizes}
            alt={cover.alt}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {badge && (
          <span
            className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.16em] ${badge.cls}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className={`${compact ? "p-3" : "p-5"} flex-1 flex flex-col`}>
        <h3
          className={`leading-tight ${compact ? "text-sm" : "text-lg"}`}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {svc.title}
        </h3>
        {!compact && (
          <p className="text-sm text-[var(--color-ink-700)] mt-2 pb-4 leading-relaxed">
            {svc.shortDesc}
          </p>
        )}
        <div
          className={`flex items-center ${
            compact ? "mt-2" : "justify-between mt-auto pt-5 border-t border-[var(--color-line)]"
          }`}
        >
          <span
            className={`inline-flex items-center gap-1.5 text-[var(--color-ink-500)] ${
              compact ? "text-[11px]" : "text-xs"
            }`}
          >
            <svg
              width={compact ? "12" : "14"}
              height={compact ? "12" : "14"}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {formatDuration(svc.durationMinutes)}
          </span>
          {!compact && (
            <span
              className="text-xs text-[var(--color-violet-700)] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Découvrir
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
