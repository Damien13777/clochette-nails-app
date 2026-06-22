# Tracking ouverture + bounce des rappels RDV — Design

**Date :** 2026-06-22
**Statut :** validé (design approuvé par Damien)

## Goal

Sur la fiche RDV admin, Chloé voit si la cliente a **ouvert** son rappel J-7 / J-1,
et si le rappel **n'est pas arrivé** (bounce). Aide opérationnelle (relancer par
téléphone si pas ouvert / pas reçu).

## Approche

Réutiliser l'infra de tracking Resend déjà en place (webhook `email.opened` reçu
et traité pour les newsletters via `NewsletterDelivery.resendMessageId`). On
stocke le `messageId` Resend du rappel à l'envoi, et le webhook pose un
`openedAt` / `bouncedAt` sur le `Booking` en matchant le `messageId`.

## Schéma (`Booking`) — 6 colonnes nullable (additif, non destructif)

```prisma
reminderJ7MessageId String?
reminderJ1MessageId String?
reminderJ7OpenedAt  DateTime?
reminderJ1OpenedAt  DateTime?
reminderJ7BouncedAt DateTime?
reminderJ1BouncedAt DateTime?
// + index pour le lookup webhook :
@@index([reminderJ7MessageId])
@@index([reminderJ1MessageId])
```

## Touchpoints

1. **Envoi** (`src/lib/actions/booking-reminders.ts`) : `sendEmail` retourne déjà
   `r.id` (= messageId Resend). On le stocke dans `reminderJ7MessageId` /
   `reminderJ1MessageId` à côté du `SentAt`.

2. **Helper testable** (`src/lib/reminder-email-events.ts`, **nouveau**) :
   `recordReminderEmailEvent(messageId, type: "opened" | "bounced", at): Promise<boolean>`.
   Trouve le `Booking` par `reminderJ7MessageId` OU `reminderJ1MessageId`.
   - `opened` → pose `reminderJ{7|1}OpenedAt = at` **si null** (1ʳᵉ ouverture, idempotent via `updateMany where openedAt: null`).
   - `bounced` → pose `reminderJ{7|1}BouncedAt = at` si null.
   - Retourne `true` si un booking a matché, sinon `false`.

3. **Webhook** (`src/app/api/webhooks/resend/route.ts`) : dans la branche
   `if (!delivery)` (pas une newsletter), si `event.type ∈ {email.opened,
   email.bounced}` → `recordReminderEmailEvent(...)`. Si `true` → `{ ok:true,
   reminder }`, sinon `{ ok:true, ignored:"not_tracked" }`.

4. **Affichage** (`src/app/admin/(protected)/bookings/[id]/booking-reminders.tsx`
   + `page.tsx`) : `ReminderRow` reçoit `openedAt` + `bouncedAt`. Sous « Envoyé le X » :
   - bounce prioritaire → « ⚠ N'est pas arrivé (rejeté le Y) » (danger),
   - sinon ouvert → « 👁 Ouvert le Y » (succès),
   - sinon envoyé non ouvert → « Pas encore ouvert » (discret).

## Tests (`test/reminder-email-events.test.ts`)

- Booking avec `reminderJ7MessageId` → `recordReminderEmailEvent(id, "opened")` pose `reminderJ7OpenedAt`, retourne `true`.
- 2ᵉ `opened` → `openedAt` inchangé (1ʳᵉ ouverture conservée).
- `bounced` → `reminderJ7BouncedAt` posé.
- messageId J-1 → cible bien `reminderJ1*`.
- messageId inconnu → retourne `false`, aucun booking touché.

## Points d'attention

- **Open-tracking imparfait** (pixel) : Apple Mail Privacy / proxy Gmail gonflent
  ou masquent les opens → « ouvert » = indicatif, « pas ouvert » ≠ « pas lu ». Le
  **bounce** est plus fiable pour « la cliente n'a pas reçu son rappel ».
- Suppose l'open-tracking **activé sur le domaine Resend** (newsletters l'utilisent
  déjà → oui ; à reconfirmer en prod via un open réel).
- **RGPD** : tracking d'ouverture d'un email transactionnel de service = intérêt
  légitime opérationnel → OK.
- **Déploiement** : colonnes nullable → `prisma db push` sur le VPS (additif, sans
  risque) avant `pnpm build` + restart.

## Hors scope (YAGNI)

- Clics sur les liens du rappel (pas demandé ; les rappels ont peu de liens d'action).
- Tracking sur les autres mails transactionnels (confirmation, facture…) — au besoin plus tard.
