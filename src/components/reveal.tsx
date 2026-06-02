"use client";

/**
 * Reveal — révèle son contenu (fondu + léger slide-up) à l'entrée dans le
 * viewport, via IntersectionObserver. Le style est dans globals.css
 * (`[data-reveal]`). `delay` permet une apparition en cascade entre plusieurs
 * Reveal voisins. `prefers-reduced-motion` est géré en CSS (contenu visible
 * d'emblée, sans dépendre du JS).
 *
 * Usage :
 *   <Reveal><MaSection /></Reveal>
 *   <Reveal delay={120}>…</Reveal>
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

type Props = {
  children: ReactNode;
  /** Délai d'apparition en ms (effet cascade). */
  delay?: number;
  className?: string;
  /** Si vrai : contenu visible d'emblée, sans animation. À utiliser sur le 1er
   *  bloc sous une hero courte, pour éviter un vide blanc tant qu'on n'a pas
   *  scrollé (l'IntersectionObserver ne se déclenche pas si l'élément est dans
   *  les 20% bas du viewport au chargement). */
  immediate?: boolean;
};

export function Reveal({ children, delay = 0, className, immediate = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <div
      ref={ref}
      data-reveal
      data-shown={shown || undefined}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
