# Portfolio → page « Réalisations » — Design

**Date :** 2026-06-19
**Statut :** validé (design approuvé par Damien, prêt pour le plan d'implémentation)

## Goal

Sortir le portfolio de la seule landing : la landing devient un **teaser** (max 8 photos,
slide mobile), et toute la collection vit sur une **page dédiée `/realisations`** paginée,
filtrable, indexable. Régler du même coup le crop trop fort (passage en **4:5**) et le
**plafond silencieux de 60 photos**.

## Problème actuel

- `PortfolioSection` (RSC) lit les `ServicePhoto` (`featured:false`) avec un **`take: 60`** et
  rend **toutes** les photos dans une grille sur la landing, via `PortfolioGallery` (client).
- Conséquences quand Chloé alimente le portfolio :
  1. **Plafond 60** : au-delà, ses nouvelles photos n'apparaissent **jamais** (cap silencieux).
  2. **Home à rallonge** : jusqu'à 60 vignettes sur la page la plus importante → longue, lourde.
  3. **Pas de page dédiée** : tout est sur la home (les prestations ont déjà le pattern
     « Voir tout le catalogue » → `/prestations`, pas le portfolio).
- **Crop carré** (`aspect-square` + `object-cover`) coupe trop les photos (ongles/mains
  souvent en portrait).
- **Mobile** : grille 2 colonnes → trop de scroll dès 6 photos.

## Décisions verrouillées

| Sujet | Décision |
|---|---|
| URL page complète | **`/realisations`** (FR, SEO local ; le slug est un signal faible, le vrai SEO = title/h1/alt) |
| Libellé partout | **« Réalisations »** (navbar, footer, titre de section landing) — cohérence + ancre interne |
| Format vignette | **Portrait 4:5**, coins arrondis, `object-cover` ; full size au **clic → lightbox** |
| Lightbox | **Conservée desktop + mobile** (composant `PhotoLightbox` existant, déclenché au clic) |
| Teaser landing | **Max 8 photos** quel que soit le filtre ; **filtres conservés** |
| Teaser mobile | **Slide 2 + aperçu** (pattern prestations : `flex` snap, bord à bord, scrollbar masquée) |
| Teaser desktop | Grille **4 colonnes** (jusqu'à 2 lignes de 4) |
| Invite landing | Lien **« Voir tout le portfolio → »** (style identique à « Voir tout le catalogue » des prestations) |
| Chargement page | **A+** : le serveur envoie **toutes** les photos (JSON léger) ; le client en rend **24**, **« Voir plus »** révèle les 24 suivants ; images **lazy**. Pas d'aller-retour serveur. |

## Architecture

Deux contextes (teaser landing / page complète) qui partagent les mêmes briques visuelles.

### Briques partagées (nouveau dossier `src/components/portfolio/`)

- **`portfolio-thumb.tsx`** — la vignette : `<button>` ratio **4:5** arrondi, `<img>` (`srcSet`
  via `buildSrcSet`, `loading="lazy"`), légende au survol, `onClick(idx)`. **`sizes` passé en
  prop** par le consommateur (teaser ≈ `(min-width:768px) 25vw, 42vw` ; page ≈
  `(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw`). Une seule source de vérité pour le
  rendu d'une vignette.
- **`filter-chips.tsx`** — la barre de chips (extraction du `FilterChip` actuel) :
  `categories`, `active`, `onChange`. Réutilisée par le teaser et la page.
- **`PhotoLightbox`** (existant, `src/components/photo-lightbox.tsx`) — réutilisé tel quel.
- **Type partagé** `PortfolioPhoto` (id, url, alt, caption, category, variants) + map
  `CATEGORY_LABELS` (aujourd'hui dans `portfolio-section.tsx`) déplacée ici pour réemploi.

### 1. Landing teaser

- **`src/components/landing/portfolio-section.tsx`** (RSC, modifié) :
  - Fetch un **pool borné** suffisant pour 8 par filtre : `take: 40`, `orderBy [displayOrder asc, createdAt desc]`, `where featured:false`.
  - Calcule les catégories présentes.
  - En-tête : eyebrow **« Mon travail »** + h2 **« Réalisations »** (aligne le pattern
    « Mon savoir-faire / Prestations »). Remplace l'actuel eyebrow « Réalisations » + h2 « Portfolio ».
  - Rend `<PortfolioTeaser photos categories />`.
  - Si 0 photo : conserve l'`EmptyPlaceholder` hachuré actuel.
- **`src/components/portfolio/portfolio-teaser.tsx`** (client, nouveau) :
  - `FilterChips` + state `active` (`"all" | ServiceCategory`).
  - `visible` = photos du filtre actif, **tronqué à 8**.
  - **Mobile** (`< md`) : conteneur `flex` snap (mêmes classes que le carrousel prestations
    validé : `overflow-x-auto snap-x snap-mandatory scroll-px-5 -mx-5 px-5` + scrollbar masquée) ;
    chaque vignette `snap-start shrink-0 w-[42%]` pour montrer **2 + aperçu** (largeur à affiner
    visuellement comme les prestations).
  - **Desktop** (`md+`) : grille `md:grid-cols-3 lg:grid-cols-4`.
  - Clic vignette → `PhotoLightbox` (navigue sur les ≤8 visibles).
  - Sous la grille : lien **« Voir tout le portfolio → »** vers `/realisations` (style services).

### 2. Page `/realisations`

- **`src/app/realisations/page.tsx`** (RSC, nouveau) :
  - `export const metadata` : title/description SEO (cf. section SEO), `robots: index/follow`.
  - Fetch **toutes** les photos `featured:false`, `orderBy [displayOrder asc, createdAt desc]`,
    **sans `take`**.
  - En-tête de page (h1 « Réalisations » + sous-titre) cohérent avec le design landing,
    dans le `SiteHeader`/`SiteFooter` du layout public existant.
  - Rend `<PortfolioGalleryFull photos categories />`.
  - Si 0 photo : état vide « Les premières réalisations arrivent bientôt. »
- **`src/components/portfolio/portfolio-gallery.tsx`** (client — déplacé/renommé depuis
  `landing/portfolio-gallery.tsx`, enrichi) :
  - `FilterChips` + state `active` + state `visibleCount` (défaut **24**).
  - `visible` = photos du filtre actif ; rend `visible.slice(0, visibleCount)`.
  - **« Voir plus »** affiché si `visible.length > visibleCount` → `visibleCount += 24`.
  - **Changement de filtre → reset `visibleCount = 24`**.
  - Grille `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (mobile = grille 2 col classique ;
    le scroll est attendu sur une page dédiée, **pas** de slide ici).
  - Clic vignette → `PhotoLightbox` (navigue sur tout le set filtré, pas seulement les rendus).

### 3. Navigation

- **`src/components/landing/site-header.tsx:19`** : `{ href: "/#portfolio", label: "Portfolio" }`
  → `{ href: "/realisations", label: "Réalisations" }`.
- **`src/components/landing/footer-content.tsx:72`** : `href="/#portfolio"` + texte « Portfolio »
  → `href="/realisations"` + « Réalisations ».
- **`src/app/sitemap.ts`** : ajouter l'entrée `/realisations`.

## Data flow

1. **Landing** : RSC `portfolio-section` → pool 40 → teaser client → filtre + slice(8) → DOM
   ne contient que ≤8 `<img>` (lazy) du filtre actif.
2. **Page** : RSC `realisations/page` → toutes les photos (JSON léger) → gallery client →
   filtre + slice(`visibleCount`) → DOM borné à 24 (puis +24 au clic), images lazy.
3. Aucune Server Action / route API : pagination 100 % côté client (slice d'un tableau déjà
   en mémoire). Lightbox = état client local.

## SEO

- **title** : `Réalisations — nail art & prothésie ongulaire à Moncoutant-sur-Sèvre | Clochette Nails`
- **description** : `Découvrez les réalisations de Clochette Nails : manucure russe, pose semi-permanente, nail-art. Salon de prothésie ongulaire à Moncoutant-sur-Sèvre.`
- **h1** : « Réalisations ».
- `robots: { index: true, follow: true }` (page publique — surtout **pas** noindex).
- `alt` des images : déjà en DB (`ServicePhoto.alt`).
- Ajout au **sitemap**. Ancre interne « Réalisations » (navbar/footer) → renforce le mot-clé.
- (Optionnel, non bloquant) JSON-LD `BreadcrumbList` Accueil › Réalisations.

## Cas limites

- **0 photo** : landing = `EmptyPlaceholder` actuel ; page = message « bientôt ».
- **< 8 photos** : teaser affiche ce qui existe, slide mobile OK avec peu d'items.
- **Filtre sans résultat** : message « Aucune photo dans cette catégorie pour le moment. »
- **Filtre changé page** : `visibleCount` réinitialisé à 24.
- **« Voir plus »** : caché tant que `visible.length <= visibleCount`.
- **Lightbox + filtre** : ouvrir la lightbox puis changer de filtre → fermeture (comportement
  actuel conservé via reset au changement de `active`).

## Tests & validation

- Feature essentiellement **UI/CSS** → validation **visuelle en local d'abord** (workflow
  établi : commit sans push, contrôle sur le dev de Damien, puis push/deploy).
- Si on extrait la logique « slice / load-more » en fonction pure, un petit test Vitest
  unitaire est possible (non bloquant).
- **Lighthouse** après coup : vérifier que le teaser (cap 8 + lazy) **ne dégrade pas** la
  landing ; auditer la nouvelle page `/realisations` (desktop + mobile), CLS attendu à 0.

## Hors scope (YAGNI)

- **Pagination serveur** (Server Action / `?page=`) : à ne faire que si le volume atteint des
  **milliers** de photos — upgrade trivial depuis A+ le moment venu.
- **Masonry** (hauteurs variables) : écarté au profit du 4:5 uniforme (slide propre + cohérence).
- **Changement admin** : aucun — on consomme les `ServicePhoto featured:false` existantes.
