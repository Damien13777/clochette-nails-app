/**
 * TestimonialsSection — Server Component (async).
 *
 * Avis lus en DB (table Testimonial, gérée sur /admin/parametres/avis).
 * Section masquée si aucun avis publié. Ligne Google depuis PlatformSettings.
 * Mobile : snap-x horizontal scroll (CSS only). Desktop : grid 3 cols.
 */

import { prisma } from "@/lib/prisma";

export async function TestimonialsSection() {
  const [testimonials, settings] = await Promise.all([
    prisma.testimonial.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        quote: true,
        rating: true,
        authorName: true,
        authorLabel: true,
      },
    }),
    prisma.platformSettings.findFirst({
      select: { testimonialsGoogleLine: true },
    }),
  ]);

  if (testimonials.length === 0) return null;
  const googleLine = settings?.testimonialsGoogleLine ?? null;

  return (
    <section
      id="avis"
      className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28"
    >
      <div className="text-center max-w-[36rem] mx-auto mb-12">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Avis clientes
        </p>
        <h2
          className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Elles parlent du salon
        </h2>
        {googleLine && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--color-ink-500)]">
            <div className="flex gap-0.5" aria-hidden="true">
              {[...Array(5)].map((_, i) => (
                <svg
                  key={i}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="var(--color-gold-500)"
                  stroke="var(--color-gold-600)"
                  strokeWidth="0.5"
                >
                  <path d="M12 2 L14.5 9 L22 9.3 L16 14 L18 21.5 L12 17.5 L6 21.5 L8 14 L2 9.3 L9.5 9 Z" />
                </svg>
              ))}
            </div>
            <span style={{ fontFamily: "var(--font-ui)" }}>{googleLine}</span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-5 overflow-x-auto snap-x snap-mandatory md:overflow-visible -mx-5 px-5 md:mx-0 md:px-0 pb-2">
        {testimonials.map((t) => (
          <article
            key={t.id}
            className="snap-center min-w-[85%] md:min-w-0 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 flex flex-col"
          >
            <svg
              className="w-5 h-5 text-[var(--color-violet-300)] mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21c3 0 7-1 7-8V5H3v9h4c0 1-2 3-4 3v4zm12 0c3 0 7-1 7-8V5h-7v9h4c0 1-2 3-4 3v4z" />
            </svg>

            {/* Citation Manrope italic */}
            <p
              className="text-[0.9375rem] leading-relaxed italic text-[var(--color-ink-900)]"
              style={{ fontFamily: "var(--font-ui)", fontStyle: "italic" }}
            >
              {t.quote}
            </p>

            {/* mt-auto : socle étoiles+auteur ancré en bas, position uniforme entre cards */}
            <div className="flex gap-0.5 mt-auto pt-4" role="img" aria-label={`${t.rating} sur 5`}>
              {[...Array(t.rating)].map((_, i) => (
                <svg
                  key={i}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="var(--color-gold-500)"
                >
                  <path d="M12 2 L14.5 9 L22 9.3 L16 14 L18 21.5 L12 17.5 L6 21.5 L8 14 L2 9.3 L9.5 9 Z" />
                </svg>
              ))}
            </div>

            <div className="pt-5 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full bg-[var(--color-violet-100)] grid place-items-center text-[var(--color-violet-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t.authorName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm" style={{ fontFamily: "var(--font-ui)" }}>
                  {t.authorName}
                </div>
                {t.authorLabel && (
                  <div
                    className="text-xs text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {t.authorLabel}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
