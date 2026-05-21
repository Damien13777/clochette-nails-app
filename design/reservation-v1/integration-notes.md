# Reservation v1 — Notes d'intégration Phase 1

Complément au handoff `reservation-README.md` avec les décisions d'architecture validées et les harmonisations à appliquer lors du portage.

---

## 1. Décisions d'architecture validées (différentes du handoff)

Le handoff README de Claude Design propose 3 ajouts d'infra qui ont été **rectifiés** lors de la validation. À utiliser ces choix lors du portage.

### 1.1 Notifications transactionnelles → Email uniquement (V1), SMS différé V2

| Sujet | Handoff README dit | **Décision validée** |
|---|---|---|
| Canaux notif post-booking | Email + SMS rappel J-1 | **Email Resend uniquement pour V1** |
| SMS | Twilio/provider externe activé | **Structure prête mais désactivée** |

**Implémentation V1** :
- `OutboundEvent.type = "booking.confirmed"` déclenche email Resend (template `booking.confirmation`)
- Pas d'appel SMS dans le code applicatif

**Structure SMS prête à activer (V2 ou vente multi-instance)** :
- Ajouter type `"booking.reminder_sms"` à l'enum `OutboundEvent.type` dès le départ
- Garder une colonne `PlatformSettings.smsEnabled: Boolean @default(false)`
- Ajouter un adapter pattern : `interface SmsProvider { send(to, body): Promise<Result> }`
  - Implémenter `NullSmsProvider` (no-op, log seulement) en V1
  - Pourra être remplacé par `TwilioSmsProvider` plus tard sans toucher au code métier
- **Use case** : si tu vends une instance du système à une autre cliente qui veut SMS, elle enable simplement `smsEnabled = true` + config Twilio en env → activation sans déploiement.

### 1.2 Slot-lock → Postgres status, pas de Redis

| Sujet | Handoff README dit | **Décision validée** |
|---|---|---|
| Mécanisme anti-race | Redis SETNX 90s TTL | **Postgres + status AWAITING_DEPOSIT + cron** |

**Implémentation** :
1. `POST /api/v1/bookings` ouvre une transaction Prisma
2. `SELECT FOR UPDATE` sur les Bookings actives pour le même `(date, startTime)` pour détecter overlap
3. INSERT Booking avec `status: AWAITING_DEPOSIT` — le créneau est "tenu" tant que cette row existe avec ce status
4. Si paiement Stripe success (webhook) → status passe à `CONFIRMED`
5. Si paiement échoue ou cliente abandonne → cron `expire-pending-bookings` (toutes les minutes) update les bookings `AWAITING_DEPOSIT > 30min` en `EXPIRED`, libérant le créneau

**Algorithme de calcul de disponibilité** (cf. design data Phase 0) :
- Filtre les bookings dont `status IN (AWAITING_DEPOSIT, CONFIRMED)` du jour D
- Si statut `EXPIRED` ou `CANCELLED_BY_*` → ignoré, créneau redevient libre

**Stripe expires_at** : configurer la Checkout Session à `expires_at: now + 30min` pour aligner avec le cron.

→ Aucune dépendance Redis. Si scale horizontal future, advisory locks Postgres ou migration vers Redis trivial via abstraction.

### 1.3 Rate-limit → In-memory, pas d'Upstash

| Sujet | Handoff README dit | **Décision validée** |
|---|---|---|
| Rate limit | Upstash Redis serverless | **In-memory `Map` (pattern Academy)** |

**Implémentation** :
- Reprendre `src/lib/rate-limit.ts` d'Academy (déjà éprouvé)
- `Map<string, { count: number; resetAt: number }>` avec safety cap 10k entrées
- Cleanup automatique sur expiration
- Appliquer aux endpoints :
  - `POST /api/v1/bookings` — 30 req/min/IP
  - `POST /api/v1/gift-cards/validate` — 10 req/min/IP
  - `POST /api/v1/upload` — 5 req/min/IP
  - `POST /api/v1/contact` — 5 req/min/IP

**Limites** :
- Reset au redémarrage du serveur (acceptable mono-instance)
- Pas de partage cross-instance (non pertinent — VPS unique)
- Migration vers Postgres ou Upstash trivial si scaling un jour

---

## 2. Harmonisations naming (corriger lors du portage)

Le handoff README utilise des termes qui diffèrent légèrement de notre schema Prisma validé. À aligner :

| Handoff README | **Schema Prisma canonique** | Action |
|---|---|---|
| `GiftCardLedger` | `GiftCardRedemption` | Renommer toute référence vers `GiftCardRedemption` |
| `Booking status (5 valeurs)` | `Booking status (7 valeurs)` : AWAITING_DEPOSIT, CONFIRMED, COMPLETED, **CANCELLED_BY_CLIENT**, **CANCELLED_BY_ADMIN**, NO_SHOW, **EXPIRED** | Utiliser les 7 statuts (CANCELLED scindé + EXPIRED pour cron) |
| Pas mentionné explicitement | `BookingFile` model | Créer la table pour stocker les URLs uploads avec métadata (mimeType, sizeBytes, originalName) |
| Pas mentionné explicitement | `OutboundEvent` model | Notre table pluggabilité vers Management — instancier à chaque event métier |

Aucun impact sur le mock HTML — c'est uniquement pour le code Phase 1.

---

## 3. Endpoints API — réception en code

Le handoff liste 7 endpoints. À implémenter dans cet ordre lors de Phase 1 :

| Priorité | Endpoint | Note |
|---|---|---|
| 1 | `GET /api/v1/services` | Cache 1h public, simple `findMany WHERE status=PUBLISHED` |
| 2 | `GET /api/v1/availability/months` | Cache 1h private, liste des BookableMonth ouverts |
| 3 | `GET /api/v1/availability/slots` | No-cache, algo de dispo dynamique (cf. data design Phase 0) |
| 4 | `POST /api/v1/gift-cards/validate` | Rate-limited, bcrypt.compare timing-safe |
| 5 | `POST /api/v1/upload` | Magic-byte validation, UUID filename, Sharp compression auto |
| 6 | `POST /api/v1/bookings` | Le gros endpoint : transaction Prisma + Stripe Checkout + OutboundEvent |
| 7 | `POST /api/webhooks/stripe` | Signature verif, idempotency via StripeEvent table, status transitions |

---

## 4. Server Actions vs Route Handlers

Le handoff propose une Server Action `createBookingAction` comme alternative à `POST /api/v1/bookings`. **Décision** :

→ **Garder Route Handler** (`POST /api/v1/bookings`) pour rester compatible avec :
- Le client web (Server Action ou fetch)
- Une future app mobile (consomme REST)
- Pluggabilité Management hub (consomme REST + OpenAPI)

La Server Action peut être un **wrapper léger** qui appelle l'endpoint interne, si on veut bénéficier du DX Next.js. Mais l'endpoint REST reste la source de vérité.

---

## 5. Stockage local des uploads

Le handoff mentionne `POST /api/v1/upload` mais ne détaille pas le stockage. Rappel de notre architecture validée Phase 0 :

```
public/uploads/
  ├── photos/       (photos prestations admin)
  ├── ebooks/       (PDFs, protégés via X-Accel-Redirect Nginx)
  └── booking-files/ (uploads form RDV, scannés par cron orphans)
```

**Pour la page Réservation** :
- Endpoint `POST /api/v1/upload` reçoit `type=booking-file`
- Validation : 5 fichiers max par booking, 5 MB chacun, mime image/jpeg|png|webp
- Magic-byte check (premier octets matchent le mime déclaré)
- Sharp auto-compression (resize cap 1920px, WebP qualité 82)
- UUID v4 filename, écrit dans `public/uploads/booking-files/{uuid}.webp`
- Retourne `{ id, url, mimeType, sizeBytes }` pour insertion dans `BookingFile` à la création de la Booking
- Lifecycle : si la Booking est `EXPIRED` ou `CANCELLED_*`, les fichiers restent jusqu'au cron cleanup (J+30 sur uploads orphelins non référencés en DB)

---

## 6. Données dynamiques — sources DB

Le handoff propose des données via API. Confirmé. Source DB pour chaque appel :

| Donnée | Source Prisma | Where clause |
|---|---|---|
| Services list | `prisma.service.findMany` | `status: 'PUBLISHED'`, order by `displayOrder` |
| Categories chips | dérivés du distinct `service.category` | aussi en enum Prisma `ServiceCategory` |
| Options list | `prisma.serviceOption.findMany` | `status: 'PUBLISHED'`, filtrer par `applicableCategories.has(serviceCategory)` |
| Bookable months | `prisma.bookableMonth.findMany` | `(year, month) >= currentMonth` |
| Available slots | computed (cf. algo data design Phase 0) | BusinessHours - Unavailability - RecurringUnavailability - Bookings active |
| Gift card validation | `prisma.giftCard.findFirst` puis `bcrypt.compare` | par prefix, comparaison timing-safe |

---

## 7. Métadonnées Next.js — robots & alternates

Le handoff propose `robots: { index: false }` (page conversion). Validé.

```ts
// app/reservation/page.tsx
export const metadata: Metadata = {
  title: "Réserver un rendez-vous · Clochette Nails",
  description: "Réservez votre prestation. Acompte sécurisé via Stripe.",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://clochette-nails.fr/reservation" },
};
```

Pas de JSON-LD ici (réservé à la Landing).

---

## 8. Tests E2E à prioriser (Phase 1)

Le handoff liste 6 tests E2E Playwright. À implémenter dans cet ordre :

1. **Happy path** — flow complet jusqu'à redirect Stripe (le plus important)
2. **Slot race** — deux clientes essaient le même créneau simultanément, une doit échouer proprement
3. **Form validation** — chaque champ rejeté avec message FR
4. **Gift card couvre** — flow alternatif sans Stripe
5. **Upload limites** — taille + type rejetés
6. **Mobile drawer** — bottom sticky + récap modal

---

## 9. Performance — checklist confirmée

- ✓ Page `dynamic = 'force-dynamic'` (pas d'ISR, data live)
- ✓ Fonts via `next/font/google` (Cinzel 400/500, Julius Sans One 400, Inria Serif 300/300i, Manrope 400/500/600)
- ✓ `FileUploader` et `BookingCalendar` lazy via `dynamic(...)` avec `ssr: false`
- ✓ Cache : `/availability/months` 1h private, `/services` 1h public, `/availability/slots` no-cache
- ✓ Images placeholders : à remplacer par `next/image` avec `sizes` correct

---

## 10. Sécurité — récap des couches

Couches appliquées sur `POST /api/v1/bookings` :

1. **reCAPTCHA v3** vérif côté server (score ≥ 0.5)
2. **Honeypot** rejet si champ caché rempli
3. **Rate limit** in-memory 30 req/min/IP
4. **Zod safeParse** avec `bookingSchema`
5. **CSRF** double-submit cookie (pas de NextAuth session ici, c'est anonyme)
6. **Slot-lock** via transaction Prisma + status AWAITING_DEPOSIT
7. **Magic-byte** vérif sur uploads liés
8. **Stripe signature** sur webhook callback
9. **OutboundEvent** retry queue pour notifs Management (idempotent côté Management)

---

## 11. Connexion vers Management — events émis

Lors de la création/transition d'une Booking, émettre les `OutboundEvent` suivants vers le hub Management :

| Trigger | Type event | Payload |
|---|---|---|
| Booking créée (AWAITING_DEPOSIT) | `booking.created` | `{ bookingId, serviceSlug, date, startTime, totalDurationMinutes, depositCents, clientEmail }` |
| Webhook Stripe → CONFIRMED | `booking.confirmed` | `{ bookingId, paidVia: "stripe" \| "gift_card" \| "mixed", depositCents }` |
| Carte cadeau utilisée pour acompte | `gift_card.redeemed` | `{ giftCardId, redemptionType: "BOOKING_DEPOSIT", amountUsedCents, remainingAmountCents }` |
| Booking EXPIRED (cron) | `booking.cancelled` | `{ bookingId, reason: "expired_no_payment" }` |

Ces events sont insérés dans la table `OutboundEvent` (status PENDING) et traités par un worker cron `process-outbound-events` (toutes les 60s) avec retry exponentiel.

---

**Statut** : décisions d'architecture validées, harmonisations notées, prêt pour Phase 1.

**Sources** :
- `Reservation.html` — mock visuel canonique
- `reservation-README.md` — handoff Claude Design (référence design)
- `integration-notes.md` — ce document (décisions techniques Phase 1)
