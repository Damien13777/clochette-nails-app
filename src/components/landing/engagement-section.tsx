/**
 * EngagementSection — 4 valeurs en cards.
 * Server Component (pas d'interactivité, anim CSS only).
 */

const VALUES = [
  {
    icon: "sparkles",
    title: "Écoute",
    body: "Chaque séance commence par un vrai diagnostic : état de l'ongle, attentes, mode de vie. Look naturel pour le quotidien ou manucure sophistiquée pour une occasion, je crée une prestation sur-mesure qui vous ressemble.",
  },
  {
    icon: "shield-check",
    title: "Hygiène stricte",
    body: "À chaque étape, les protocoles d'hygiène sont scrupuleusement respectés : désinfection des instruments, outils stériles à usage unique. Parce qu'une bonne pose respecte aussi votre santé.",
  },
  {
    icon: "brush",
    title: "Nail-art au pinceau",
    body: "Du motif délicat à la french revisitée, chaque décor est peint à la main, trait par trait. Un nail-art fin, unique et personnel, à la hauteur de vos envies — du plus discret au plus audacieux.",
  },
  {
    icon: "gem",
    title: "Manucure russe",
    body: "Un travail des cuticules d'une grande précision, sans les agresser, pour une pose au plus près de la repousse. Le résultat : un rendu net et harmonieux, qui tient durablement au quotidien.",
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
  brush: (
    <>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
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
        <div className="text-center mb-14">
          <div className="max-w-[36rem] mx-auto">
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
          <p
            className="mt-4 text-sm md:text-base md:whitespace-nowrap text-[var(--color-ink-500)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Dans un cadre propre, apaisant et chaleureux, pour une parenthèse rien qu&apos;à vous.
          </p>
        </div>

        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none scroll-px-5 -mx-5 px-5 md:mx-0 md:px-0 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {VALUES.map((v) => (
            <article
              key={v.title}
              className="snap-start shrink-0 w-[82%] sm:w-[48%] md:w-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 text-center transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)]"
            >
              <div className="w-11 h-11 rounded-full bg-[var(--color-violet-100)] grid place-items-center text-[var(--color-violet-700)] mb-5 mx-auto">
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
