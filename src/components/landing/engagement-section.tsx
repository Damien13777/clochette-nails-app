/**
 * EngagementSection — 4 valeurs en cards.
 * Server Component (pas d'interactivité, anim CSS only).
 */

const VALUES = [
  {
    icon: "sparkles",
    title: "Écoute",
    body: "Diagnostic en début de séance — état de l'ongle, attentes, mode de vie.",
  },
  {
    icon: "shield-check",
    title: "Hygiène stricte",
    body: "Désinfection des instruments, outils stériles à usage unique. Votre santé prime.",
  },
  {
    icon: "heart-handshake",
    title: "Produits doux",
    body: "Sélection rigoureuse de produits respectueux de l'ongle naturel.",
  },
  {
    icon: "gem",
    title: "Manucure russe",
    body: "Technique précise pour un résultat élégant et durable, sans agresser la cuticule.",
  },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  sparkles: (
    <path d="M12 3l1.5 5L19 9l-5.5 1L12 15l-1.5-5L5 9l5.5-1L12 3zM5 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM19 14l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z" />
  ),
  "shield-check": (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  "heart-handshake": (
    <>
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0L12 5.35l-.77-.77a5.4 5.4 0 0 0-7.65 7.65l1.04 1.04L12 20.36l7.38-7.38 1.04-1.04a5.4 5.4 0 0 0 0-7.36z" />
      <path d="M12 5.35L8.5 8.85m3.5-3.5l3.5 3.5" />
    </>
  ),
  gem: (
    <>
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M11 3L8 9l4 12 4-12-3-6" />
      <path d="M2 9h20" />
    </>
  ),
};

export function EngagementSection() {
  return (
    <section>
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28">
        <div className="text-center max-w-[36rem] mx-auto mb-14">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Mon engagement
          </p>
          <h2
            className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Une attention sur mesure, à chaque rendez-vous.
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {VALUES.map((v) => (
            <article
              key={v.title}
              className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)]"
            >
              <div className="w-11 h-11 rounded-full bg-[var(--color-violet-100)] grid place-items-center text-[var(--color-violet-700)] mb-5">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[v.icon]}
                </svg>
              </div>
              <h3
                className="text-xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {v.title}
              </h3>
              <p className="text-[15px] text-[var(--color-ink-700)] mt-2 leading-relaxed">
                {v.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
