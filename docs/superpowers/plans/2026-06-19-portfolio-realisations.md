# Portfolio → page « Réalisations » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le portfolio (aujourd'hui entièrement sur la landing, capé à 60) en un **teaser** sur la home (max 8, slide mobile, vignettes 4:5) + une **page dédiée `/realisations`** complète, filtrable, paginée (paquets de 24 + « Voir plus »), indexable.

**Architecture:** Deux composants client consommateurs (`PortfolioTeaser` pour la landing, `PortfolioGallery` pour la page) partagent trois briques (`types.ts`, `FilterChips`, `PortfolioThumb`) et la `PhotoLightbox` existante. Les RSC parents (`portfolio-section.tsx`, `app/realisations/page.tsx`) font les requêtes Prisma et passent les données. Pagination 100 % côté client (slice d'un tableau en mémoire), images `loading="lazy"`.

**Tech Stack:** Next.js 16 App Router (RSC + client components), React 19, Prisma 7, Tailwind v4 (tokens `@theme`), composant `PhotoLightbox` + helper `buildSrcSet` existants.

**Spec :** `docs/superpowers/specs/2026-06-19-portfolio-realisations-design.md`

**Workflow (IMPORTANT) :** branche `feat/portfolio-realisations` déjà créée. On **commit chaque tâche mais on NE PUSH PAS** : Damien valide visuellement sur son dev local avant push + déploiement (cf. mémoire `feedback-local-validation-before-deploy`). Chemins **absolus v2 obligatoires** si besoin (cwd shell peut retomber sur v1).

---

## File Structure

**Créés :**
- `src/components/portfolio/types.ts` — type `PortfolioPhoto`, `PortfolioCategory`, map `CATEGORY_LABELS` (partagés, zéro dep serveur).
- `src/components/portfolio/filter-chips.tsx` — barre de chips de filtre (client, extraite de l'actuel `FilterChip`).
- `src/components/portfolio/portfolio-thumb.tsx` — vignette 4:5 lazy + légende + clic (client).
- `src/components/portfolio/portfolio-gallery.tsx` — galerie complète page (filtres + grille + load-more 24 + lightbox).
- `src/components/portfolio/portfolio-teaser.tsx` — teaser landing (filtres + slide mobile/grille desktop, max 8 + lien « Voir tout »).
- `src/app/realisations/page.tsx` — page publique `/realisations` (RSC).

**Modifiés :**
- `src/components/landing/portfolio-section.tsx` — devient le RSC du teaser (pool 40, nouvel en-tête, rend `PortfolioTeaser`).
- `src/components/landing/site-header.tsx:19` — lien nav Portfolio → Réalisations.
- `src/components/landing/footer-content.tsx:72` — lien footer Portfolio → Réalisations.
- `src/app/sitemap.ts` — ajout `/realisations`.

**Supprimé :**
- `src/components/landing/portfolio-gallery.tsx` — remplacé par `portfolio/portfolio-gallery.tsx` (après bascule des imports).

---

## Task 1 : Briques partagées (types, chips, vignette 4:5)

**Files:**
- Create: `src/components/portfolio/types.ts`
- Create: `src/components/portfolio/filter-chips.tsx`
- Create: `src/components/portfolio/portfolio-thumb.tsx`

- [ ] **Step 1 : Créer le module de types partagés**

`src/components/portfolio/types.ts` :

```tsx
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
```

- [ ] **Step 2 : Créer la barre de chips**

`src/components/portfolio/filter-chips.tsx` :

```tsx
"use client";

/**
 * Barre de chips de filtre par catégorie, partagée par le teaser landing
 * et la page /realisations. Scroll horizontal sur mobile, centrée desktop.
 */
import type { ServiceCategory } from "@prisma/client";
import type { PortfolioCategory } from "./types";

type Props = {
  categories: PortfolioCategory[];
  active: ServiceCategory | "all";
  onChange: (value: ServiceCategory | "all") => void;
};

export function FilterChips({ categories, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filtres portfolio"
      className="flex gap-2 mb-10 overflow-x-auto md:justify-center pb-2 -mx-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Chip label="Tous" active={active === "all"} onClick={() => onChange("all")} />
      {categories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.label}
          active={active === cat.id}
          onClick={() => onChange(cat.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 px-4 py-2 text-xs uppercase tracking-[0.06em] rounded-full transition-all ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-paper)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] hover:text-[var(--color-violet-700)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3 : Créer la vignette 4:5**

`src/components/portfolio/portfolio-thumb.tsx` :

```tsx
"use client";

/**
 * Vignette portfolio partagée : bouton ratio 4:5 (coins arrondis), image
 * lazy + srcSet, légende au survol. Clic → onOpen(index) (ouvre la lightbox).
 * `sizes` passé en prop (teaser et page ont des largeurs différentes).
 */
import { buildSrcSet } from "@/lib/image-srcset";
import type { PortfolioPhoto } from "./types";

type Props = {
  photo: PortfolioPhoto;
  index: number;
  sizes: string;
  onOpen: (index: number) => void;
};

export function PortfolioThumb({ photo, index, sizes, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Voir ${photo.alt} en plein écran`}
      className="group relative aspect-[4/5] w-full rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-600)] focus:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        srcSet={buildSrcSet(photo.variants)}
        sizes={sizes}
        alt={photo.alt}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {photo.caption && (
        <span
          className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-700)] bg-[var(--color-paper)]/85 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {photo.caption}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4 : Vérifier la compilation (typecheck ciblé)**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/portfolio" || echo "OK"`
Expected: `OK` (aucune erreur dans les nouveaux fichiers ; ils ne sont pas encore importés, c'est normal).

- [ ] **Step 5 : Commit**

```bash
git add src/components/portfolio/types.ts src/components/portfolio/filter-chips.tsx src/components/portfolio/portfolio-thumb.tsx
git commit -m "feat(portfolio): briques partagées (types, FilterChips, PortfolioThumb 4:5)"
```

---

## Task 2 : Galerie complète (page) avec load-more

**Files:**
- Create: `src/components/portfolio/portfolio-gallery.tsx`

> ⚠️ On crée le NOUVEAU fichier sans encore toucher/supprimer l'ancien `src/components/landing/portfolio-gallery.tsx` (suppression en Task 4, une fois ses imports basculés) → chaque commit reste compilable.

- [ ] **Step 1 : Créer la galerie complète**

`src/components/portfolio/portfolio-gallery.tsx` :

```tsx
"use client";

/**
 * Galerie portfolio complète (/realisations) : filtres + grille + load-more.
 * Le serveur envoie toutes les photos ; on en rend PAGE_SIZE (24) et
 * « Voir plus » révèle les 24 suivantes. Images lazy. Clic → lightbox
 * (navigation sur tout le set filtré, même au-delà du rendu).
 */
import { useEffect, useMemo, useState } from "react";
import type { ServiceCategory } from "@prisma/client";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { FilterChips } from "./filter-chips";
import { PortfolioThumb } from "./portfolio-thumb";
import type { PortfolioPhoto, PortfolioCategory } from "./types";

const PAGE_SIZE = 24;

type Props = {
  photos: PortfolioPhoto[];
  categories: PortfolioCategory[];
};

export function PortfolioGallery({ photos, categories }: Props) {
  const [active, setActive] = useState<ServiceCategory | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      active === "all" ? photos : photos.filter((p) => p.category === active),
    [photos, active],
  );
  const shown = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  // Reset pagination + lightbox au changement de filtre
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire au changement de filtre
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire au changement de filtre
    setLightboxIdx(null);
  }, [active]);

  return (
    <>
      <FilterChips categories={categories} active={active} onChange={setActive} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {shown.map((p, idx) => (
          <PortfolioThumb
            key={p.id}
            photo={p}
            index={idx}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            onOpen={setLightboxIdx}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mt-12"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo dans cette catégorie pour le moment.
        </p>
      )}

      {hasMore && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--color-violet-200)] text-sm text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Voir plus
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {lightboxIdx !== null && filtered[lightboxIdx] && (
        <PhotoLightbox
          photos={filtered}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2 : Typecheck ciblé**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "portfolio/portfolio-gallery" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3 : Commit**

```bash
git add src/components/portfolio/portfolio-gallery.tsx
git commit -m "feat(portfolio): galerie complète avec load-more (paquets de 24)"
```

---

## Task 3 : Page `/realisations` + sitemap

**Files:**
- Create: `src/app/realisations/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1 : Créer la page**

`src/app/realisations/page.tsx` :

```tsx
/**
 * /realisations — Galerie complète des réalisations (portfolio public).
 *
 * Toutes les photos portfolio (ServicePhoto featured=false), filtrables par
 * catégorie, rendues par paquets de 24 ("Voir plus"), lightbox au clic.
 */
import type { Metadata } from "next";
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { PortfolioGallery } from "@/components/portfolio/portfolio-gallery";
import { CATEGORY_LABELS, type PortfolioPhoto } from "@/components/portfolio/types";

export const metadata: Metadata = {
  title: "Réalisations · Nail art & prothésie ongulaire",
  description:
    "Découvrez les réalisations de Clochette Nails : manucure russe, pose semi-permanente, rallongements et nail-art. Salon de prothésie ongulaire à Moncoutant-sur-Sèvre.",
  alternates: { canonical: "/realisations" },
};

export const dynamic = "force-dynamic";

export default async function RealisationsPage() {
  const photos: PortfolioPhoto[] = await prisma.servicePhoto.findMany({
    where: { featured: false },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      category: true,
      variants: true,
    },
  });
  const presentCats: ServiceCategory[] = Array.from(
    new Set(photos.map((p) => p.category)),
  );

  return (
    <>
      <SiteHeader />
      <main className="bg-[var(--color-cream)]">
        {/* Header / intro */}
        <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-12 md:pb-16">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)] flex items-center gap-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span
              className="inline-block w-9 h-px bg-[var(--color-violet-300)]"
              aria-hidden="true"
            />
            Galerie
          </p>
          <h1
            className="mt-6 text-[clamp(2.27rem,5.5vw,3.63rem)] leading-[1.05] tracking-[0.02em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            RÉALISATIONS
          </h1>
          <p
            className="mt-4 text-[clamp(1.25rem,2.4vw,1.75rem)] text-[var(--color-violet-700)] -mt-1"
            style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            Le travail de Chloé en images
          </p>
        </section>

        {/* Galerie */}
        <section className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pb-20 md:pb-28">
          {photos.length === 0 ? (
            <p
              className="text-center text-sm text-[var(--color-ink-500)] py-16"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Les premières réalisations arrivent bientôt.
            </p>
          ) : (
            <PortfolioGallery
              photos={photos}
              categories={presentCats.map((c) => ({
                id: c,
                label: CATEGORY_LABELS[c],
              }))}
            />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2 : Ajouter `/realisations` au sitemap**

Dans `src/app/sitemap.ts`, ajouter cette entrée dans le tableau `staticPages`, juste après la ligne `/prestations` :

```ts
    { url: `${SITE_URL}/realisations`, lastModified: now, priority: 0.8, changeFrequency: "weekly" },
```

- [ ] **Step 3 : Vérifier la page en build (route présente)**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "realisations|sitemap" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4 : Commit**

```bash
git add src/app/realisations/page.tsx src/app/sitemap.ts
git commit -m "feat(portfolio): page /realisations (collection complète) + sitemap"
```

---

## Task 4 : Teaser landing (+ bascule de `portfolio-section`, suppression ancienne galerie)

**Files:**
- Create: `src/components/portfolio/portfolio-teaser.tsx`
- Modify: `src/components/landing/portfolio-section.tsx` (réécriture)
- Delete: `src/components/landing/portfolio-gallery.tsx`

- [ ] **Step 1 : Créer le teaser**

`src/components/portfolio/portfolio-teaser.tsx` :

```tsx
"use client";

/**
 * Teaser portfolio de la landing : filtres + max 8 photos.
 * Mobile = slide 2 + aperçu (scroll-snap, même pattern que prestations) ;
 * desktop = grille 4 colonnes. Clic → lightbox. Lien « Voir tout le
 * portfolio » → /realisations.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ServiceCategory } from "@prisma/client";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { FilterChips } from "./filter-chips";
import { PortfolioThumb } from "./portfolio-thumb";
import type { PortfolioPhoto, PortfolioCategory } from "./types";

const MAX_TEASER = 8;

type Props = {
  photos: PortfolioPhoto[];
  categories: PortfolioCategory[];
};

export function PortfolioTeaser({ photos, categories }: Props) {
  const [active, setActive] = useState<ServiceCategory | "all">("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const visible = useMemo(() => {
    const filtered =
      active === "all" ? photos : photos.filter((p) => p.category === active);
    return filtered.slice(0, MAX_TEASER);
  }, [photos, active]);

  // Reset lightbox au changement de filtre
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset volontaire au changement de filtre
    setLightboxIdx(null);
  }, [active]);

  return (
    <>
      <FilterChips categories={categories} active={active} onChange={setActive} />

      {/* Mobile : slide 2 + aperçu (pattern prestations) ; desktop : grille 4 col */}
      <div className="flex md:grid md:grid-cols-4 gap-3 md:gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none scroll-px-5 -mx-5 px-5 md:mx-0 md:px-0 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((p, idx) => (
          <div key={p.id} className="snap-start shrink-0 w-[42%] md:w-auto">
            <PortfolioThumb
              photo={p}
              index={idx}
              sizes="(min-width: 768px) 25vw, 42vw"
              onOpen={setLightboxIdx}
            />
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <p
          className="text-center text-sm text-[var(--color-ink-500)] mt-8"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucune photo dans cette catégorie pour le moment.
        </p>
      )}

      <div className="mt-10 text-center">
        <Link
          href="/realisations"
          className="text-sm text-[var(--color-violet-700)] hover:text-[var(--color-violet-600)] inline-flex items-center gap-1 transition-colors"
        >
          Voir tout le portfolio
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

      {lightboxIdx !== null && visible[lightboxIdx] && (
        <PhotoLightbox
          photos={visible}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2 : Réécrire `portfolio-section.tsx` (RSC teaser)**

Remplacer **tout** le contenu de `src/components/landing/portfolio-section.tsx` par :

```tsx
/**
 * PortfolioSection — Server Component (teaser landing).
 *
 * Fetch un pool borné de photos portfolio (featured=false) et délègue
 * l'affichage (filtres + slide mobile + grille desktop + lightbox + lien
 * « Voir tout ») au PortfolioTeaser. Si aucune photo : placeholder hachuré.
 */
import type { ServiceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PortfolioTeaser } from "@/components/portfolio/portfolio-teaser";
import {
  CATEGORY_LABELS,
  type PortfolioPhoto,
} from "@/components/portfolio/types";

const TEASER_POOL = 40;

export async function PortfolioSection() {
  const photos: PortfolioPhoto[] = await prisma.servicePhoto.findMany({
    where: { featured: false },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    take: TEASER_POOL,
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      category: true,
      variants: true,
    },
  });

  const presentCats: ServiceCategory[] = Array.from(
    new Set(photos.map((p) => p.category)),
  );

  return (
    <section
      id="portfolio"
      className="bg-[var(--color-rose-50)]/50 border-y border-[var(--color-line)]"
    >
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28">
        {/* Header */}
        <div className="text-center max-w-[36rem] mx-auto mb-10">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Mon travail
          </p>
          <h2
            className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Réalisations
          </h2>
        </div>

        {photos.length === 0 ? (
          <EmptyPlaceholder />
        ) : (
          <PortfolioTeaser
            photos={photos}
            categories={presentCats.map((c) => ({
              id: c,
              label: CATEGORY_LABELS[c],
            }))}
          />
        )}
      </div>
    </section>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="relative aspect-[4/5] rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-line)]"
          style={{
            backgroundColor: "var(--color-rose-100)",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(202,160,166,0.5) 0, rgba(202,160,166,0.5) 1px, transparent 1px, transparent 14px)",
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier qu'aucun autre fichier n'importe l'ancienne galerie**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && grep -rn "landing/portfolio-gallery" src/ || echo "AUCUN IMPORT — suppression OK"`
Expected: `AUCUN IMPORT — suppression OK`.

- [ ] **Step 4 : Supprimer l'ancienne galerie**

```bash
git rm src/components/landing/portfolio-gallery.tsx
```

- [ ] **Step 5 : Typecheck ciblé**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "portfolio|landing" || echo "OK"`
Expected: `OK`.

- [ ] **Step 6 : Commit**

```bash
git add src/components/portfolio/portfolio-teaser.tsx src/components/landing/portfolio-section.tsx
git commit -m "feat(portfolio): teaser landing (max 8, slide mobile, en-tête Réalisations)"
```

---

## Task 5 : Navigation (navbar + footer) vers `/realisations`

**Files:**
- Modify: `src/components/landing/site-header.tsx:19`
- Modify: `src/components/landing/footer-content.tsx:72`

- [ ] **Step 1 : Navbar**

Dans `src/components/landing/site-header.tsx`, dans le tableau `NAV_ITEMS`, remplacer :

```ts
  { href: "/#portfolio", label: "Portfolio" },
```

par :

```ts
  { href: "/realisations", label: "Réalisations" },
```

- [ ] **Step 2 : Footer**

Dans `src/components/landing/footer-content.tsx`, le `<li>` du portfolio (≈ ligne 70-77), remplacer :

```tsx
                <Link
                  href="/#portfolio"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Portfolio
                </Link>
```

par :

```tsx
                <Link
                  href="/realisations"
                  className="hover:text-[var(--color-violet-700)] transition-colors"
                >
                  Réalisations
                </Link>
```

- [ ] **Step 3 : Commit**

```bash
git add src/components/landing/site-header.tsx src/components/landing/footer-content.tsx
git commit -m "feat(portfolio): navbar + footer pointent vers /realisations (Réalisations)"
```

---

## Task 6 : Vérification globale + handoff validation locale

> Cette feature est **UI/CSS** : pas de test unitaire pertinent (les carrousels/grilles se valident à l'œil). Vérification = build + lint + typecheck verts, puis **validation visuelle en local par Damien** (workflow établi), puis Lighthouse.

- [ ] **Step 1 : Lint**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm lint 2>&1 | tail -15`
Expected: `✔ No ESLint warnings or errors` (ou aucune erreur sur les fichiers portfolio).

- [ ] **Step 2 : Build prod complet** (sandbox réseau OFF — fonts/télémétrie)

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && ./node_modules/.bin/next build 2>&1 | tail -15`
Expected: build OK, et la route `○ /realisations` (ou `ƒ /realisations`) apparaît dans la liste des routes.

- [ ] **Step 3 : Handoff validation locale (NE PAS PUSH)**

Annoncer à Damien : commits faits sur `feat/portfolio-realisations`, **non poussés**. Lui demander de lancer son dev (`pnpm dev`, port 3000 libre) et de vérifier :
1. **Landing → section « Réalisations »** : teaser max 8 ; mobile = slide 2 + aperçu (clic → grand format) ; desktop = grille 4 col ; vignettes 4:5 arrondies ; filtres OK ; lien « Voir tout le portfolio → ».
2. **`/realisations`** : collection complète, filtres, « Voir plus » si > 24, lightbox desktop + mobile, en-tête propre.
3. **Navbar + footer** : « Réalisations » → `/realisations`.
4. **0/Peu de photos** : pas de casse (placeholder landing, message page).

- [ ] **Step 4 : Lighthouse (après validation visuelle)** — build prod isolé sur port séparé

Suivre la mémoire `reference-lighthouse-clean-prod-build` : `next build` puis `next start -p 3100`, auditer `/` (teaser ne doit pas régresser, CLS 0) et `/realisations` (desktop + mobile) via `npx lighthouse@latest` headless.

- [ ] **Step 5 : Finalisation** — Une fois Damien OK : push + (selon décision) merge `--no-ff` dans `main` + déploiement VPS (git pull + `pnpm build` + `pm2 restart clochette-nails` + health check). Via la skill `superpowers:finishing-a-development-branch`.

---

## Self-Review (effectuée)

- **Spec coverage :** teaser cap 8 (T4) ✓ ; slide mobile 2+aperçu (T4) ✓ ; desktop grille 4 (T4) ✓ ; 4:5 partout (T1 PortfolioThumb) ✓ ; lightbox desktop+mobile (T1/T2/T4 via PhotoLightbox) ✓ ; lien « Voir tout » style prestations (T4) ✓ ; page /realisations complète + filtres + load-more 24 (T2/T3) ✓ ; suppression cap 60 (T3 fetch sans take) ✓ ; navbar+footer « Réalisations » (T5) ✓ ; SEO title/desc/h1/sitemap (T3) ✓ ; cas 0 photo (T3/T4) ✓.
- **Placeholders :** aucun — code complet dans chaque step.
- **Cohérence des types :** `PortfolioPhoto`/`PortfolioCategory`/`CATEGORY_LABELS` définis en T1, consommés à l'identique en T2/T3/T4 ; `PortfolioThumb` signature `(photo, index, sizes, onOpen)` cohérente partout ; `PhotoLightbox` props `(photos, startIndex, onClose)` conformes à l'existant.
- **Note résiduelle :** l'`id="portfolio"` de la section landing est conservé (compat d'éventuels deep-links `/#portfolio`) ; les liens nav/footer pointent désormais vers `/realisations`.
