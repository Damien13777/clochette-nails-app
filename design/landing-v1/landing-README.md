# Clochette Nails — Page d'accueil (Landing)

Handoff Next.js · App Router · Tailwind v4 · Server Components

---

## 1. Overview

Page d'accueil publique de Clochette Nails (`/`), studio de prothésie ongulaire à Moncoutant-sur-Sèvre.
Le but unique de cette page est la **conversion** : amener la visiteuse vers la prise de RDV, tout en démontrant le savoir-faire (photos, témoignages, valeurs) et en assurant un fort SEO local.

- **Framework** : Next.js 16 (App Router)
- **Routage** : `/src/app/(marketing)/page.tsx`
- **Styles** : Tailwind v4 + tokens hérités du design system v1
- **Hydration** : 90 % Server Components, îlots Client uniquement (cf. § 7)
- **Cible Lighthouse** : 95-100 / 95-100 / 100 / 100

> Le design system v1 (palette mauve doux, doré soft, quatuor Cinzel + Julius Sans One + Inria Serif Light + Manrope) est la **source de vérité visuelle**. Toute classe utilisée ici (`.btn`, `.card`, `.badge-rose`, `.nav-link`, `.section-eyebrow`, etc.) provient du DS — ne réinventez rien.

---

## 2. Sections

Ordre vertical de la page (de haut en bas) :

| # | Section | Anchor | Description |
|---|---|---|---|
| 1 | **Header** | — | Fixed + backdrop blur scroll-triggered |
| 2 | **Hero** | `#accueil` | Split éditorial 60/40 (titre/photo), 2 CTAs |
| 3 | **Engagement** | — | 4 valeurs en cards (écoute, hygiène, produits, manucure russe) |
| 4 | **Prestations** | `#prestations` | Grid 3×2 de 6 prestations vedettes, **sans prix** |
| 5 | **Portfolio** | `#portfolio` | Galerie 12 photos + 5 tabs filtrables |
| 6 | **Témoignages** | `#avis` | 3 avis clients, slider en mobile |
| 7 | **Contact** | `#contact` | 3 info cards + form court (pas de RDV ici) |
| 8 | **CTA final** | — | Bandeau violet-100, titre Cinzel + bouton |
| 9 | **Footer** | — | 4 col + newsletter |

### 2.1 Header
- **Comportement** : `position: fixed`, transparent au-dessus de 8 px de scroll, puis bascule en `rgba(252,251,247,0.82) + backdrop-filter: blur(16px)` + bottom border `--color-line`
- **Desktop** : logo rond violet 32 px + brand "Clochette Nails" (gauche), nav 5 items (centre), CTA pill `btn-primary btn-sm` (droite)
- **Mobile** : burger (gauche), brand (centre), pas de CTA visible — il est dans le menu drawer
- **Menu mobile** : drawer plein écran depuis la droite, fond `--color-cream`, items en `font-serif text-2xl`, CTA `btn-primary btn-lg` en bas, fermable par Esc

### 2.2 Hero
- **Eyebrow** : `Studio · Moncoutant-sur-Sèvre` + ornement (trait violet-300, 36 px)
- **H1** : `Cinzel 500`, `clamp(2.27rem, 5.5vw, 3.63rem)`, tracking `+0.02em` — texte : `LA MANUCURE`
- **Sous-titre H1** : Inria Serif italique, violet-700, `clamp(1.25rem, 2.4vw, 1.75rem)`, `-mt-1` (gap serré) — texte : *Avec passion et précision*
- **Body** : Inria Serif Light 300, `text-sm md:text-base`, max-w 48ch
- **CTAs** : `btn-primary btn-sm` ("Prendre rendez-vous" + flèche) + `btn-secondary btn-sm` ("Découvrir les prestations"), `flex-nowrap` → garantis sur une ligne
- **Info row** (desktop only) : adresse, horaires, étoiles Google — `flex gap-8 body-ui text-[13px] text-[var(--color-ink-500)]`
- **Bloc bas (CTAs + info)** : `mt-auto` pour aligner le bas avec le placeholder photo
- **Photo droite** (desktop only) : aspect 4/5, placeholder rose hachuré, badge violet "STUDIO CLOCHETTE" en haut-droit
- **Grid** : `lg:grid-cols-[1.5fr_1fr] items-stretch`, colonne gauche `flex flex-col`

### 2.3 Engagement
- Fond : `--color-bone/40` avec borders top/bottom `--color-line`
- Eyebrow + H2 centrés, max-w 36rem
- Grid 4 cols desktop / 2 cols mobile, gap 4-5
- Chaque card : pastille violet-100 (44 px, icône stroke 1.5) + H3 Cinzel + body Inria Serif Light
- Valeurs : Écoute · Hygiène stricte · Produits doux · Manucure russe
- Icônes Lucide : `sparkles`, `shield-check`, `heart-handshake`, `gem`
- Animation : reveal stagger 60 ms via IntersectionObserver

### 2.4 Prestations
- Header flex md:flex-row : eyebrow + H2 (gauche), lien "Voir tout le catalogue" → /prestations (droite)
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` gap 5-6
- 6 cards : Semi-permanent Reflet · Rallongement Couture · Beauté des mains · Nail-art Atelier · Remplissage · French Moderne
- Chaque card :
  - cover photo placeholder aspect 4/3 + badge optionnel (Signature rose / Premium gold / Sur mesure violet) absolute top-left
  - body : H3 Cinzel `text-lg` + description Inria `text-sm text-ink-500` + footer flex : durée (icône clock) + lien "Découvrir" + flèche
- **PAS DE PRIX** (politique salon Clochette)

### 2.5 Portfolio
- Fond : `--color-rose-50/50` + borders top/bottom
- Eyebrow + H2 centrés
- **Tabs** : 5 onglets (Tous · Naturels · Rallongements · Nail-art · Soins) avec underline animé violet-600 sur l'actif. Scrollable horizontalement en mobile, centré en desktop. Filtrage client-side instant (toggle `.is-visible`)
- Grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` gap 3-4
- 12 tiles aspect 1:1, photo placeholder + label
- Hover : `transform: scale(1.05)` 0.5s sur l'image interne + overlay sombre gradient bottom (opacity 0 → 1)

### 2.6 Témoignages
- Eyebrow + H2 + ligne note Google (4,9 / 5 sur 87 avis)
- **Mobile** : slider horizontal `overflow-x-auto snap-x snap-mandatory`, cards à 85 % de largeur
- **Desktop** : `grid grid-cols-3 gap-5`
- 3 cards :
  - icône `quote` violet-300, 5 étoiles dorées
  - **Citation** : Manrope (`--font-ui`) italic, `text-[0.9375rem] leading-relaxed`
  - footer : avatar rond violet-100 + initiale, nom (Manrope 500), statut (`Cliente fidèle · 2024` en `text-xs ink-500`)

### 2.7 Contact
- Eyebrow + H2 centrés
- **3 info cards** grid 3 cols : Adresse (lien Google Maps), Téléphone (`tel:`), Email (`mailto:`)
- Chaque card : pastille violet + icône + field-label + ligne principale Cinzel + ligne sous-titre Manrope
- **Form** centré max-w 640 px dans une card padded :
  - alerte info en haut : "Pour réserver un RDV, utilisez le bouton dédié →"
  - grid 2 cols (Prénom, Email) + textarea full-width
  - bouton `btn-primary` aligné droite

### 2.8 CTA final
- Fond : `--color-violet-100/55` + borders violet-100
- Eyebrow + H2 Cinzel UPPERCASE `clamp(1.375rem, 2.8vw, 2rem)` tracking +0.04em, sur une ligne (`whitespace-nowrap`)
- Démarcation 2 couleurs : encre par défaut + violet-700 sur "prendre rendez-vous"
- Body Inria Light max-w 44ch
- Bouton `btn-primary btn-lg`

### 2.9 Footer
- Grid `lg:grid-cols-12` :
  - col 4 : logo + brand + description (Inria Light)
  - col 2 : nav "Salon"
  - col 3 : contact (3 lignes avec icônes Lucide)
  - col 3 : newsletter (input + bouton)
- Bottom row : copyright + mentions + Instagram (Lucide icon)

---

## 3. Composants DS réutilisés

Tous extraits du design system v1 :

| Token / classe | Usage |
|---|---|
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.btn-lg`, `.btn-icon-only` | Tous les boutons |
| `.card`, `.card-hover`, `.card-padded` | Prestations, témoignages, contact |
| `.badge`, `.badge-rose`, `.badge-gold`, `.badge-violet`, `.badge-outline` | Badges prestations + hero |
| `.nav-link` | Nav header desktop |
| `.section-eyebrow` | Sur-titres de chaque section |
| `.field`, `.field-label`, `.field-help`, `.input`, `.textarea` | Form contact + newsletter |
| `--color-*` (violet, gold, rose, cream, bone, ink, line) | Palette complète |
| `--font-serif` (Cinzel) | H1-H4 |
| `--font-sans` (Inria Serif Light) | Body éditorial + italiques de titres |
| `--font-display` (Julius Sans One) | Eyebrows, labels, boutons |
| `--font-ui` (Manrope) | Citations témoignages, inputs, helper text, info rows |
| `--radius-sm/md/lg/pill` | Toutes les arrondies |
| `--shadow-xs/sm/md/lg/focus` | Toutes les ombres |

### Règle CSS héritée du DS

Cinzel n'ayant pas d'italique, la règle globale du DS bascule automatiquement tout `em` / `i` à l'intérieur d'un titre ou d'un `.font-serif` vers **Inria Serif italic** (sentence-case, letter-spacing remis à 0). C'est ce qui permet le contraste éditorial visible sur le hero (`LA MANUCURE` Cinzel + *Avec passion et précision* Inria italic).

---

## 4. Composants spécifiques à cette page

À créer dans `/src/components/landing/` :

| Composant | Type | Notes |
|---|---|---|
| `<SiteHeader />` | **Client** | Listener scroll pour la classe `.is-scrolled` + ouverture menu mobile |
| `<MobileMenu />` | **Client** | Drawer, Esc handler, fermeture au tap |
| `<MobileStickyCTA />` | **Client** | Apparition après 60 % viewport scroll |
| `<Hero />` | **Server** | Aucun JS, LCP-friendly |
| `<EngagementGrid />` | **Server** (avec sous-composant `<RevealOnScroll />` Client) | Cards statiques |
| `<ServiceCard />` | **Server** | Image Next.js + badges + lien |
| `<PortfolioGallery />` | **Client** | État local pour le filtre actif |
| `<TestimonialSlider />` | **Server** sur desktop, mais snap-x est CSS-only donc tout reste **Server** |
| `<ContactForm />` | **Client** | Form state, soumission, toast de confirmation |
| `<NewsletterForm />` | **Client** | Idem, dans le footer |
| `<RevealOnScroll />` | **Client** | Wrapper qui ajoute la classe `is-in` quand l'IntersectionObserver déclenche |

---

## 5. Données dynamiques

Centraliser dans `/src/data/landing.ts` (typés) pour faciliter la maintenance par la propriétaire du salon :

```ts
export const VALUES = [
  { icon: 'sparkles', title: 'Écoute', body: '…' },
  // …
];

export const SERVICES = [
  {
    slug: 'semi-permanent-reflet',
    name: 'Semi-permanent "Reflet"',
    description: '…',
    duration: '1 h 15',
    badge: 'signature' as const,
    image: '/services/semi-permanent.jpg',
  },
  // …
];

export const GALLERY = [
  { id: '01', src: '/portfolio/01.jpg', alt: 'French moderne nude', category: 'naturel' },
  // …
];

export const TESTIMONIALS = [
  {
    quote: 'Une parenthèse hors du temps…',
    rating: 5,
    name: 'Marie L.',
    status: 'Cliente fidèle · 2024',
  },
  // …
];

export const SALON = {
  name: 'Clochette Nails',
  address: '12 rue des Tilleuls, 79320 Moncoutant-sur-Sèvre',
  phone: '06 12 34 56 78',
  email: 'bonjour@clochette-nails.fr',
  hours: 'Mardi–Samedi · 9h–19h',
  rating: { value: 4.9, count: 87 },
};
```

Idéalement, branchez `GALLERY`, `SERVICES`, `TESTIMONIALS` sur un CMS headless (Sanity, Payload) plutôt que sur du dur — Chloé pourra publier elle-même.

---

## 6. Server / Client Components — recommandations Next.js

| Section | RSC ? | Raison |
|---|---|---|
| Hero | ✅ Server | Aucune interactivité, LCP-critical |
| Engagement | ✅ Server (+ `<RevealOnScroll />` Client par card) | |
| Prestations | ✅ Server | |
| Portfolio | ⚠️ Client (filtre instant) | Wrapper `'use client'`, mais tiles peuvent rester Server via `children` |
| Témoignages | ✅ Server | Snap-x mobile = CSS-only |
| Contact form | ⚠️ Client | useState + soumission |
| CTA final | ✅ Server | |
| Footer + Newsletter | mixed (newsletter = Client) | |
| Header | ⚠️ Client | scroll listener + menu |

**Pattern recommandé** : un `page.tsx` Server qui importe les sections, et chaque îlot Client uniquement là où il faut (`'use client'` en haut du fichier composant).

```tsx
// src/app/(marketing)/page.tsx — Server Component
import Hero from '@/components/landing/Hero';
import Engagement from '@/components/landing/Engagement';
// …

export const metadata: Metadata = {
  title: 'Clochette Nails · Prothésiste ongulaire à Moncoutant-sur-Sèvre',
  description: '…',
  openGraph: { /* … */ },
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="accueil">
        <Hero />
        <Engagement />
        <Services />
        <Portfolio />
        <Testimonials />
        <Contact />
        <FinalCTA />
      </main>
      <SiteFooter />
      <MobileStickyCTA />
    </>
  );
}
```

---

## 7. Responsive — breakpoints

| Breakpoint | Largeur | Comportement clé |
|---|---|---|
| `< 640px` | mobile | Header simplifié, hero single col, photo cachée, grid prestations 1 col, portfolio 2 cols, témoignages en slider snap, sticky CTA actif |
| `640-1024px` | tablette | Prestations 2 cols, engagement 2 cols, portfolio 3 cols, témoignages encore en slider |
| `≥ 1024px` (`lg`) | desktop | Tous les grids passent à leur layout final (4 cols engagement, 3 cols prestations & témoignages, 4 cols portfolio), photo hero visible, info row hero visible |

Page entièrement **mobile-first** : tester d'abord à 375 px (iPhone SE), 768 px, 1024 px, 1440 px.

---

## 8. Animations

| Trigger | Effet | Implémentation |
|---|---|---|
| Scroll > 8 px | Header backdrop blur + border | listener `scroll` + classe `.is-scrolled` |
| Scroll > 60 % viewport | Sticky CTA mobile slide-up | listener `scroll` + classe `.is-visible` |
| In-view (threshold 0.12) | Cards/headings fade-up + stagger 60 ms | `IntersectionObserver` + classe `.is-in` |
| Hover card | translateY(-3px) + shadow-md + border violet-100 | CSS transition 0.3s |
| Hover gallery tile | inner image scale(1.05) + overlay gradient bottom | CSS transition 0.5s |
| Hover button | translateY(-1px) + shadow-md | CSS transition 0.3s |
| Tab change | underline glisse | CSS transition 0.3s sur border-bottom |
| Menu mobile | translateX 100 % → 0 | CSS transition 0.4s cubic-bezier(.2,.7,.3,1) |

**Toutes les transitions utilisent la courbe `cubic-bezier(.2,.7,.3,1)`** (héritée du DS).
Aucune lib d'animation requise — tout est CSS + IntersectionObserver natif.

---

## 9. Accessibilité

- **Contrastes** : tous vérifiés au design system (ink-900 sur cream = 15:1 AAA, violet-700 sur cream = 7.2:1 AAA, ink-500 sur cream = 6.4:1 AA)
- **Focus visible** : tous les éléments interactifs (boutons, liens, inputs, tabs) ont un focus ring `0 0 0 4px rgba(136, 104, 176, 0.22)` via `:focus-visible`
- **Aria** : `aria-label` sur les icon-only buttons (burger, close, Instagram), `aria-current` à ajouter sur le lien actif de la nav, `role="tablist"` + `role="tab"` + `aria-selected` à ajouter sur les tabs Portfolio
- **Sémantique** : `<header>`, `<main>`, `<section>`, `<article>` (cards), `<footer>`, hiérarchie H1 → H2 → H3 respectée
- **Clavier** : tous les éléments interactifs sont natifs (`<a>`, `<button>`, `<input>`), Esc ferme le menu mobile
- **Reduced motion** : à ajouter avant prod
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    .reveal { opacity: 1; transform: none; }
  }
  ```
- **Alt** : tous les `next/image` doivent avoir un `alt` descriptif (pas vide sauf si purement décoratif). Les placeholders actuels sont à remplacer.

---

## 10. SEO

### Métadonnées Next

```tsx
export const metadata: Metadata = {
  title: 'Clochette Nails · Prothésiste ongulaire à Moncoutant-sur-Sèvre (79)',
  description: 'Studio de prothésie ongulaire à Moncoutant-sur-Sèvre. Manucure russe, pose semi-permanente et nail-art en cabine privée. Sur rendez-vous.',
  keywords: ['prothésiste ongulaire Moncoutant', 'manucure Deux-Sèvres', 'nail art 79', 'semi-permanent Moncoutant', 'manucure russe Bressuire'],
  openGraph: {
    title: 'Clochette Nails',
    description: '…',
    url: 'https://clochette-nails.fr',
    siteName: 'Clochette Nails',
    images: [{ url: '/og.jpg', width: 1200, height: 630 }],
    locale: 'fr_FR',
    type: 'website',
  },
  alternates: { canonical: 'https://clochette-nails.fr' },
};
```

### Structured data (JSON-LD)

Déjà présent dans le mock HTML — `BeautySalon` + `address` + `openingHoursSpecification` + `aggregateRating`. À enrichir avec :
- `priceRange: "€€"`
- `image: [...]` (au moins 3 photos en 1200×630)
- `geo: { latitude, longitude }`
- `sameAs: ["https://instagram.com/...", "https://www.google.com/maps/..."]`

### Sitemap & robots

- `app/sitemap.ts` : déclarer `/`, `/prestations`, `/portfolio`, `/contact`
- `app/robots.ts` : `Allow: /` partout, sitemap pointé sur `sitemap.xml`

### Local SEO

- Inscription Google Business Profile à jour (mêmes infos qu'ici)
- Schéma `LocalBusiness` cohérent avec GBP
- Citations sur PagesJaunes, Yelp, Treatwell si pertinent

---

## 11. Performance

### Images
- **Hero photo** : `<Image priority fetchPriority="high" quality={85} sizes="(max-width: 1024px) 100vw, 40vw" />`
- **Toutes les autres** : `loading="lazy"` (par défaut sur `next/image`), `quality={80}`, `sizes` adapté au breakpoint
- Format : AVIF + WebP fallback (géré automatiquement par `next/image`)
- Dimensions explicites pour éviter le CLS

### Fonts
- `next/font/google` avec `display: swap`
- Précharger uniquement les graisses utilisées : Cinzel 500, Julius Sans One 400, Inria Serif 300/300i, Manrope 400/500
- Subset latin uniquement (FR)

### JS
- Icônes Lucide : importer **uniquement** les icônes utilisées (`lucide-react`), pas la lib complète
- Pas de framework d'animation
- `IntersectionObserver` natif

### CSS
- Tailwind v4 purge automatique (tree-shake les classes non utilisées)
- Pas de CSS-in-JS runtime

### Cibles Lighthouse mesurées sur le mock
- LCP : < 2.0 s (hero rendu côté serveur, photo `priority`)
- FID / INP : < 100 ms (très peu de JS)
- CLS : < 0.05 (dimensions images fixes, fonts swap)
- TBT : < 100 ms

---

## 12. Checklist de mise en prod

- [ ] Remplacer tous les `<div class="photo-placeholder">` par `<Image>` Next.js
- [ ] Brancher les data sources (`/data/landing.ts` ou CMS)
- [ ] Form contact : action server `'use server'` + validation Zod + envoi via Resend/Postmark
- [ ] Newsletter : intégration Brevo / Mailchimp
- [ ] Lien "Prendre RDV" → page de réservation (Treatwell, Planity, ou solution interne)
- [ ] Google Business Profile vérifié
- [ ] OG image 1200×630 finalisée
- [ ] `prefers-reduced-motion` ajouté
- [ ] Tests d'accessibilité (axe-core, Lighthouse)
- [ ] Tests cross-browser (Safari iOS, Chrome Android, Firefox)
- [ ] Cache headers + ISR si CMS
- [ ] Analytics (Plausible recommandé pour RGPD)
- [ ] Cookie banner si analytics non-anonymes

---

**Fichier source** : `Landing.html` (mock HTML statique, 750+ lignes)
**Design system** : `Design System.html` (référence visuelle complète)
**Auteur** : Chloé (propriétaire Clochette Nails)
**Statut** : v1 livrée, prête à être portée vers `/src/app/(marketing)/page.tsx`
