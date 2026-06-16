# TODO — Clochette Nails v2

> **Source de vérité unique du backlog.** Dernière mise à jour : 2026-06-11.
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
- [ ] **Vérif domaine Resend** (`clochette-nails.fr`) — sinon les emails ne partent qu'à l'owner du compte. **Runbook complet : `docs/EMAIL-RESEND-GO-LIVE.md`** (compte créé, domaine à vérifier — faisable DÈS MAINTENANT car n'ajoute que des TXT/CNAME, ne touche pas l'enregistrement A → v1 intacte ; gotcha : fusionner le SPF existant, DMARC p=none). ✅ Boîte `contact@clochette-nails.fr` existe → **redirection vers `clochette.nails79@gmail.com`** (Chloé lit/répond depuis Gmail) ; on garde `@clochette-nails.fr` partout = zéro changement de code.
- [ ] **Contrôle « copies de conflit iCloud »** — `~/Documents` est synchronisé iCloud, qui crée des doublons `fichier 2.ext` dans les repos (incident du 10/06 : 16 fichiers nettoyés, merge `69c89ee`). Avant la mise en prod ET avant chaque commit important : vérifier `git ls-files | grep ' [0-9]\.'` (doit être vide) + `git status` propre avant tout `git add`. Garde-fou `.gitignore` (`* 2.*` etc.) en place. Option de fond si récidive : suffixe `.nosync` + symlink (refusée pour l'instant, à réévaluer).
- [x] **Tests E2E** (Playwright) — ✅ **14 tests verts** sur base de test dédiée `clochette_test` (schéma posé 1× à la main → pas de garde-fou Prisma, reset par TRUNCATE applicatif à chaque run), serveur `next dev` :3100 avec Stripe/Resend/reCAPTCHA off (booking auto-confirmé via fallback dev). Couvre : smoke pages publiques + **maintenance 503/noindex**, contact (happy+validation), **réservation** (funnel → `/succes` + `CONFIRMED`, validation), achat **ebook** (carte cadeau → `PAID`), **carte cadeau** (dégradation gracieuse sans Stripe), **admin** (login NextAuth + confirmation manuelle). Lancer : couper `pnpm dev` puis `pnpm test:e2e` (one-shot : `createdb` + `.env.test` + `pnpm test:e2e:init`). Cf. `docs/superpowers/specs|plans/2026-06-03-e2e-tests*.md`. Branche `test/e2e-suite`.

---

## 🎨 Qualité & design (avant mise en ligne)

- [ ] **Lint & types = gate de merge** — `pnpm lint` **vert** + `tsc --noEmit` 0 (OK aujourd'hui, 43 → 0 problèmes). À wirer en **CI** (+ futur Semgrep). Conventions posées : `_`-prefix = inutilisé volontaire (`no-unused-vars`), `e2e/` hors lint app, `eslint-disable` **justifiés** sur les advisories React Compiler (`set-state-in-effect`/`purity`/`immutability`) pour les patterns légitimes (mount/portal SSR, check localStorage, effets de fetch, re-sync props, comparaison à l'heure courante).
- [x] **Tests de correctness** (Vitest) — ✅ **14 tests verts**, 4 axes money/concurrence : redemption gift-card (idempotence rejeu + concurrence optimistic lock `version`), rejeu webhook Stripe (route signée offline → dédup `StripeEvent`), bornes dates **Paris/DST**, cap **5** + debounce 30 s ebook. Base `clochette_test`, exécution **série** (`fileParallelism:false`) + `truncateAll`. Lancer : `pnpm test`. Cf. `docs/superpowers/specs|plans/2026-06-04-correctness-tests*.md`. Branche `test/correctness-suite`.
- [x] **Factures PDF légales (toutes ventes)** — ✅ RDV honorés (case envoi opt-in dans la modale) + cartes cadeau (auto en ligne, opt-in vente salon, jamais si offerte) + ebooks (auto, PDF joint au mail d'achat). Numérotation séquentielle sans trou (`InvoiceCounter`, FAC/AV par année, testée sous concurrence), **avoirs** (plafonnés, auto sur refunds GC/ebook), liste **Finances → Factures** (filtres + recherche + renvoi + avoir), blocs Facturation sur les 3 fiches, route download admin, section **Facturation** des Paramètres (en-tête, EI/forme juridique libre, mention TVA éditable, mentions légales, logo uploadable PNG) — 100 % paramétrable, duplicable. Events `invoice.issued` → queue OutboundEvent. PDFs immuables sous `private/uploads/invoices/`. +9 tests Vitest. Cf. `docs/superpowers/specs|plans/2026-06-10-invoices-and-testimonials*.md`.
- [x] **Avis clientes (landing) gérés en admin** — ✅ table `Testimonial` + CRUD `/admin/parametres/avis` (ajout/édition/ordre/publication + ligne « avis Google » éditable), landing en lecture DB (section masquée si 0 avis publié), seed de reprise des 3 avis v1.
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

## 🚀 Déploiement — semaine du 15/06, bascule JEUDI 18/06 (planning confirmé 2026-06-11)

> La v1 PHP reste en prod jusqu'à la bascule (coupée jeudi seulement). La DB
> locale `clochette_dev` **EST la future prod** (contenu définitif + vrais
> RDV/avis/prestations déjà dedans). Checklist technique complémentaire (env,
> Nginx XFF/client_max_body_size/X-Accel, events webhook Stripe, email de test
> réel) : `docs/AUDIT-PRE-DEPLOIEMENT.md` § jour J.

**Phase 0 — d'ici lundi (sans VPS, seul le local est possible) :**
- [ ] (Damien) Passe appareils réels iPad/iPhone : funnel résa, modales admin, factures (cf. `docs/AUDIT-UI-UX.md` § checklist)
- [ ] (Damien) Paramètres → en-tête facture « CN manucure by Clochette Nails » → « CN Manucure »
- [ ] (Chloé) Infos CGV : assurance RC pro + médiateur → compléter les 2 `<LegalTodo>` (item Pré-déploiement)
- [ ] (Damien, 5 min, faisable dès maintenant) Créer la propriété GA4 → noter le `G-XXXX` pour l'env prod

**Phase A — setup VPS + staging (dès réception, ~lun-mar 15-16/06) — tout sauf le DNS :**
- [ ] Hardening : SSH par clés (password off), ufw, fail2ban, unattended-upgrades
- [ ] Postgres + tuning calibré (mémoire `project_postgres_tuning`) + DB + `DATABASE_URL` suffixée `?connection_limit=10&pool_timeout=30`
- [ ] Node 22+ / pnpm / PM2 (`ecosystem.config.js`) / Nginx : vhost staging (IP ou sous-domaine test), X-Accel-Redirect (PDFs ebooks), `client_max_body_size`, XFF dernier maillon
- [ ] **Déployer la v2 en staging avec l'env complète** → répétition générale, on dévermine tout AVANT jeudi
- [ ] **`deploy.sh`** écrit ET testé contre le staging (pull → install → build → `pm2 reload`)
- [ ] **4 crons** crontab + **heartbeats healthchecks.io** (plan free 20 checks ; suffixe `&& curl -fsS -m 10 --retry 3 https://hc-ping.com/<uuid>` sur chaque ligne → alerte email si un cron meurt en silence)
- [ ] **Backups** : `pg_dump` quotidien rétention 7 j + sync offsite + fichiers `public/uploads/` ET `private/uploads/` (factures — conservation légale 10 ans) + **test de restauration immédiat** (un backup non testé n'est pas un backup)
- [ ] **Sentry** : créer le compte avec l'email studioG4 + câbler le SDK (plugin déjà installé, `error.tsx` à wirer)
- [ ] Comptes/clés prod : **Stripe live** (compte EI Girard Chloé en cours de création — runbook complet pas-à-pas : `docs/STRIPE-GO-LIVE.md` ; 2 env vars requises `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, webhook LIVE = 3 events), **vérif domaine Resend** (cf. item Pré-déploiement + mémoire checklist), reCAPTCHA v3 prod, GA4

**Phase B — veille de bascule (mer 17/06) :**
- [ ] **Passe d'hygiène données AVEC Damien** : purger les résidus de recette (bookings/contacts/abonnées newsletter/cartes cadeau/factures de test), `InvoiceCounter` cohérent avec les factures restantes, `StripeEvent` (events mode test), `OutboundEvent` de test (⚠️ GARDER les events réels destinés à l'ERP)
- [ ] Contrôle copies iCloud (item Pré-déploiement) + working tree propre
- [ ] **Dry-run de la migration sur le staging** : `pg_dump` COMPLET de `clochette_dev` (PAS de migration table par table) + rsync `public/uploads/` ET `private/uploads/` (`booking-files/` seulement si des RDV réels ont des photos) → restore → vérif échantillon d'URLs publiques + liste des RDV à venir. **NE PAS** relancer le backfill filigrane (déjà appliqué en local)

**Phase C — bascule (jeu 18/06) :**
① état des lieux (v1 mutualisé, `clochette-nails.fr` **sans www** = host canonique conservé, cf. `docs/AUDIT-SEO.md`) ② **gel des modifs locales** (Chloé n'utilise plus l'admin local) → re-dump + re-rsync frais du matin (delta depuis le dry-run) → restore prod ③ env prod finale (`NEXT_PUBLIC_SITE_URL="https://clochette-nails.fr"`, `NEXT_PUBLIC_GA_TRACKING_ID`, …) ④ Nginx : vhost apex + 301 `www.`→apex + http→https ⑤ **DNS → VPS** (= coupure v1) ⑥ vérifs : 5 redirections 301 v1 (`curl -I /pages/cgv.html`), funnel complet avec un vrai paiement test, email réel reçu, webhook Stripe live ⑦ Search Console : propriété domaine + soumission sitemap + inspection des 4 anciennes URLs ⑧ **uptime monitoring** (UptimeRobot/Better Stack, free) ⑨ fenêtre de retour arrière (re-pointer le DNS vers v1) tant que la prod n'est pas validée

**Phase D — post-bascule (semaine suivante, sans urgence) :**
- [ ] PageSpeed Insights / Lighthouse sur la vraie prod (référence locale : 100/100/100)
- [ ] **Guide utilisatrice admin pour Chloé** — livrable duplicable produit (chaque future cliente le recevra rebrandé)
- [ ] **Registre des traitements RGPD** (art. 30) — one-pager : données traitées, finalités, rétentions (déjà codées), sous-traitants Stripe/Resend/Google/Hostinger
- [ ] Migration des repos vers `~/dev` (hors iCloud) une fois la prod stable
- [ ] (optionnel) Index uniques partiels factures via migration formelle (audit § P2 bonus) + overrides deps (audit § 9)

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
- [x] **Témoignages en DB** — ✅ livré (CRUD `/admin/parametres/avis`, cf. section Qualité & design)
- [x] **Monitoring / Sentry** — déplacé en Déploiement Phase A (compte studioG4 + câblage SDK)

---

## 🔗 Intégration ERP (futur — détail dans `MANAGEMENT_API.md`)

- [ ] **~28 events sortants** restants à émettre (`booking.cancelled/rescheduled/completed/no_show/expired/refunded/reminder`, cartes cadeau, ebooks, newsletter, contacts, photos, settings) — 2/30 émis aujourd'hui.
- [ ] **Worker ERP** qui dépile `OutboundEvent`.

---

## 🧹 Nettoyage

- [ ] Retirer le commentaire périmé « brancher Vercel Blob/R2 en prod » (`photos/layout.tsx`) — décision = **stockage local** (multi-instance).
