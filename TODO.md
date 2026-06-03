# TODO — Clochette Nails v2

> **Source de vérité unique du backlog.** Dernière mise à jour : 2026-06-03.
> Convention : un item démarré → branche dédiée (`feat/*`, `fix/*`) ; un item livré → coché ici.
> Le contexte/raison de report des items Phase 2 est détaillé dans [`PHASE_2.md`](PHASE_2.md).
> L'intégration ERP (events sortants) est détaillée dans [`MANAGEMENT_API.md`](MANAGEMENT_API.md).

---

## ✅ Livré (MVP)

Tunnel réservation + acompte Stripe + webhooks (idempotence `StripeEvent`) · cartes cadeau (public + admin) · ebooks (vente, tokens, cap downloads) · blog (TipTap, SEO éditable) · newsletter (campagnes + tracking Resend) · contacts · calendrier · notifications · audit logs · paramètres · **Finances** (dashboard complet) · **Recherche globale** admin · **Webhooks viewer** · photos + **filigrane auto** (+ backfill) · **SEO infra** (sitemap, robots, JSON-LD, OG, manifest) · **RGPD** (cookie consent + structure pages légales) · **branding** (favicon/PWA/apple-icon/OG + logos lockup).

---

## 🔴 Pré-déploiement (bloquants avant mise en ligne)

- [x] **SEO catalogue prestations** — ✅ champs `metaTitle`/`metaDesc`/tags éditables en admin + **11 prestations publiées remplies** (titles 51-60, desc 138-152). JSON-LD `Service` (enrichi : Offer, ReserveAction, keywords) sur chaque fiche.
- [x] **Couverture JSON-LD** — ✅ `WebSite` sitewide, `BreadcrumbList` (prestation/blog/ebook), `Product` carte cadeau. Helper `src/lib/seo-jsonld.ts`. Fix marque en double dans les `<title>` (title.absolute). *(Avis : pas de Review schema first-party — consigne Google.)*
- [x] **reCAPTCHA V3** — ✅ sur les **4 formulaires publics** (contact, carte cadeau, réservation, ebook) : token client (script chargé paresseusement) + vérif serveur `verifyRecaptcha` (score ≥ 0.5) avant toute création. Badge masqué + mention légale sous chaque form. Skip gracieux si clés absentes (dev). **Reste à activer en prod** : créer le site reCAPTCHA v3 + renseigner `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` & `RECAPTCHA_SECRET_KEY`.
- [ ] **Pages légales** — 🟡 mentions légales + politique de confidentialité **complètes** ; CGV complètes **sauf 2 infos** (restent en `<LegalTodo>` dans `cgv/page.tsx`) : **assurance RC pro** (assureur + n° police) et **médiateur de la consommation** (nom + site + adresse). *Infos à fournir par Chloé — médiateur obligatoire B2C, cf. organismes référencés CECMC.*
- [ ] **Vérif domaine Resend** (`clochette-nails.fr`) — sinon les emails ne partent qu'à l'owner du compte.
- [x] **Tests E2E** (Playwright) — ✅ **14 tests verts** sur base de test dédiée `clochette_test` (schéma posé 1× à la main → pas de garde-fou Prisma, reset par TRUNCATE applicatif à chaque run), serveur `next dev` :3100 avec Stripe/Resend/reCAPTCHA off (booking auto-confirmé via fallback dev). Couvre : smoke pages publiques + **maintenance 503/noindex**, contact (happy+validation), **réservation** (funnel → `/succes` + `CONFIRMED`, validation), achat **ebook** (carte cadeau → `PAID`), **carte cadeau** (dégradation gracieuse sans Stripe), **admin** (login NextAuth + confirmation manuelle). Lancer : couper `pnpm dev` puis `pnpm test:e2e` (one-shot : `createdb` + `.env.test` + `pnpm test:e2e:init`). Cf. `docs/superpowers/specs|plans/2026-06-03-e2e-tests*.md`. Branche `test/e2e-suite`.

---

## 🎨 Qualité & design (avant mise en ligne)

- [x] **Embellir la landing + les autres pages** — ✅ système `<Reveal>` (scroll-reveal, prop `immediate` pour le 1er bloc sous une hero courte) + `.section-cta` (CTA climax) propagés : landing, prestations (liste + fiche), article de blog. Laissé volontairement sans reveal : listes blog/ebooks (grilles → hover-lift), fiche ebook + cartes-cadeau (pages d'achat/formulaire → ne pas masquer la conversion). Lighthouse prod **100/100/100 desktop + mobile** sur toutes les pages modifiées. Au passage : **fix a11y** menu mobile du header (`inert` quand fermé) → restaure mobile 100 site-wide.
- [x] **Lighthouse 100/100 desktop ET mobile** — ✅ a11y / Best Practices / SEO = **100** sur toutes les pages publiques (home, prestations liste+fiche, blog liste+fiche, ebooks liste+fiche, cartes cadeau, réservation*). Perf : Core Web Vitals parfaits (LCP 179ms, CLS 0). *Réservation = `noindex` volontaire (page conversion). Au passage : **bug prod CSP corrigé** (hydratation) + heading-order + a11y étoiles. Score perf chiffré final = à mesurer via PageSpeed Insights une fois en prod.

---

## 🔧 Correctifs & polish admin — ✅ FAIT (2026-06-01)

- [x] **Rename catégorie** — `POSE_NATURELS` → libellé affiché **« Pose sur ongles naturels »** partout (enum DB et badge marketing « Signature » inchangés).
- [x] **Retour vers liste filtrée** — étendu à prestations, options, **bookings, cartes-cadeau, ebooks, blog** (lien retour + bouton form). Préserve le filtre + la pagination (bookings) + la recherche (cartes-cadeau).
- [x] **Suppression des archivés** — prestations / options / articles : hard delete réservé aux ARCHIVÉS, refusé si réservations liées (gardes FK), nettoyage fichiers + audit log. Composant `<DeleteArchivedButton>`.
- [x] **Photos admin** — affiche publiées + brouillons (publiées d'abord, brouillons ensuite), archives exclues.

---

## 🔧 Correctifs UI / admin — ✅ FAIT (2026-06-02)

- [x] **Calendrier journée complète** — affichage 00h–24h (au lieu d'une fenêtre dynamique), scroll vertical interne ouvert par défaut sur **07h00** (vue semaine desktop + vue jour mobile).
- [x] **Fix calendrier iPad** — cards RDV désalignées (~15 min) + en-têtes sticky débordant sur la topbar : hauteur d'en-tête **mesurée** (fini le magic number) + `text-size-adjust:100%` (grossissement police iOS) + scroll différé (double rAF).
- [x] **Bouton « Retour » contextuel** — composant `<BackButton>` (`router.back()` + fallback) généralisé aux 7 fiches détail admin → revient à l'URL exacte d'origine (calendrier+semaine, liste+filtre, notifications…).
- [x] **Card d'indispo** — le motif wrappe au lieu de tronquer (`break-words` borné à la hauteur de la card).
- [x] **Fix a11y menu mobile header** — `inert` quand fermé (corrige aria-hidden-focus + arbre a11y) → Lighthouse **mobile 100 site-wide**.
- [x] **Fix lightbox portfolio/galeries** — `createPortal` vers `<body>` : la modale échappe au containing block des wrappers `<Reveal>` (`will-change: transform`) → plein écran correct.

---

## 🔧 Mode maintenance SEO — ✅ FAIT (2026-06-03)

- [x] **Mode maintenance = vrai HTTP 503 + `noindex`** — enforcement déplacé dans `proxy.ts` (runtime Node imposé par Next 16, lit `maintenanceMode` via Prisma + cache mémoire 10 s, fail-open). Routes publiques en maintenance → **503** + `Retry-After` + `X-Robots-Tag: noindex` + page autoportante (`src/lib/maintenance-page.ts`). `/admin` + assets (logo, robots.txt, sitemap.xml) restent servis. Effet de bord : root layout repassé synchrone (plus de `headers()`) → home redevenue **statique**. Lighthouse home **100/100/100** desktop+mobile, LCP 110 ms / CLS 0.

---

## 🚀 Déploiement

- [ ] **Setup VPS Hostinger** — Nginx vhost, PM2, DB Postgres, env vars, **4 crons** crontab, X-Accel-Redirect (PDFs ebooks).
- [ ] **Post-déploiement : migration médias** — fichiers `public/uploads/` (rsync) + lignes DB de contenu (Cas B). Cf. mémoire `project_prod_deployment_notes`. **NE PAS** relancer le backfill filigrane (déjà appliqué en local).

---

## 🟡 Post-MVP / Phase 2 (selon usage — détail dans `PHASE_2.md`)

- [ ] Newsletter **A/B testing** (≥ 300 abonnées/variante)
- [ ] Stripe **`charge.refunded`** (refunds faits hors admin)
- [ ] **Watermark PDF ebooks** (email cliente tamponné)
- [ ] **Tracking opens/clicks** des rappels RDV
- [ ] **Combo multi-prestations** natif (refacto `BookingService`)
- [ ] **Inspirations / album tendances** (résa)
- [ ] **Filtres avancés** réservation
- [ ] **Saison & suggestions** prestations (taxonomie tags)
- [ ] **Témoignages en DB** (actuellement hardcodés dans `testimonials-section.tsx`)
- [ ] **Monitoring / Sentry** (`error.tsx` « à wirer »)

---

## 🔗 Intégration ERP (futur — détail dans `MANAGEMENT_API.md`)

- [ ] **~28 events sortants** restants à émettre (`booking.cancelled/rescheduled/completed/no_show/expired/refunded/reminder`, cartes cadeau, ebooks, newsletter, contacts, photos, settings) — 2/30 émis aujourd'hui.
- [ ] **Worker ERP** qui dépile `OutboundEvent`.

---

## 🧹 Nettoyage

- [ ] Retirer le commentaire périmé « brancher Vercel Blob/R2 en prod » (`photos/layout.tsx`) — décision = **stockage local** (multi-instance).
