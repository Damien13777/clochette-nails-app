# Correctness tests — Design

**Date :** 2026-06-04
**Statut :** validé (design approuvé, prêt pour le plan d'implémentation)

## Objectif

Couvrir par des tests automatisés les **4 invariants de correction money/concurrence**
identifiés à l'audit sécurité — ceux que la suite E2E (happy-paths Playwright) ne
déclenche pas et qui coûtent de l'argent en silence s'ils régressent :

1. **Redemption gift-card** — idempotence (rejeu) + optimistic locking (`version`) sous concurrence.
2. **Webhook Stripe rejoué** — un même `event.id` ne doit jamais être traité deux fois.
3. **Bornes de dates timezone Paris** — les helpers `paris-day.ts` doivent rester corrects aux transitions/edge DST.
4. **Cap de téléchargement ebook** — plafond à 5 + debounce 30 s (double-fetch navigateur).

## Contexte

- Le projet **n'a aucun runner unit/intégration** aujourd'hui (uniquement la suite E2E Playwright dans `e2e/`).
- Base de test **`clochette_test`** déjà provisionnée (réutilisée par l'E2E), schéma à jour
  (aucune modif `prisma/schema.prisma` dans ce lot).
- Infra de test réutilisable : `e2e/db.ts` exporte `db` (PrismaClient sur la base de test)
  + `truncateAll()` (TRUNCATE SQL brut, **pas** de garde anti-IA Prisma, rejouable). `e2e/env.ts` charge `.env.test`.
- Fonctions sous test (toutes déjà en place) :
  - `src/lib/gift-card-redeem.ts` → `applyGiftCardRedemption` (transaction + `version` + idempotence par redemption existante).
  - `src/app/api/webhooks/stripe/route.ts` → `POST` (vérif signature, dédup `StripeEvent`, gardes par ressource).
  - `src/lib/paris-day.ts` → fonctions pures `Intl`/`Europe/Paris`.
  - `src/lib/ebook-download-token.ts` → `resolveDownloadToken` (updateMany atomique cap + debounce via `lastDownloadAt`).

## Choix techniques (arbitrés)

- **Runner : Vitest** (devDependency dev-only — aucun impact build/runtime/prod ; les devDeps ne sont pas
  installées sur le VPS en `--prod`). Transform esbuild → rapide. Pas besoin de `@vitejs/plugin-react`
  ni `next/jest` : on teste des fonctions lib + DB + un route handler, pas de composants React.
- **Webhook : test au niveau route réelle, signature offline.** On POST un event signé via
  `stripe.webhooks.generateTestHeaderString({ payload, secret })` (crypto locale, **zéro appel réseau**)
  au handler `POST` importé directement. Couvre les 3 couches d'idempotence (dédup `StripeEvent`,
  garde par ressource, idempotence `applyGiftCardRedemption`).

## Architecture

```
vitest.config.ts          # env via .env.test, exécution série, include test/**
test/
  setup.ts                # réutilise e2e/db.ts ; beforeEach → truncateAll()
  paris-day.test.ts       # PUR (aucune DB)
  gift-card-redeem.test.ts   # DB
  ebook-download.test.ts     # DB
  stripe-webhook.test.ts     # DB + route signée
```

- **Réutilisation** : `import { db, truncateAll } from "../e2e/db"`. Même base `clochette_test`.
  Les deux suites partagent la base mais ne tournent **jamais simultanément** (`pnpm test` ≠ `pnpm test:e2e`).
- **Fixtures** : chaque test DB crée ses **données minimales** via de petites factories inline
  (le solde/état exact testé est visible dans le test), plutôt que le `seedBaseline` global de l'E2E.
- **Isolation** : Vitest en **single fork** + `fileParallelism: false` (série, une connexion logique) ;
  `beforeEach(truncateAll)`. Pas de `db push` (schéma déjà à jour).

## Scénarios par axe

### A. `paris-day.test.ts` (pur, sans DB)
- `startOfDayParisAsUtc(new Date("2025-07-15T22:30:00Z"))` → `2025-07-16T00:00:00Z` (été UTC+2 : on est déjà le 16 à Paris).
- `startOfDayParisAsUtc(new Date("2025-01-15T23:30:00Z"))` → `2025-01-16T00:00:00Z` (hiver UTC+1).
- `isoDateParis` sur ces deux dates → `"2025-07-16"` / `"2025-01-16"`.
- `mondayIsoForTodayParis()` → la date renvoyée est un **lundi** (property : `getUTCDay() === 1`).

### B. `gift-card-redeem.test.ts` (DB)
- **Idempotence (rejeu)** : carte `ACTIVE` 5000c → `applyGiftCardRedemption` ×2 avec les mêmes
  `(giftCardId, bookingId, type="BOOKING_DEPOSIT")`, montant 2000 → solde **3000** (débité une fois),
  **1** `GiftCardRedemption`.
- **Concurrence (optimistic lock)** : carte `ACTIVE` 5000c → **deux** `applyGiftCardRedemption`
  lancées en parallèle (`Promise.allSettled`), `bookingId` différents, 3000 chacune (6000 > 5000) →
  **exactement 1** réussit, **1** rejetée, solde **2000**, **1** redemption.
- **Solde insuffisant** : carte 1000c, redemption 2000 → throw `GiftCardRedemptionError("INSUFFICIENT")`,
  solde inchangé, 0 redemption.
- **Épuisement** : carte 2000c, redemption 2000 → statut `FULLY_USED`, solde 0.

### C. `ebook-download.test.ts` (DB)
- **Cap** : `EbookPurchase` `PAID`, `downloadCount=0` → 5 appels `resolveDownloadToken` espacés
  (on remet `lastDownloadAt` dans le passé avant chaque appel pour franchir le debounce) → `downloadCount=5` ;
  6ᵉ appel → `{ ok:false, reason:"EXHAUSTED" }`, compteur reste 5.
- **Debounce** : achat `PAID` `downloadCount=0` → 2 appels consécutifs (< 30 s, sans toucher `lastDownloadAt`) →
  compteur incrémenté **une seule fois** (= 1), les deux appels renvoient `ok:true`.
- **Token expiré** : `tokenExpiresAt` dans le passé → `reason:"EXPIRED"`, pas d'incrément.
- **Non payé** : `paymentStatus="PENDING"` → `reason:"NOT_PAID"`.

### D. `stripe-webhook.test.ts` (DB + route signée)
- **Setup** : `process.env.STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` factices (la signature
  `constructEvent` est de la crypto locale → aucun appel Stripe réseau). Booking `AWAITING_DEPOSIT` créé en DB.
- Construire un event `checkout.session.completed` (metadata `{ type:"booking", bookingId }`), le sérialiser,
  signer via `stripe.webhooks.generateTestHeaderString({ payload, secret })`, puis appeler
  `POST(new Request(url, { method:"POST", body: payload, headers:{ "stripe-signature": sig } }))`.
- **1er POST** → 200, booking `CONFIRMED`, **1** ligne `StripeEvent`.
- **2e POST (même `event.id`)** → 200 idempotent, booking toujours `CONFIRMED` (pas de re-traitement),
  toujours **1** `StripeEvent`.
- Effets de bord sûrs en test : `sendEmail` logge en console (pas de `RESEND_API_KEY`),
  `emitOutboundEvent` logge en console (pas de `MANAGEMENT_API_URL`), `notifyAdmin` no-op si aucun admin.

## Exécution / handoff

- Nouveau script `pnpm test` → `vitest run` (+ `pnpm test:watch` → `vitest`).
- DevDep à installer : `vitest`.
- **Pas de garde anti-IA Prisma** sur ce chemin (requêtes normales + `TRUNCATE` SQL brut, pas de `db push`)
  et base déjà créée → l'exécution peut être lancée directement (sandbox réseau désactivée pour le socket
  Postgres local) ; sinon handoff guidé comme l'E2E. Tranché au moment d'exécuter.
- Pré-requis identique à l'E2E : `clochette_test` accessible via `.env.test` (déjà le cas).

## Hors scope (YAGNI)

- Pas de tests UI/composants React (couverts par l'E2E).
- Pas de mock réseau Stripe (signature offline suffit).
- Pas de vérification du contenu des emails.
- Pas de couverture exhaustive des libs — **uniquement les 4 invariants money/concurrence**.

## Critères de succès

- `pnpm test` vert localement, déterministe (rejouable sans flakiness via `truncateAll` + série).
- Les 4 invariants démontrés ; un régression future sur l'un d'eux fait échouer le run.
- Aucun impact sur le build/bundle/prod (devDep), aucune modif du schéma Prisma.
