/**
 * Hero — Server Component, optimisé LCP.
 *
 * Layout split 60/40 desktop, single column mobile.
 * Hero "LA MANUCURE" Cinzel caps + italique Inria fallback via <i>.
 *
 * Si les SiteMedia `hero_desktop` / `hero_mobile` sont uploadées via
 * /admin/photos/site, on les affiche. Sinon, fallback sur le placeholder
 * rose hachuré.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildSrcSet } from "@/lib/image-srcset";

export async function Hero() {
  const [slots, settings] = await Promise.all([
    prisma.siteMedia.findMany({
      where: { slot: { in: ["hero_desktop", "hero_mobile"] } },
      select: {
        slot: true,
        url: true,
        alt: true,
        width: true,
        height: true,
        variants: true,
      },
    }),
    prisma.platformSettings.findFirst({
      select: { testimonialsGoogleLine: true },
    }),
  ]);
  const googleLine = settings?.testimonialsGoogleLine ?? null;
  const heroDesktop = slots.find((s) => s.slot === "hero_desktop") ?? null;
  const heroMobile = slots.find((s) => s.slot === "hero_mobile") ?? null;
  const heroDesktopSrcSet = heroDesktop ? buildSrcSet(heroDesktop.variants) : undefined;
  const heroMobileSrcSet = heroMobile ? buildSrcSet(heroMobile.variants) : undefined;

  return (
    <section
      id="accueil"
      className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-20 md:pb-32"
    >
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-10 lg:gap-16 items-stretch">
        {/* Colonne texte */}
        <div className="flex flex-col">
          {/* Eyebrow */}
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] flex items-center gap-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span
              className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
              aria-hidden="true"
            />
            Salon · Moncoutant-sur-Sèvre
          </p>

          {/* H1 Cinzel caps + sous-titre Inria italic */}
          <h1
            className="mt-6 text-[clamp(2.27rem,5.5vw,3.63rem)] leading-[1.05] tracking-[0.02em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            LA MANUCURE
          </h1>
          <p
            className="text-[clamp(1.25rem,2.4vw,1.75rem)] text-[var(--color-violet-700)] -mt-1"
            style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            Avec passion et précision
          </p>

          {/* Body */}
          <p className="mt-6 text-sm md:text-base text-[var(--color-ink-700)] max-w-[48ch] leading-relaxed">
            Des poses durables, un rendu naturel, des ongles respectés :
            voilà ce qui guide chacun de mes gestes.
          </p>
          <p className="mt-4 text-sm md:text-base text-[var(--color-ink-700)] max-w-[48ch] leading-relaxed">
            Moi, c&apos;est Chloé, prothésiste ongulaire depuis 2025,
            spécialisée dans la manucure russe et le nail-art au pinceau.
            Je multiplie les formations et perfectionne mes techniques en
            permanence, parce que la précision est un savoir-faire qui
            s&apos;entretient.
          </p>

          {/* CTAs */}
          <div className="mt-auto pt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/reservation"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prendre rendez-vous
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
            <Link
              href="#prestations"
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Découvrir les prestations
            </Link>
          </div>

          {/* Photo mobile only — sous les CTAs */}
          <div className="lg:hidden mt-10">
            <div className="relative aspect-[4/3] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-line)]">
              {heroMobile ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={heroMobile.url}
                  srcSet={heroMobileSrcSet}
                  sizes="(min-width: 1024px) 1px, 100vw"
                  alt={heroMobile.alt}
                  width={heroMobile.width ?? undefined}
                  height={heroMobile.height ?? undefined}
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <HatchedPlaceholder
                  badgePosition="top-3 right-3"
                  captionPosition="bottom-3 left-3"
                />
              )}
            </div>
          </div>

          {/* Info row desktop only */}
          <div
            className="mt-12 hidden md:flex items-center gap-8 text-[13px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <div className="flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Moncoutant-sur-Sèvre, 79320</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>
              Lun–Sam sauf mer.
              <br />
              sur rendez-vous
            </span>
            </div>
            {googleLine && (
              <div className="flex items-center gap-2" aria-label={googleLine}>
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
                <span>{googleLine}</span>
              </div>
            )}
          </div>
        </div>

        {/* Photo desktop only */}
        <div className="hidden lg:block">
          <div className="relative aspect-[4/5] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-line)]">
            {heroDesktop ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={heroDesktop.url}
                srcSet={heroDesktopSrcSet}
                sizes="(min-width: 1024px) 40vw, 1px"
                alt={heroDesktop.alt}
                width={heroDesktop.width ?? undefined}
                height={heroDesktop.height ?? undefined}
                fetchPriority="high"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <HatchedPlaceholder
                badgePosition="top-4 right-4"
                captionPosition="bottom-4 left-4"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Placeholder rose hachuré utilisé tant qu'aucune photo n'a été uploadée
 * dans /admin/photos/site. Disparaît dès que SiteMedia hero_* existe.
 */
function HatchedPlaceholder({
  badgePosition,
  captionPosition,
}: {
  badgePosition: string;
  captionPosition: string;
}) {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: "var(--color-rose-50)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(233,191,196,0.5) 0, rgba(233,191,196,0.5) 1px, transparent 1px, transparent 14px)",
      }}
    >
      <span
        className={`absolute ${badgePosition} px-3 py-1 rounded-full bg-[var(--color-violet-100)] text-[var(--color-violet-700)] text-[10px] uppercase tracking-[0.16em]`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        Studio Clochette
      </span>
      <span
        className={`absolute ${captionPosition} text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]`}
        style={{ fontFamily: "var(--font-ui)" }}
      >
        Photo · mains soignées
      </span>
    </div>
  );
}
