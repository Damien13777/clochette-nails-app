# Landing v1 — Notes d'intégration Phase 1

Ce document liste les ajustements à apporter lors du portage de `Landing.html` vers `src/app/(marketing)/page.tsx` du projet Next.js 16. Le design rendu n'est PAS modifié dans le mock HTML : tout est à appliquer côté code Next.js pour rester fonctionnel et optimisé.

---

## 1. Versions / dépendances

| Source du handoff | Réalité projet |
|---|---|
| Next.js 14+ | **Next.js 16** (App Router) |
| `Prisma` non mentionné | Prisma 7 |
| `NextAuth` non mentionné | NextAuth v5 |
| Tailwind v4 | ✓ confirmé |

---

## 2. Refactos CSS lors du portage

### 2.1 Hero tagline — supprimer l'inline style redondant
[Landing.html:277](file:///Users/damiengcls/Documents/clochette-nails-V2-design/landing-v1/Landing.html#L277) contient un inline style qui duplique le comportement attendu :

```html
<!-- Mock HTML -->
<p class="font-serif italic ..." style="font-family: var(--font-sans); font-style: italic; font-weight: 400;">
  Avec passion et précision
</p>
```

L'inline style override la classe `font-serif`. Dans le composant Next.js, créer une classe dédiée OU utiliser un wrapper `<i>` qui déclenche la règle fallback CSS :

```tsx
// Option A — wrapper sémantique (préféré, marche avec la règle CSS du DS)
<h1 className="font-serif text-[clamp(2.27rem,5.5vw,3.63rem)] leading-[1.05]">
  LA MANUCURE
  <span className="block text-[clamp(1.25rem,2.4vw,1.75rem)] text-[var(--color-violet-700)]">
    <i>Avec passion et précision</i>
  </span>
</h1>

// Option B — classe utilitaire dédiée
.hero-tagline { font-family: var(--font-sans); font-style: italic; font-weight: 400; }
```

Recommandé : **Option A**, plus sémantique et la règle CSS du DS s'applique automatiquement.

### 2.2 Spacer header — utiliser scroll-padding au lieu d'un div vide
[Landing.html:261](file:///Users/damiengcls/Documents/clochette-nails-V2-design/landing-v1/Landing.html#L261) :

```html
<!-- Mock HTML : div vide pour compenser le header fixed -->
<div class="h-[68px]"></div>
```

Remplacer par du CSS dans `globals.css` :

```css
html { scroll-padding-top: 68px; }
main { padding-top: 68px; }
/* OU sur chaque section avec id : */
section[id] { scroll-margin-top: 80px; }
```

Plus propre sémantiquement (pas de div décoratif inutile) et meilleur pour l'a11y (pas d'élément vide annoncé aux lecteurs d'écran).

### 2.3 Style inline `--shadow-focus`
Vérifier dans le portage qu'aucun composant n'utilise de valeur hex en dur — tout doit passer par les variables CSS.

---

## 3. Routing & liens

### 3.1 "Prendre rendez-vous" → page Réservation
Dans `Landing.html` les CTA pointent vers `#contact` (form sur la même page). Dans le projet Next.js :

```tsx
// Header desktop CTA
<Link href="/reservation" className="btn btn-primary btn-sm">
  Prendre rendez-vous
</Link>

// Hero CTA
<Link href="/reservation" className="btn btn-primary btn-sm">
  Prendre rendez-vous
  <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
</Link>

// Mobile sticky CTA
<Link href="/reservation" ...>...</Link>
```

Le form `#contact` reste pour les questions générales (non-RDV) — il continue à pointer vers `#contact`.

### 3.2 "Voir tout le catalogue" → /prestations
```tsx
<Link href="/prestations" className="...">Voir tout le catalogue</Link>
```

### 3.3 Liens prestations dans cards
Chaque card de prestation doit pointer vers `/prestations/[slug]` :

```tsx
<Link href={`/prestations/${service.slug}`} className="...">
  <ServiceCard service={service} />
</Link>
```

---

## 4. Métadonnées Next.js (à compléter)

Le README handoff propose un bloc `metadata` basique. Enrichir avec :

```tsx
// src/app/(marketing)/page.tsx
export const metadata: Metadata = {
  title: 'Clochette Nails · Prothésiste ongulaire à Moncoutant-sur-Sèvre (79)',
  description: 'Studio de prothésie ongulaire à Moncoutant-sur-Sèvre. Manucure russe, pose semi-permanente et nail-art en cabine privée. Sur rendez-vous.',
  keywords: [
    'prothésiste ongulaire Moncoutant',
    'manucure Deux-Sèvres',
    'nail art 79',
    'semi-permanent Moncoutant',
    'manucure russe Bressuire',
  ],
  authors: [{ name: 'Chloé Girard' }],
  creator: 'Clochette Nails',
  publisher: 'Clochette Nails',
  formatDetection: { telephone: true, address: true, email: true },
  metadataBase: new URL('https://clochette-nails.fr'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Clochette Nails',
    description: '...',
    url: 'https://clochette-nails.fr',
    siteName: 'Clochette Nails',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Clochette Nails' }],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clochette Nails',
    description: '...',
    images: ['/og.jpg'],
  },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
};
```

---

## 5. JSON-LD à enrichir

Le JSON-LD actuel ([Landing.html:782](file:///Users/damiengcls/Documents/clochette-nails-V2-design/landing-v1/Landing.html#L782)) est minimaliste. Version complète à intégrer comme `<script type="application/ld+json">` dans `layout.tsx` ou `page.tsx` :

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["LocalBusiness", "BeautySalon", "NailSalon"],
      "@id": "https://clochette-nails.fr/#business",
      "name": "Clochette Nails",
      "description": "...",
      "url": "https://clochette-nails.fr",
      "image": [
        "https://clochette-nails.fr/og.jpg",
        "https://clochette-nails.fr/photos/hero-1.jpg",
        "https://clochette-nails.fr/photos/hero-2.jpg"
      ],
      "logo": "https://clochette-nails.fr/logo.png",
      "telephone": "+33-6-12-34-56-78",
      "email": "bonjour@clochette-nails.fr",
      "priceRange": "€€",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "12 rue des Tilleuls",
        "addressLocality": "Moncoutant-sur-Sèvre",
        "postalCode": "79320",
        "addressRegion": "Nouvelle-Aquitaine",
        "addressCountry": "FR"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 46.7314449,
        "longitude": -0.5865093
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          "opens": "09:00",
          "closes": "19:00"
        }
      ],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "87"
      },
      "sameAs": [
        "https://www.instagram.com/clochette_nails_79/",
        "https://www.facebook.com/clochette.nails"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://clochette-nails.fr/#website",
      "url": "https://clochette-nails.fr",
      "name": "Clochette Nails",
      "publisher": { "@id": "https://clochette-nails.fr/#business" },
      "inLanguage": "fr-FR"
    }
  ]
}
```

Toutes les valeurs (téléphone, adresse, géo, rating) doivent venir de `PlatformSettings` en DB et non hardcodées.

---

## 6. Performance — checklist

### Images
- [ ] Hero photo : `<Image priority fetchPriority="high" quality={85} sizes="(max-width: 1024px) 100vw, 40vw" />`
- [ ] Toutes les autres : `loading="lazy"`, `quality={80}`, `sizes` adapté
- [ ] Format AVIF + WebP géré automatiquement par `next/image`
- [ ] Dimensions explicites (width/height) pour éviter CLS
- [ ] Alt descriptif sur toutes (pas vide sauf décoratif pur)

### Fonts (next/font/google)
```tsx
// src/app/layout.tsx
import { Cinzel, Inria_Serif, Julius_Sans_One, Manrope } from 'next/font/google';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const inriaSerif = Inria_Serif({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
});

const juliusSansOne = Julius_Sans_One({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
});

// <html className={`${cinzel.variable} ${inriaSerif.variable} ${juliusSansOne.variable} ${manrope.variable}`}>
```

### Icônes Lucide
```tsx
// Import nominal — tree-shaking automatique
import { ArrowRight, MapPin, Clock, Sparkles } from 'lucide-react';
```
Jamais `import * as Icons from 'lucide-react'`.

### ISR
```tsx
// src/app/(marketing)/page.tsx
export const revalidate = 3600; // 1h — cache HTML statique, regen quand admin modifie
```

---

## 7. Données dynamiques — `src/data/landing.ts` OU base de données

Le README propose `/src/data/landing.ts` typé. Plusieurs choix possibles :

**Option A — Statique TypeScript** (Phase 1 démarrage, simple) :
```ts
// src/data/landing.ts
export const SERVICES = [...]; // hardcoded mais typé
export const TESTIMONIALS = [...];
```

**Option B — Depuis DB** (recommandé pour cohérence avec admin) :
```ts
// src/app/(marketing)/page.tsx
export default async function HomePage() {
  const [services, photos, testimonials, settings] = await Promise.all([
    prisma.service.findMany({ where: { status: 'PUBLISHED', featured: true }, take: 6 }),
    prisma.servicePhoto.findMany({ where: { featured: true }, take: 12 }),
    prisma.testimonial.findMany({ where: { displayed: true }, take: 3 }),
    prisma.platformSettings.findFirst(),
  ]);
  return <LandingPage data={{ services, photos, testimonials, settings }} />;
}
```

→ **Option B recommandée** — cohérent avec la promesse "Chloé peut tout gérer depuis l'admin". Implique d'ajouter une entité `Testimonial` au schema Prisma (non prévue initialement). À discuter en Phase 1.

---

## 8. Formulaire de contact

Le form `#contact` doit être un Server Action :

```tsx
// src/components/landing/ContactForm.tsx
'use client';
import { useFormState } from 'react-dom';
import { sendContactMessage } from '@/lib/actions/contact';

export default function ContactForm() {
  const [state, action] = useFormState(sendContactMessage, null);
  return (
    <form action={action}>...</form>
  );
}
```

```ts
// src/lib/actions/contact.ts
'use server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resend } from '@/lib/resend';

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  message: z.string().min(10).max(1000),
});

export async function sendContactMessage(_: unknown, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Veuillez vérifier vos informations.', code: 'VALIDATION_ERROR' };
  }
  // Rate limit + INSERT ContactMessage + Resend notif admin + outbound event
  return { success: true };
}
```

À couvrir : validation Zod, rate limit, anti-spam (honeypot + keyword filter), insertion DB, email admin via Resend, OutboundEvent `contact.message_received`.

---

## 9. Newsletter (footer)

Idem pattern Server Action :

```tsx
// src/lib/actions/newsletter.ts
export async function subscribeToNewsletter(email: string, source = 'footer') {
  // INSERT NewsletterSubscriber + email de confirmation (double opt-in) + outbound event
}
```

---

## 10. Accessibilité — compléments

- [ ] Ajouter `aria-current="page"` sur le lien actif de la nav
- [ ] Ajouter `role="tablist"` + `role="tab"` + `aria-selected` sur les tabs du portfolio
- [ ] Ajouter `aria-controls` pointant vers les panels
- [ ] Vérifier l'ordre de focus au clavier (tab + shift+tab)
- [ ] Ajouter `prefers-reduced-motion` :
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
    .reveal { opacity: 1; transform: none; }
  }
  ```
- [ ] Skip link "Aller au contenu" en haut de page (visible au focus)

---

## 11. OG image à créer

- Dimensions : 1200×630
- Contenu : logo Clochette + tagline + photo hero ou nail-art signature
- Format : JPG (poids < 100 KB) ou WebP (< 50 KB) si fallback géré
- Placement : `/public/og.jpg`

---

## 12. Découpage en composants — récap final

```
src/components/landing/
├── SiteHeader.tsx           ('use client' — scroll listener + state menu)
├── MobileMenu.tsx           ('use client' — drawer overlay + Esc)
├── MobileStickyCTA.tsx      ('use client' — visible après scroll 60%)
├── Hero.tsx                 (Server — LCP critical)
├── EngagementSection.tsx    (Server avec <RevealOnScroll> Client wrappers)
├── ServicesSection.tsx      (Server)
├── ServiceCard.tsx          (Server — réutilisable dans /prestations)
├── PortfolioGallery.tsx     ('use client' — filtrage tabs)
├── TestimonialsSection.tsx  (Server — snap-x CSS only)
├── ContactSection.tsx       (Server, contient <ContactForm />)
├── ContactForm.tsx          ('use client' — useFormState)
├── FinalCTA.tsx             (Server)
├── SiteFooter.tsx           (Server, contient <NewsletterForm />)
├── NewsletterForm.tsx       ('use client')
└── RevealOnScroll.tsx       ('use client' — IntersectionObserver wrapper)
```

Ratio cible : ~70% Server Components, ~30% îlots Client interactifs ciblés.

---

## 13. Tests prévus

À couvrir avant prod :
- [ ] Lighthouse desktop + mobile : 95-100 sur tous critères
- [ ] axe-core (a11y)
- [ ] Tests cross-browser : Safari iOS, Chrome Android, Firefox desktop
- [ ] Test du form contact (succès + erreur + spam)
- [ ] Test rendu sans JS (Server Components doivent rester lisibles)
- [ ] Test `prefers-reduced-motion`
- [ ] Test responsive 375 / 768 / 1024 / 1440

---

**Statut** : v1 mock validé, notes d'intégration prêtes pour Phase 1.
**Next** : passer à l'écran 2 (Page Réservation) avant scaffolding Next.js.
