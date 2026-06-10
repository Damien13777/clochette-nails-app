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
configuration, pas un bug), 1 P2 (course théorique), 9 P3 (durcissements et
hygiène). Les fondamentaux vérifiés sont solides : aucun secret commité, auth
admin sur 100 % des nouvelles surfaces, idempotence webhook complète,
numérotation fiscale atomique testée sous concurrence, uploads re-encodés,
PDFs hors webroot.

**Mise à jour post-audit (même jour)** : findings #1-#7, #10, #11 **corrigés**
(commit sur cette branche, 27/27 tests verts dont 2 nouveaux tests de course,
`pnpm build` prod validé — home toujours statique ○). Restent #8/#9
(optionnels, assumés).

| # | Sév. | Sujet | Statut |
|---|------|-------|--------|
| 1 | 🟠 P1 | Resend absent en prod → emails « mock » silencieusement réussis | ✅ corrigé — `sendEmail` refuse en prod sans clé |
| 2 | 🟡 P2 | Course double-facture / sur-avoir (check-then-act sans contrainte DB) | ✅ corrigé — advisory lock + re-checks en tx, testé |
| 3 | 🔵 P3 | Motif d'avoir non plafonné en longueur | ✅ corrigé — cap 200 chars |
| 4 | 🔵 P3 | JSON-LD : `JSON.stringify` sans échappement `<` | ✅ corrigé — `safeJsonLd()` sur les 10 blocs (6 fichiers) |
| 5 | 🔵 P3 | `.env.example` : commentaire cron « X-Cron-Secret » ≠ code (Bearer) | ✅ corrigé |
| 6 | 🔵 P3 | Header-comment périmé `password-reset.ts` | ✅ corrigé |
| 7 | 🔵 P3 | `INVOICES_DIR` absente de `.env.example` | ✅ documentée |
| 8 | 🔵 P3 | 27 fallbacks hardcodés `clochette-nails.fr` si `NEXT_PUBLIC_SITE_URL` absent | Assumé — env exigée en checklist ; à nettoyer à la 1ʳᵉ duplication |
| 9 | 🔵 P3 | 6 vulnérabilités deps **modérées, toutes hors runtime prod** | Assumé — overrides optionnels ou prochain bump Prisma |
| 10 | 🔵 P3 | Path traversal download : pas de ceinture-bretelles | ✅ corrigé — `relPath` validé sous rootDir |
| 11 | 🔵 P3 | `[outbound]` logue le payload (PII) si `MANAGEMENT_API_URL` absent | ✅ corrigé — payload omis en prod |

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

### 🟡 P2 — Course « double facture » (finding #2) — ✅ CORRIGÉ

`createInvoiceForBooking/GiftCard/Ebook` faisaient *check-then-act* : deux
appels simultanés pouvaient créer deux factures ISSUED pour la même vente
(idem deux avoirs concurrents dépassant le plafond).

**Correctif appliqué** : `pg_advisory_xact_lock` (verrou transactionnel
Postgres, clé = source de la vente ou facture parente) pris en tête de la
transaction `createInvoice`, suivi d'une **re-vérification autoritaire sous
verrou** (facture existante / plafond d'avoir recalculé). Le 2ᵉ appel
concurrent attend le commit du 1ᵉʳ puis échoue proprement en `InvoiceError`.
Choisi plutôt que l'index unique partiel car compatible avec le workflow
`db push` du dev (un index hors schéma serait effacé à chaque push). Couvert
par 2 tests de concurrence (`Promise.allSettled` ×2 → exactement 1 succès).

**Bonus migrations prod** (ceinture-bretelles, optionnel) : poser en plus les
index uniques partiels au moment des migrations formelles :

```sql
CREATE UNIQUE INDEX invoices_one_per_booking
  ON invoices ("bookingId") WHERE "docType" = 'INVOICE' AND status = 'ISSUED';
-- idem giftCardId / ebookPurchaseId
```

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
| ~~Avant déploiement (code)~~ | ✅ **Tout corrigé le 10/06** : #1 garde Resend · #2 advisory lock + tests · #3/#4/#10/#11 durcissements · #5/#6/#7 hygiène. `pnpm build` prod validé (home statique ○ conservée ; 1 warning NFT bénin lié aux `path.join` des uploads — sans impact PM2/`next start`) |
| **Jour J (config)** | Checklist section B (env, Nginx, crons, backups, Stripe, email test réel) |
| **Optionnel** | #9 overrides deps (ou prochain bump Prisma) · #8 retirer les fallbacks URL hardcodés lors de la prochaine duplication du produit · index uniques partiels aux migrations prod (bonus du #2) |
