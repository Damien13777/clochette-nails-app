# Audit SEO pré-déploiement — Clochette Nails v2

**Date :** 2026-06-11 · **Base :** `main` @ `cbf9bcb` · **Périmètre :** préparation
technique et on-page + plan de migration v1→v2. *(Le SEO « vivant » — positions,
crawl réel, Search Console — ne se mesure qu'après mise en ligne.)*

---

## Synthèse

**État très sain.** L'infra SEO posée au fil du projet tient l'audit : metas
complètes partout, canonicals, JSON-LD riche, sitemap/robots dynamiques,
Lighthouse SEO 100 sur toutes les pages publiques. Les deux vrais sujets
étaient **la migration v1→v2** (jamais traitée) : choix du host canonique et
redirections 301 — tous deux réglés dans cet audit.

| # | Sév. | Sujet | Statut |
|---|------|-------|--------|
| 1 | 🔴 | **Host canonique** : v1 indexée sur `clochette-nails.fr` (apex), fallbacks v2 sur `www.` | ✅ décision : **apex** — action env + Nginx jour J (cf. §2) |
| 2 | 🔴 | **Aucune redirection v1→v2** : les 4 URLs légales `/pages/*.html` indexées → 404 après bascule | ✅ corrigé — `redirects()` next.config, 5 règles 301 |
| 3 | 🟡 | `/mentions-legales` absente du sitemap v2 | ✅ corrigé |
| 4 | 🟡 | Home sans canonical ni OpenGraph explicites | ✅ corrigé — `metadata` sur `page.tsx` |
| 5 | 🔵 | OG title/desc absents sur cartes-cadeau (page la plus partageable) | ✅ corrigé |
| 6 | 🔵 | OG explicites absents sur réservation/légales | Assumé — og:image globale présente, crawlers retombent sur `<title>` ; faible enjeu de partage |
| 7 | ℹ️ | `authors: "Chloé Girard"` (layout) vs « EI Gomes Chloé » (factures) | À confirmer par Damien : nom public vs nom légal — probablement voulu |

---

## 1. Inventaire v1 (source : sitemap.xml du site PHP en prod)

| URL v1 indexée | Devenir |
|---|---|
| `https://clochette-nails.fr/` | `/` (aucune redirection nécessaire) |
| `/pages/mentions-legales.html` | 301 → `/mentions-legales` |
| `/pages/politique-confidentialite.html` | 301 → `/confidentialite` |
| `/pages/cookies.html` | 301 → `/confidentialite` (le contenu cookies y est intégré — 8 mentions) |
| `/pages/cgv.html` | 301 → `/cgv` |

`/index.html` → `/` ajouté en défensif. Les fichiers utilitaires v1
(`send-email.php`, `admin-creneaux.html`…) étaient `Disallow` dans robots.txt
→ non indexés → 404 acceptable, aucune règle nécessaire.

**Implémentation** : `redirects()` dans `next.config.ts` (`permanent: true`) —
versionné avec l'app, indépendant de la conf Nginx, testable en local
(`curl -I localhost:3000/pages/cgv.html` → 308).

## 2. Host canonique — décision : `clochette-nails.fr` (apex)

La v1 est indexée **sans www** ; garder l'apex = zéro migration de host, le
jus SEO existant reste en place. Tout le code v2 suit `NEXT_PUBLIC_SITE_URL`
(metadataBase, sitemap, canonicals, JSON-LD) → **une seule variable pilote tout**.

**Actions jour J (reprises dans la checklist de déploiement) :**
1. `NEXT_PUBLIC_SITE_URL="https://clochette-nails.fr"` (PAS de www) dans l'env prod.
2. Nginx : vhost `www.clochette-nails.fr` → `return 301 https://clochette-nails.fr$request_uri;` + redirection http→https.
3. Search Console : propriété de domaine (couvre les deux hosts), soumettre
   `https://clochette-nails.fr/sitemap.xml`, puis « inspection d'URL » sur les
   4 anciennes pages légales pour accélérer la prise en compte des 301.
4. Les 27 fallbacks `www.` hardcodés dans le code restent sans effet tant que
   l'env est posée (finding #8 de l'audit du 10/06, nettoyage à la prochaine
   duplication du produit).

## 3. Couverture on-page v2 (vérifiée page par page)

- **Titles/descriptions** : présents sur 100 % des pages publiques ; template
  `%s · Clochette Nails` ; prestations avec metas rédigées (51-60 / 138-152
  chars, catalogue définitif re-validé le 10/06 au soir).
- **Canonicals** : présents partout (home ajoutée par cet audit).
- **OpenGraph** : `opengraph-image.png` + alt servie site-wide (convention de
  fichier Next) ; OG complet sur home, prestations[slug], blog, ebooks,
  cartes-cadeau.
- **JSON-LD** : `WebSite` + `LocalBusiness` (home), `Service` enrichi
  (Offer, ReserveAction) par prestation, `BreadcrumbList` (prestations, blog,
  ebooks, cartes-cadeau), `Product` (carte cadeau) — sérialisés via
  `safeJsonLd` (audit 10/06). Pas de Review schema first-party (consigne
  Google respectée).
- **Hn** : un seul `<h1>` rendu par page (les doublons détectés sont des
  branches conditionnelles de modules désactivés).
- **robots.ts** : public ouvert, admin/API/pages à token bloquées ;
  `noindex` sur les pages de conversion/token.
- **sitemap.ts** : statique + dynamique (prestations, blog, ebooks publiés),
  `/mentions-legales` ajoutée par cet audit.
- **Performance** : Lighthouse 100/100/100 + CWV parfaits (mesures du 06/06),
  home re-validée **statique** après le passage avis/hero en DB (build du 10/06).

## 4. Ce qui n'est PAS dans cet audit (post-déploiement)

- Soumission Search Console + suivi de la prise en compte des 301 (J+7 / J+30).
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (meta déjà branchée sur l'env).
- Suivi positions/CTR — impossible avant indexation de la v2.
- Stratégie contenu blog (éditorial, pas technique).
