# Audit pré-déploiement — Clochette Nails v2

**Date :** 2026-06-10 · **Base :** `main` @ `f812bdd` · **Auditeur :** Claude Code (lecture seule)

## Périmètre et méthode

Audit ciblé, complémentaire de l'audit sécurité du 2026-06-04 (XFF, crons,
auth, webhooks — corrigés et mergés). Trois axes :

- **A.** Revue sécurité + correctness du **module factures** (~8 700 lignes
  livrées le 10/06, jamais relues indépendamment) et des avis clientes.
- **B.** Passe **configuration production** (env vars, fail-modes, reverse
  proxy, CSP) — jamais faite, le projet ayant toujours tourné en local.
- **C.** Passes automatiques : vulnérabilités dépendances, secrets commités,
  debug/TODO résiduels, surfaces XSS.

**Hors périmètre (déjà couverts)** : booking/gift-cards/auth (audit 04/06),
Lighthouse (100/100/100 mesuré), architecture (validée + 25 Vitest + 14 E2E + CI).

---

## Synthèse

**Verdict : aucun P0. Le code est sain et déployable.** 1 P1 (garde-fou de
configuration, pas un bug), 1 P2 (course théorique à corriger avant le volume),
9 P3 (durcissements et hygiène). Les fondamentaux vérifiés sont solides :
aucun secret commité, auth admin sur 100 % des nouvelles surfaces, idempotence
webhook complète, numérotation fiscale atomique testée sous concurrence,
uploads re-encodés, PDFs hors webroot.

| # | Sév. | Sujet | Action |
|---|------|-------|--------|
| 1 | 🟠 P1 | Resend absent en prod → emails « mock » silencieusement réussis | Garde-fou + checklist |
| 2 | 🟡 P2 | Course double-facture possible (check-then-act sans contrainte DB) | Index unique partiel |
| 3 | 🔵 P3 | Motif d'avoir non plafonné en longueur | Cap 200 chars |
| 4 | 🔵 P3 | JSON-LD : `JSON.stringify` sans échappement `<` | `<` defense-in-depth |
| 5 | 🔵 P3 | `.env.example` : commentaire cron « X-Cron-Secret » ≠ code (Bearer) | Corriger le commentaire |
| 6 | 🔵 P3 | Header-comment périmé `password-reset.ts` (« TODO Resend » — c'est implémenté) | Nettoyer |
| 7 | 🔵 P3 | `INVOICES_DIR` absente de `.env.example` | Documenter (optionnelle) |
| 8 | 🔵 P3 | 27 fallbacks hardcodés `clochette-nails.fr` si `NEXT_PUBLIC_SITE_URL` absent | Exiger l'env en prod (duplicabilité) |
| 9 | 🔵 P3 | 6 vulnérabilités deps **modérées, toutes hors runtime prod** | Overrides optionnels |
| 10 | 🔵 P3 | Path traversal download : impossible aujourd'hui, pas de ceinture-bretelles | Valider `relPath` sous rootDir |
| 11 | 🔵 P3 | `[outbound]` logue le payload (email cliente) si `MANAGEMENT_API_URL` absent | Configurer l'URL en prod ou tronquer |

---

## A. Module factures + avis — détail

### ✅ Vérifié sain

- **Auth** : `requireAdmin()` sur les 3 actions invoice-admin, l'upload logo,
  la route download, toutes les actions testimonials. Aucune surface anonyme.
- **Idempotence webhook** : triple protection — signature Stripe vérifiée,
  dédup `StripeEvent` à l'entrée, guards par ressource (`status ACTIVE`,
  `paymentStatus PAID`) → un rejeu d'event ne re-génère **jamais** de facture.
  Si l'activation a réussi mais la facture a échoué (fail-soft), le rejeu ne
  la rattrape pas : c'est le bouton « Générer la facture » qui sert de filet
  (comportement documenté, accepté).
- **Numérotation fiscale** : compteur `upsert` natif (INSERT ON CONFLICT
  atomique Postgres) + rendu PDF + écriture fichier + row **dans une seule
  transaction** → tout échec rollback le compteur, zéro trou possible. Testé :
  20 créations concurrentes → 0001-0020 sans trou ni doublon.
- **Immutabilité** : aucune action de suppression/édition de facture (ni UI ni
  server action) ; corrections via avoirs plafonnés (`total − avoirs émis`,
  refus d'avoir sur avoir) ; `ADMIN_GIFT` exclu de la facturation.
- **Stockage** : `private/uploads/invoices/` hors webroot, gitignoré, servi
  uniquement via la route admin (`Cache-Control: private, no-store`).
- **Upload logo** : types contrôlés, cap 8 Mo, **re-encodage Sharp → PNG**
  (neutralise tout payload, y compris SVG malveillant rasterisé).
- **Injection** : libellés (titres prestations, motif avoir, noms clientes)
  rendus par react-pdf `<Text>` (texte brut) et React (échappé) — pas de
  vecteur HTML/JS. Montants validés entiers/bornés côté serveur.
- **Audit log** : émission manuelle, renvoi, avoir → tracés avec adminId.

### 🟡 P2 — Course « double facture » (finding #2)

`createInvoiceForBooking/GiftCard/Ebook` font *check-then-act* : lecture des
factures existantes puis création. Deux appels simultanés (ex. bouton
« Générer » cliqué pendant qu'un `markBookingCompleted` aboutit) peuvent créer
**deux factures ISSUED pour la même vente** — fenêtre de quelques dizaines de
ms, mais l'impact est comptable (deux numéros pour une vente, l'un à annuler
par avoir). **Reco** : index unique partiel Postgres par source, ex. :

```sql
CREATE UNIQUE INDEX invoices_one_per_booking
  ON invoices ("bookingId") WHERE "docType" = 'INVOICE' AND status = 'ISSUED';
-- idem giftCardId / ebookPurchaseId
```

(En Prisma 7 : migration SQL brute ou bloc `@@unique` impossible car partiel —
à poser au moment des migrations formelles prod.) La 2ᵉ insertion échouera en
P2002, déjà gérée par le retry/catch des callers fail-soft.

### 🔵 P3 — Durcissements (findings #3, #10)

- **Motif d'avoir** (`createCreditNoteAction`) : `reason` seulement trimé —
  plafonner à 200 chars (il finit dans le PDF et la DB).
- **Download** : `pdfPath` vient exclusivement de la DB (généré serveur) donc
  pas de traversal exploitable ; ajouter quand même un
  `path.resolve(...).startsWith(rootDir)` dans `readInvoicePdf` coûte 2 lignes.

---

## B. Configuration production

### 🟠 P1 — Resend absent = emails fantômes (finding #1)

`src/lib/email/client.ts` : sans `RESEND_API_KEY`, `sendEmail()` **simule un
succès** (mode mock dev) — volontaire en local, dangereux en prod : si la clé
manque ou saute au déploiement, confirmations de RDV, factures (marquées
`sentAt` !), rappels… partent dans le vide **sans aucune erreur visible**.
**Reco** : au choix (a) fail-fast au boot si `NODE_ENV === "production"` et
clé absente, ou (b) à minima `sendEmail` retourne `ok: false` en prod sans
clé. + Vérification explicite le jour J (email de test).

### ✅ Vérifié sain

- `.env.example` exhaustif et juste (y compris **`AUTH_TRUST_HOST="true"`** —
  le piège NextAuth-derrière-Nginx est déjà couvert ; `AUTH_SECRET` documenté).
  Seule `INVOICES_DIR` (optionnelle, tests) manque (#7).
- Crons : `Authorization: Bearer ${CRON_SECRET}` en comparaison timing-safe ✓
  (le commentaire `.env.example` dit encore « X-Cron-Secret », à corriger — #5).
- `RESEND_WEBHOOK_SECRET` : enforcement prod déjà en place (503 si absent) ✓.
- reCAPTCHA : skip en dev, **rejet** en prod sans clés (fail-closed) ✓.
- Maintenance : 503 + noindex via proxy.ts, fail-open, /admin préservé ✓
  (re-validé par l'E2E du 10/06).
- CSP : `unsafe-inline` script-src = compromis documenté et argumenté
  (hydratation Next sur pages statiques) ; XSS compensé par DOMPurify + React.

### Checklist jour J (à dérouler au déploiement)

1. **Env complètes** : `AUTH_SECRET` (openssl rand), `AUTH_TRUST_HOST=true`,
   Stripe **live** + `STRIPE_WEBHOOK_SECRET` du endpoint prod,
   `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (domaine vérifié — cf. mémoire
   checklist Resend) + `RESEND_WEBHOOK_SECRET`, reCAPTCHA prod,
   `CRON_SECRET` fort, **`NEXT_PUBLIC_SITE_URL` https** (27 fallbacks
   pointeraient sinon sur clochette-nails.fr — piège pour les futures
   instances dupliquées, #8), `MANAGEMENT_API_URL` vide tant que l'ERP
   n'existe pas (#11 : sans elle les payloads outbound, dont emails clientes,
   partent dans les logs PM2 — acceptable, à savoir).
2. **Nginx** : `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
   (exigence XFF de l'audit 04/06), `client_max_body_size 10m` (uploads),
   X-Accel-Redirect pour les PDFs ebooks.
3. **Crontab** : les 4 crons `curl -H "Authorization: Bearer $CRON_SECRET"`.
4. **Backups** : `pg_dump` quotidien **+ `private/uploads/`** (ebooks +
   factures — conservation légale 10 ans) + test de restauration mensuel.
5. **Stripe dashboard** : endpoint webhook prod → `/api/webhooks/stripe`,
   events `checkout.session.completed`, `charge.updated`,
   `payment_intent.payment_failed`.
6. **`pnpm build`** : ⚠️ jamais exécuté depuis le merge factures (la CI ne
   builde pas, l'E2E tourne en `next dev`). À lancer une fois avant le
   déploiement (dev server coupé) pour valider le prerender — notamment la
   landing passée en async DB.
7. **Email de test réel** post-déploiement (cf. P1).

---

## C. Passes automatiques

- **Secrets** : `git ls-files` → seul `.env.example` est tracké ✓. `.env.local`
  / `.env.test` / `private/` gitignorés ✓.
- **Dépendances** (`pnpm audit --prod`) : 6 modérées, **aucune dans le runtime
  de l'app** — `hono` ×3 + `@hono/node-server` arrivent via `@prisma/dev`
  (outillage dev embarqué dans le paquet `prisma`, jamais chargé par Next) ;
  `postcss` < 8.5.10 est build-time (Tailwind). **Reco** (#9, optionnel) :
  `pnpm.overrides` (`hono>=4.12.21`, `@hono/node-server>=1.19.13`,
  `postcss>=8.5.10`) ou attendre le prochain bump Prisma.
- **Debug/TODO** : aucun `console.log/debug` dans les composants client ✓ ;
  un seul commentaire périmé (`password-reset.ts` annonce « TODO Resend »
  alors que l'envoi est implémenté ligne 98 — #6).
- **XSS** : 9 fichiers avec `dangerouslySetInnerHTML` — 5 passent par
  DOMPurify (contenu riche admin), 4 sont des JSON-LD/`JSON.stringify` de
  données admin (#4 : ajouter `.replace(/</g, "\\u003c")` en ceinture-bretelles
  contre la rupture `</script>`).

---

## Actions recommandées

| Quand | Quoi |
|---|---|
| **Avant déploiement (code)** | #1 garde-fou Resend prod · #2 index uniques partiels (ou au moment des migrations prod) · #3/#4/#10 durcissements 2 lignes · #5/#6/#7 hygiène doc |
| **Jour J (config)** | Checklist section B (env, Nginx, crons, backups, Stripe, build, email test) |
| **Optionnel** | #9 overrides deps · #8 retirer les fallbacks URL hardcodés lors de la prochaine duplication du produit |
