/**
 * Layout /admin/photos — header + onglets (Site / Prestations / Portfolio).
 *
 * Server Component qui rend le header commun. Les pages enfants gèrent
 * leur propre contenu spécifique.
 */

import { PhotosTabs } from "./photos-tabs";

export default function PhotosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Médiathèque
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Photos
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)] max-w-2xl"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Tous les visuels du site. Les uploads sont auto-optimisés (WebP, 3
          tailles, EXIF strippé) et propagés instantanément sur la landing
          publique.
        </p>
      </header>

      <PhotosTabs />

      <div className="mt-8">{children}</div>

      <p
        className="mt-12 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Stockage :{" "}
        <code className="font-mono normal-case text-[var(--color-ink-700)]">
          /public/uploads/
        </code>{" "}
        — local, servi en production (pas de stockage cloud : choix multi-instance).
      </p>
    </div>
  );
}
