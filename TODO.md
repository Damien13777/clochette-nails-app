# TODO — Clochette Nails v2

> **Source de vérité unique du backlog.** Dernière mise à jour : 2026-06-22.
> Convention : item démarré → branche dédiée ; item livré → coché.
> Phase 2 détaillée dans [`PHASE_2.md`](PHASE_2.md). Intégration ERP dans [`MANAGEMENT_API.md`](MANAGEMENT_API.md).
> Détail historique des items livrés : git log + mémoires de session.

---

## ✅ Livré — site EN PROD depuis le 18/06/2026

`https://clochette-nails.fr` (VPS Hostinger + Cloudflare). Tunnel réservation + acompte Stripe + webhooks · cartes cadeau · ebooks · blog · newsletter (campagnes + tracking ouvertures/clics Resend) · contacts · calendrier · notifications · audit logs · paramètres · **Finances** · recherche globale · webhooks viewer · photos + filigrane · SEO infra (sitemap/robots/JSON-LD/OG) · RGPD (cookie consent + pages légales) · branding · **Factures PDF légales** (toutes ventes, avoirs, numérotation sans trou) · **Avis clientes en DB** · Lighthouse 100/100/100.

### Pré-déploiement & lancement — FAIT
- [x] SEO catalogue prestations + couverture JSON-LD
- [x] **reCAPTCHA v3** actif en prod sur les **5 forms** (contact/réservation/carte cadeau/ebook/newsletter)
- [x] **Resend** : domaine vérifié + sous-domaine de tracking `links` (opens/clics) configuré
- [x] Tests **E2E (Playwright)** + **correctness (Vitest)** + **CI GitHub Actions** (`.github/workflows/ci.yml`)
- [x] **VPS** : hardening (SSH clés, ufw, fail2ban, unattended-upgrades), Postgres tuné, Node/pnpm/PM2/Nginx (Cloudflare Origin, X-Accel PDFs), 4 crons + healthchecks.io, **backups pg_dump + test-restore**, **Sentry** (région UE + suspect commits)
- [x] **Stripe live** · **GA4** · **DNSSEC actif** (DS 2371 validé) · cutover DNS + 301 v1
- [x] Passe appareils réels iPad/iPhone · en-tête facture « CN Manucure » · hygiène données · PageSpeed prod
- [x] Repos migrés sous `~/dev` (hors iCloud) → risque « copies de conflit » mooté

---

## 🔴 Reste ouvert — à traiter

- [ ] **Pages légales CGV — 2 infos manquantes** (`<LegalTodo>` dans `cgv/page.tsx`) : **assurance RC pro** (assureur + n° de police) + **médiateur de la consommation** (nom + site + adresse). ⚠️ **Médiateur obligatoire en B2C** — infos à fournir par **Chloé**, intégration 5 min ensuite.
- [ ] **Guide utilisatrice admin pour Chloé** — livrable **duplicable produit** (chaque future cliente le recevra rebrandé).
- [ ] **Registre des traitements RGPD (art. 30)** — one-pager : données traitées, finalités, rétentions (déjà codées), sous-traitants (Stripe/Resend/Google/Hostinger).

---

## 🔗 Intégration ERP (détail dans `MANAGEMENT_API.md`)

- [x] **Phase A — émetteur** : ~27 events business émis (bookings, cartes cadeau, ebooks, facture, contact, newsletter, services) + helper consolidé. Déployé 22/06. Différés (YAGNI, pas de consommateur) : `photo.*`, `settings.*`, `ebook.downloaded`, `gift_card.expired`.
- [ ] **Phase B — l'app ERP** (nouveau repo) : récepteur `IncomingEvent` + vérif HMAC + dashboards (compta/CRM/pilotage). → brainstorm besoin avec Chloé en cours.
- [ ] **Phase C — connexion** : worker dispatch (cron) + `MANAGEMENT_API_URL` + backfill historique depuis les tables source.

---

## 🟡 Phase 2 (selon usage — détail dans `PHASE_2.md`)

- [x] **Tracking opens/clicks rappels RDV** — ✅ livré 22/06 (ouverture + bounce, affiché sur la fiche RDV)
- [ ] Newsletter **A/B testing** (≥ 300 abonnées/variante)
- [ ] Stripe **`charge.refunded`** (refunds faits hors admin)
- [ ] **Watermark PDF ebooks** (email cliente tamponné)
- [ ] **Combo multi-prestations** natif (refacto `BookingService`)
- [ ] **Inspirations / album tendances** (résa)
- [ ] **Filtres avancés** réservation
- [ ] **Saison & suggestions** prestations (taxonomie tags)
- [ ] **Ligne horaires du hero dérivée de `BusinessHours`** (remplacer le hardcodé par un formateur serveur, duplicable)
- [ ] (optionnel) Index uniques partiels factures via migration formelle

---

## 📣 Croissance / ops (hors code, avec Chloé)

- [ ] **Google Business Profile** : bouton « Prendre RDV », posts réguliers, kit de collecte d'avis (avec la tablette de Chloé).
