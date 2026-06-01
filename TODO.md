# TODO — Clochette Nails v2

> **Source de vérité unique du backlog.** Dernière mise à jour : 2026-06-01.
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
- [ ] **reCAPTCHA V3** — formulaires publics contact + carte cadeau (aujourd'hui simples TODO → exposés au spam).
- [ ] **Pages légales** — compléter les ~20 `<LegalTodo>` (CGV / mentions / confidentialité) : SIRET, forme juridique, code APE, adresse, dirigeante, assureur RC pro, médiateur conso, hébergeur. *Infos réelles requises (Chloé / Damien).*
- [ ] **Vérif domaine Resend** (`clochette-nails.fr`) — sinon les emails ne partent qu'à l'owner du compte.
- [ ] **Tests E2E** des parcours critiques (résa → acompte → confirmation).

---

## 🎨 Qualité & design (avant mise en ligne)

- [ ] **Embellir la landing + les autres pages** — itérer le design, en s'appuyant sur les plugins (chrome-devtools / playwright pour visualiser et tester le rendu).
- [x] **Lighthouse 100/100 desktop ET mobile** — ✅ a11y / Best Practices / SEO = **100** sur toutes les pages publiques (home, prestations liste+fiche, blog liste+fiche, ebooks liste+fiche, cartes cadeau, réservation*). Perf : Core Web Vitals parfaits (LCP 179ms, CLS 0). *Réservation = `noindex` volontaire (page conversion). Au passage : **bug prod CSP corrigé** (hydratation) + heading-order + a11y étoiles. Score perf chiffré final = à mesurer via PageSpeed Insights une fois en prod.

---

## 🔧 Correctifs & polish admin — ✅ FAIT (2026-06-01)

- [x] **Rename catégorie** — `POSE_NATURELS` → libellé affiché **« Pose sur ongles naturels »** partout (enum DB et badge marketing « Signature » inchangés).
- [x] **Retour vers liste filtrée** — étendu à prestations, options, **bookings, cartes-cadeau, ebooks, blog** (lien retour + bouton form). Préserve le filtre + la pagination (bookings) + la recherche (cartes-cadeau).
- [x] **Suppression des archivés** — prestations / options / articles : hard delete réservé aux ARCHIVÉS, refusé si réservations liées (gardes FK), nettoyage fichiers + audit log. Composant `<DeleteArchivedButton>`.
- [x] **Photos admin** — affiche publiées + brouillons (publiées d'abord, brouillons ensuite), archives exclues.

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
