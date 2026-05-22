# MANAGEMENT_API.md

Spécification de l'intégration future avec l'**app de gestion centrale** (le
"main point" du projet global) à laquelle Clochette Nails communiquera ses
events business.

> **État actuel** : infrastructure en place (table + helper + viewer admin),
> **2 events émis** sur ~30 prévus, **pas encore de worker** qui dépile la
> queue. Concrètement, la queue accumule des rows `PENDING` qui partiront le
> jour où on déploiera le worker.
>
> Ce fichier est la **source de vérité unique** pour cette intégration.
> Le `CLAUDE.md` ne fait que pointer ici.

---

## Vision

Clochette Nails est un **satellite** d'une app de gestion centrale (à
construire séparément) qui agrège plusieurs business / sites pour Chloé :
compta consolidée, CRM unifié, pilotage multi-établissements, analytics
cross-sites.

Clochette Nails doit donc **émettre des events business** dès qu'un changement
d'état métier se produit, pour que l'app de gestion puisse maintenir sa vue
agrégée. C'est un flow unidirectionnel : Clochette → Management. Pas de
poll, pas de webhook entrant côté Clochette (à part Stripe et Resend qui
sont déjà couverts).

**Pattern** : event-driven, queue persistante, livraison at-least-once avec
idempotence côté receveur.

---

## Architecture actuelle (en DB)

### Table `OutboundEvent`

Source : `prisma/schema.prisma`.

```prisma
model OutboundEvent {
  id            String              @id @default(cuid())
  type          String   // ex: "booking.confirmed", "ebook.purchased"
  payload       Json
  targetUrl     String
  targetService String              @default("management")
  status        OutboundEventStatus // PENDING / DELIVERED / FAILED / ABANDONED
  attempts      Int                 @default(0)
  maxAttempts   Int                 @default(5)
  nextAttemptAt DateTime            @default(now())
  lastError     String?             @db.Text
  createdAt     DateTime            @default(now())
  deliveredAt   DateTime?
}
```

### Helper d'émission

Fonction `emitOutboundEvent(type, payload)` — actuellement **dupliquée** dans
`lib/actions/booking.ts` et `app/api/webhooks/stripe/route.ts`. À DRY-er
lors de la finalisation dans `lib/outbound-events.ts`.

Comportement :
- Si `MANAGEMENT_API_URL` env var non set → log console (dev sans Management)
- Si set → row créée en `PENDING` dans la queue

### Viewer admin

Page `/admin/webhooks` onglet "Sortants" — voir la queue, status, retries,
forcer un re-dispatch via `retryOutboundEvent` ou `abandonOutboundEvent`.

---

## Events à émettre

État audité au moment de la rédaction de ce fichier. **Tenir à jour quand
on émet un nouvel event.**

Légende : ✅ émis aujourd'hui · 🚧 à ajouter

### Bookings (RDV)

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `booking.created` | ✅ | `lib/actions/booking.ts` | Création résa publique (status `AWAITING_DEPOSIT`) |
| `booking.confirmed` | ✅ | `lib/actions/booking.ts` + webhook Stripe | Acompte payé (Stripe ou 100% GC) |
| `booking.cancelled_by_client` | 🚧 | server action annulation cliente | Cliente annule via lien email |
| `booking.cancelled_by_admin` | 🚧 | server action admin | Admin annule (avec ou sans refund) |
| `booking.rescheduled` | 🚧 | server action déplacement | Cliente ou admin déplace |
| `booking.completed` | 🚧 | `markBookingCompleted` | Admin marque honoré + saisit revenue |
| `booking.no_show` | 🚧 | server action | Admin marque no-show |
| `booking.expired` | 🚧 | cron `expire-pending` | Acompte non payé après timeout |
| `booking.refunded` | 🚧 | `refundBookingFull` | Refund total (Stripe + reverse GC) |
| `booking.reminder_sent` | 🚧 | cron J-7/J-1 + action manuelle | Rappel envoyé (utile pour analytics) |

### Cartes cadeau

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `gift_card.purchased` | 🚧 | webhook Stripe (PUBLIC) + admin (ADMIN_SALE) | Carte vendue, status → ACTIVE |
| `gift_card.admin_gift_issued` | 🚧 | server action admin | Carte offerte (ADMIN_GIFT, hors CA) |
| `gift_card.redeemed` | 🚧 | `applyGiftCardRedemption` | Utilisée sur booking ou ebook (avec `type`: BOOKING_DEPOSIT / BOOKING_SERVICE / EBOOK) |
| `gift_card.reversed` | 🚧 | `reverseGiftCardRedemption` | Redemption inversée (refund booking) |
| `gift_card.depleted` | 🚧 | `applyGiftCardRedemption` quand solde → 0 | Carte épuisée |
| `gift_card.refunded` | 🚧 | server action refund GC | Refund de la vente initiale |
| `gift_card.expired` | 🚧 | cron expiration (à créer) | Date d'expiration dépassée |

### Ebooks

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `ebook.purchased` | 🚧 | webhook Stripe + action carte cadeau 100% | Achat confirmé, PDF livré |
| `ebook.downloaded` | 🚧 | endpoint `/api/v1/ebooks/download/[token]` | Cliente télécharge (utile pour analytics — opt-in via setting ?) |
| `ebook.refunded` | 🚧 | `refundEbookPurchase` | Refund + révocation accès |
| `ebook.reissued` | 🚧 | `reissueEbookDownload` | Admin réémet un nouveau lien (+1 DL) |

### Contacts

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `contact.received` | 🚧 | `lib/actions/contact.ts` (TODO annoncé) | Nouveau message via formulaire |

### Newsletter

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `newsletter.subscriber_added` | 🚧 | server action inscription | Inscription (status `PENDING`, double opt-in en cours) |
| `newsletter.subscriber_confirmed` | 🚧 | endpoint confirmation | Cliente clique le lien de confirmation |
| `newsletter.subscriber_unsubscribed` | 🚧 | endpoint desinscrire + webhook Resend (complained) | Désabonnement (manuel ou auto sur spam) |
| `newsletter.campaign_sent` | 🚧 | `executeCampaignSend` | Campagne envoyée (à l'issue du loop, avec stats agrégées) |
| `newsletter.campaign_failed` | 🚧 | `executeCampaignSend` | Échec total d'envoi (audience vide / Resend down) |

### Photos & médias

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `photo.uploaded` | 🚧 | server actions photo | Upload portfolio / cover / site media |
| `photo.deleted` | 🚧 | server actions photo | Suppression (utile pour sync media future) |

### Settings & catalogue

| Event | Status | Émis depuis | Quand |
|---|---|---|---|
| `platform_settings.updated` | 🚧 | `updatePlatformSettings` | Modif paramètres globaux (feature flags, deposit, etc.) |
| `email_globals.updated` | 🚧 | server action settings | Modif signature / banner / footer note |
| `service.created` | 🚧 | server actions prestations | Nouvelle prestation |
| `service.updated` | 🚧 | server actions prestations | Modif (prix, durée, etc.) |
| `service.archived` | 🚧 | server actions prestations | Soft delete |

---

## Format de payload

Structure unique pour tous les events :

```json
{
  "event": "booking.confirmed",
  "version": "v1",
  "timestamp": "2026-05-22T10:30:00.000Z",
  "siteId": "clochette-nails",
  "data": {
    "...": "champs spécifiques à l'event"
  }
}
```

- **`version`** : versioning sémantique. Si on change le schéma de `data`, on
  bump (`v2`) et on garde un mapping côté worker pour ne pas casser le
  Management.
- **`siteId`** : permet à l'app de gestion d'agréger plusieurs sites
  Clochette / autres business. Configuré via env var `OUTBOUND_SITE_ID`.
- **`data`** : payload métier. Pas de PII non nécessaire (pas d'IP, pas de
  password hash, etc.).

### Exemple `booking.confirmed`

```json
{
  "event": "booking.confirmed",
  "version": "v1",
  "timestamp": "2026-05-22T10:30:00.000Z",
  "siteId": "clochette-nails",
  "data": {
    "bookingId": "cmpbhtoxu0004lyyjkuf05bt2",
    "clientEmail": "marie@example.com",
    "clientFirstName": "Marie",
    "clientLastName": "Dupont",
    "date": "2026-06-15",
    "startTime": "14:30",
    "endTime": "16:00",
    "serviceSlug": "rallongement-mi-long",
    "serviceTitle": "Rallongement mi-long",
    "optionSlugs": ["nail-art-fleurs"],
    "depositCents": 1950,
    "stripePaymentId": "pi_3...",
    "stripeFeeCents": 48,
    "giftCardUsedCents": 1250,
    "giftCardPrefix": "PQ92",
    "paidVia": "stripe_with_gift_card",
    "confirmedAt": "2026-05-22T10:30:00.000Z"
  }
}
```

### Exemple `ebook.purchased`

```json
{
  "event": "ebook.purchased",
  "version": "v1",
  "timestamp": "2026-05-22T10:30:00.000Z",
  "siteId": "clochette-nails",
  "data": {
    "purchaseId": "cmpeip23p0000rhyjpbya4dnu",
    "ebookSlug": "le-guide-complet-de-la-prothesiste-ongulaire",
    "ebookTitle": "Le guide complet",
    "clientEmail": "marie@example.com",
    "clientName": "Marie Dupont",
    "amountCents": 1500,
    "stripeFeeCents": 35,
    "giftCardUsedCents": 0,
    "stripePaymentId": "pi_3...",
    "paidAt": "2026-05-22T10:30:00.000Z"
  }
}
```

---

## Auth

**À décider entre les 2 équipes** (Clochette + Management). 3 options :

### Option A — HMAC signature (recommandé MVP)

Header `x-cn-signature: t=<timestamp>,v1=<base64-hmac>` avec :
- `signedPayload = ${timestamp}.${body}`
- HMAC-SHA256 avec un secret partagé `MANAGEMENT_API_HMAC_SECRET`
- Le receveur vérifie la signature, refuse si tolérance > 5 min

**Pour** : simple, stateless, pas de credentials qui voyagent
**Contre** : si le secret fuit (logs, fuites repo), tout est compromis

### Option B — Bearer token

Header `Authorization: Bearer <token>`.
**Pour** : familier
**Contre** : le token voyage à chaque request

### Option C — mTLS

Auth via certificats clients.
**Pour** : très sécurisé, audit network-level
**Contre** : ops complexes côté VPS Hostinger + side de gestion

**Reco** : HMAC (Option A) pour MVP. Migration mTLS possible plus tard si besoin.

---

## Retry & backoff

Implémenté côté worker :

| Tentative | Délai depuis création |
|---|---|
| 1 | immédiat |
| 2 | +5 min |
| 3 | +15 min |
| 4 | +1 h |
| 5 (last) | +6 h |
| → status `ABANDONED` après échec de la 5ᵉ |

`nextAttemptAt` calculé à chaque échec. Le worker scanne
`WHERE status='PENDING' AND nextAttemptAt <= now()`.

Le worker dispatche **en parallèle (chunks de 10)** mais respecte l'ordre
chronologique global : on trie par `createdAt ASC` avant chaque batch.

---

## Worker — implémentation à venir

### Endpoint cron

`GET /api/v1/cron/dispatch-outbound-events` avec `Authorization: Bearer ${CRON_SECRET}`.

### Logique

```
1. Lock atomique : prend max 10 events PENDING avec nextAttemptAt <= now
   (via updateMany conditionnel ou SELECT FOR UPDATE + tx)
2. Pour chaque event :
   a. Construit le payload formaté (cf. section "Format")
   b. Signe via HMAC (Option A)
   c. POST sur event.targetUrl avec headers signature + content-type
   d. Si 2xx → status = DELIVERED, deliveredAt = now
   e. Si 4xx (non retryable) → status = ABANDONED, lastError = body
   f. Si 5xx ou timeout → attempts++, nextAttemptAt = now + backoff[attempts]
      Si attempts >= maxAttempts → ABANDONED
3. Retourne { processed, delivered, failed, abandoned }
```

### Schedule crontab VPS

Toutes les **2 minutes** (envoi proche du temps réel sans saturer) :

```cron
*/2 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://clochette-nails.fr/api/v1/cron/dispatch-outbound-events >> /var/log/clochette-cron.log 2>&1
```

À ajouter au memory file `project_prod_deployment_notes.md` au moment de
l'activation.

---

## Roadmap d'implémentation

### Étape 0 — Prérequis (côté Management)
- App de gestion existe avec une URL HTTPS accessible
- Endpoint POST qui accepte les events
- Génère un secret HMAC partagé
- Documente le format de retour (idempotence par `event` ?)

### Étape 1 — Centraliser le helper
Créer `lib/outbound-events.ts` avec `emitOutboundEvent(type, payload)` qui :
- Wrap le payload dans le format standard (version, timestamp, siteId, data)
- Insère la row dans `OutboundEvent`
- Si pas d'`MANAGEMENT_API_URL` → log + early return (pas de row créée)

Supprime les duplications dans `booking.ts` et le webhook Stripe.

### Étape 2 — Étendre l'émission
Ajouter `emitOutboundEvent(...)` à chaque endroit listé dans la section
"Events à émettre" (par domaine, dans l'ordre de priorité business).

### Étape 3 — Worker
Créer le cron `/api/v1/cron/dispatch-outbound-events` avec la logique
détaillée plus haut. Ajouter au memory deployment notes.

### Étape 4 — Auth
Implémenter la signature HMAC. Ajouter `MANAGEMENT_API_HMAC_SECRET` et
`OUTBOUND_SITE_ID` dans `.env.example`.

### Étape 5 — Backfill historique (optionnel)
Si l'app de gestion a besoin de l'historique pré-déploiement, faire un
endpoint admin qui ré-émet les events depuis les rows DB existantes
(bookings COMPLETED, GC PAID, ebooks PAID).

### Étape 6 — Observabilité
- Métriques sur le viewer admin : taux de DELIVERED vs FAILED vs ABANDONED
- Alerte (notification admin in-app) si > 10 events ABANDONED
- Page "Health" qui montre la latence moyenne de dispatch

---

## Env vars

À ajouter à `.env.example` quand on activera l'intégration :

```
# ── Intégration app de gestion (Management API) ──
# URL HTTPS de l'app de gestion qui reçoit les events outbound.
# Vide en dev → les events ne sont pas mis en queue, juste loggés.
MANAGEMENT_API_URL=""
# Secret HMAC partagé pour signer les payloads (cf. MANAGEMENT_API.md auth).
MANAGEMENT_API_HMAC_SECRET=""
# Identifiant du site émetteur, attaché à chaque event pour permettre
# à l'app de gestion d'agréger plusieurs sites.
OUTBOUND_SITE_ID="clochette-nails"
```

---

## Maintenance de ce fichier

- À chaque ajout d'un `emitOutboundEvent(...)` dans le code, mettre à jour le
  tableau "Events à émettre" (passer 🚧 → ✅)
- À chaque changement de structure de payload, bump la version dans le
  payload + documenter la migration ici
- Quand l'app de gestion existe et qu'on choisit définitivement l'auth :
  retirer les Options B/C de la section Auth et garder uniquement la retenue
