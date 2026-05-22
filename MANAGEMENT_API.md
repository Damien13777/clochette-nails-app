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

## Stack présumée (app Management)

L'app de gestion sera construite par les mêmes mains que Clochette (cf.
`CLAUDE.md`) → autant mutualiser la stack pour copier les patterns et garder
une cohérence de code entre les 2 repos.

- **Next.js 16** (App Router, Server Components, Server Actions)
- **Prisma 7** + Postgres (DB dédiée Management, séparée de celle de Clochette)
- **NextAuth v5** (admin Chloé + à terme : un compte par business agrégé,
  ou multi-tenant simple)
- **Resend** + templates email maison (alerts, digests hebdo, etc.)
- **Tailwind v4** + même design system (custom properties dans
  `@theme` de `globals.css`, polices `serif/display/ui`, classe `rich-content`)
- **TipTap** si on a besoin de WYSIWYG (notes business, etc.)
- **pnpm 11** + même hook `postinstall` pour Prisma

L'app Management a son **propre repo et son propre VPS** (ou même VPS séparé
des sites satellites). Pas de mono-repo — chaque satellite reste indépendant
et peut se déployer seul. Le couplage est strict : juste la queue de events
HTTPS via `MANAGEMENT_API_URL`.

→ Section "Réutilisation depuis Clochette" plus bas liste les helpers qu'on
peut copier-coller directement.

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

## Auth — HMAC signature

Headers de chaque request POST vers l'API Management :

```
x-cn-signature: t=<unix_timestamp>,v1=<base64_hmac>
x-cn-site-id: clochette-nails
content-type: application/json
```

Calcul de la signature :

```
signedPayload = `${timestamp}.${siteId}.${rawBody}`
signature = base64( HMAC_SHA256(MANAGEMENT_API_HMAC_SECRET, signedPayload) )
```

**Vérification côté receveur** (cf. section "Côté receveur" plus bas pour
l'implémentation) :
- Refuse si `timestamp` plus vieux que 5 min (anti-replay)
- Refuse si signature ne correspond pas
- Comparaison via `timingSafeEqual` (pas d'égalité string naïve)

Le secret `MANAGEMENT_API_HMAC_SECRET` est partagé entre Clochette et
Management, **distinct** pour chaque environnement (dev / prod). Le faire
rotate en cas de fuite suspectée.

---

## Côté receveur (app Management)

L'autre moitié de l'intégration : ce qu'on aura à coder dans le repo Management
quand on l'attaquera. Cette section est la **spec implementable** côté
réception.

### Endpoint

`POST /api/v1/incoming/clochette` (ou plus générique : `/api/v1/incoming/[siteId]`
pour préparer le multi-sites).

Body : JSON brut (cf. format "Format de payload" plus haut).

### Modèle Prisma `IncomingEvent`

Table principale pour stocker tous les events reçus. Sert à la fois de log,
de mécanisme d'idempotence, et de point de dispatch interne.

```prisma
model IncomingEvent {
  id          String   @id @default(cuid())
  // Idempotence : (siteId, eventId) doit être unique pour empêcher
  // de retraiter un event que Clochette aurait rejoué (retry naturel)
  siteId      String
  eventId     String   // = OutboundEvent.id de Clochette
  type        String   // ex: "booking.confirmed"
  version     String   // "v1"
  timestamp   DateTime // celui envoyé par Clochette
  payload     Json     // data complète
  signature   String   // pour audit / debug
  receivedAt  DateTime @default(now())

  // Dispatch interne
  processedAt DateTime?
  processError String? @db.Text

  @@unique([siteId, eventId])
  @@index([siteId, type, receivedAt(sort: Desc)])
  @@index([processedAt]) // pour scanner les non-traités
  @@map("incoming_events")
}
```

### Flow de réception

```
1. Vérifier headers : x-cn-site-id + x-cn-signature présents
2. Vérifier la signature HMAC (timingSafeEqual, fenêtre 5 min)
   → si KO : 401 Unauthorized
3. Parser le body JSON
4. Validation Zod du format (event, version, timestamp, siteId, data)
   → si KO : 400 Bad Request
5. Upsert IncomingEvent avec @@unique(siteId, eventId) :
   - Si existe déjà : 200 OK { idempotent: true } (Clochette ne rejouera pas)
   - Sinon : créer la row
6. Retourner 200 OK { received: true } AVANT de traiter
   (sinon timeout côté Clochette → retry inutile)
7. Dispatcher en async vers le handler interne (cf. plus bas)
```

**Important** : la réponse 2xx est envoyée **dès que la row est stockée**.
Le traitement métier (mise à jour des stats agrégées, alertes, etc.) se
fait après, en background. Si le traitement échoue, on log dans
`IncomingEvent.processError` et on peut rejouer manuellement depuis
l'admin Management. **Clochette ne doit pas savoir si Management a réussi
à traiter** — elle sait juste qu'elle a livré.

### Vérification HMAC (TypeScript)

Pattern copiable depuis Clochette (`src/app/api/webhooks/resend/route.ts`
implémente déjà Svix qui est très proche) :

```ts
function verifyCnSignature(
  headers: Headers,
  body: string,
  secret: string,
): boolean {
  const sigHeader = headers.get("x-cn-signature");
  const siteId = headers.get("x-cn-site-id");
  if (!sigHeader || !siteId) return false;

  // Parse "t=...,v1=..."
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const ts = parseInt(parts.t ?? "", 10);
  const sig = parts.v1;
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // 5 min

  const signedPayload = `${ts}.${siteId}.${body}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("base64");

  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

### Dispatch interne (handlers par type d'event)

Pattern conseillé : un objet `EVENT_HANDLERS` indexé par `event.type` qui
mappe vers une fonction `async (event) => void`. Le worker async (ou un
trigger DB Postgres) parcourt les rows `IncomingEvent` où `processedAt IS
NULL` et appelle le bon handler.

```ts
const EVENT_HANDLERS: Record<string, EventHandler> = {
  "booking.created": handleBookingCreated,
  "booking.confirmed": handleBookingConfirmed,
  // ... un par type d'event de Clochette
};
```

Chaque handler :
- Update les stats agrégées par site (table `SiteMetrics` à designer)
- Crée/update une vue dénormalisée si besoin (table `Booking` côté Management
  qui mirror celle de Clochette mais étendue avec multi-sites)
- Déclenche éventuellement une alerte (notification cloche, email digest)

### Multi-sites

Le `siteId` est tracé sur chaque `IncomingEvent`. L'app Management aura
naturellement une table `Site` (id, label, type, contact, etc.) et toutes
les vues agrégées (CA mensuel, RDV semaine, etc.) seront filtrables par
site. Quand on rajoutera un 2ᵉ business satellite, il suffira de :
- Créer une row `Site` dans Management
- Configurer `OUTBOUND_SITE_ID` + `MANAGEMENT_API_URL` + `MANAGEMENT_API_HMAC_SECRET` dans son `.env`
- Étendre `EVENT_HANDLERS` si le nouveau site émet des events que Clochette n'a pas

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

## Réutilisation depuis Clochette

Pour mutualiser le travail, voici les helpers/patterns de Clochette qu'on
peut **copier-coller directement** dans le repo Management (avec adaptations
mineures de nommage / d'imports).

### Fichiers à copier tels quels

| Fichier Clochette | Usage côté Management |
|---|---|
| `src/lib/sanitize-html.ts` | Sanitization DOMPurify si Management utilise aussi TipTap (notes business) |
| `src/lib/rate-limit.ts` | Anti-abuse sur l'endpoint `/api/v1/incoming/[siteId]` (au cas où) |
| `src/lib/email/send.ts` + `email/globals.ts` + `email/templates/layout.ts` | Système d'envoi unifié pour les alertes / digests Management |
| `src/components/admin/modal.tsx` | Modal réutilisable |
| `src/components/admin/admin-icon.tsx` | Icônes SVG inline (à étendre) |
| `src/components/admin/admin-shell.tsx` + `admin-topbar.tsx` + `admin-sidebar.tsx` | Layout admin entier — adapter la sidebar à la nav Management |
| `src/components/admin/notifications-bell.tsx` + `user-menu.tsx` | Système de notifications in-app + menu utilisateur |
| `src/components/admin/global-search.tsx` + `global-search-mobile.tsx` + `use-global-search.ts` | Recherche globale (adapter l'endpoint cible) |
| `src/auth.ts` + `src/proxy.ts` | NextAuth v5 setup + middleware admin |
| `src/app/globals.css` (section `@theme` + `rich-content` CSS) | Design tokens + rendering rich text |
| `prisma.config.ts` + `package.json` (scripts + postinstall) | Setup Prisma identique |
| `vercel.json` (vide) | Marqueur "déploiement VPS, pas Vercel" |
| `.gitignore` | Liste identique des exclusions |

### Patterns à reproduire (pas à copier mot pour mot)

| Pattern Clochette | Application Management |
|---|---|
| Server action `{ ok: true, ... } \| { ok: false, error, fieldErrors? }` | Standard pour toutes les actions admin Management |
| Audit log via table `AuditLog` + helper `audit(adminId, resourceId, action, metadata)` | Tracer toutes les actions admin Management (refunds manuels, ré-émissions, etc.) |
| `_tabs.tsx` pattern (sous-nav admin) | Réutiliser pour les sections multi-vues |
| `<ExpandableCard>` (KPI cards cliquables) | Pour les KPI dashboards Management |
| Pattern Prisma `revalidatePath('/admin/...')` après mutation | Idem dans Management |
| Pattern double-flag mobile/desktop pour les tables (cards mobile + table desktop) | Pour les tableaux longs côté Management |

### Données mirror

Côté Management, on aura potentiellement à **mirror** certaines entités de
Clochette pour les requêter rapidement sans réinterroger l'API :
- `Booking` (vue dénormalisée, alimentée par les `booking.*` events)
- `GiftCard` (idem)
- `EbookPurchase` (idem)
- `NewsletterSubscriber` + stats agrégées

**Source de vérité** = Clochette. Management = vue read-only mirror, mis à
jour par les events. Pas de bidirectionnel pour MVP (si Chloé modifie un RDV
dans Management, elle doit ouvrir l'admin Clochette — sauf si on construit
un flow inverse plus tard, mais c'est une autre brique).

---

## Maintenance de ce fichier

- À chaque ajout d'un `emitOutboundEvent(...)` dans le code Clochette, mettre
  à jour le tableau "Events à émettre" (passer 🚧 → ✅)
- À chaque changement de structure de payload, bump la version dans le
  payload + documenter la migration ici
- Côté Management : tenir à jour `EVENT_HANDLERS` en parallèle. Si un event
  est listé ici mais pas géré côté Management, ajouter un fallback handler
  qui log seulement (pour pas planter sur un type inconnu)
- Le `Stack présumée` peut être révisé : si on choisit autre chose qu'un
  Next.js / Prisma stack, mettre à jour cette section
