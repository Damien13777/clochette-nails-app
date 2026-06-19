# Édition admin d'un RDV (coordonnées + prestation) — Design

**Date :** 2026-06-19
**Statut :** validé (design approuvé par Damien, prêt pour le plan)

## Goal

Permettre à l'admin de **modifier un RDV en attente de paiement (`AWAITING_DEPOSIT`) ou
validé (`CONFIRMED`, pas encore honoré)** : corriger les **coordonnées** (faute de frappe) et
changer la **prestation + options**, le tout depuis un seul dialog « Modifier » sur la fiche RDV.

## Périmètre

- **Statuts éditables** : `AWAITING_DEPOSIT` + `CONFIRMED` uniquement. Refus sur `COMPLETED`,
  `NO_SHOW`, `CANCELLED_*`, `EXPIRED`.
- **Champs éditables** : `clientFirstName`, `clientLastName`, `clientEmail`, `clientPhone`,
  `clientMessage`, **serviceId**, **optionIds**.
- **Hors périmètre** : la date/heure (reste le bouton « Déplacer » existant). Le changement de
  prestation **conserve le même créneau** (`date` + `startTime` inchangés) et **recalcule
  `endTime`** selon la nouvelle `totalDurationMinutes`.

## Décisions (validées)

| Sujet | Décision |
|---|---|
| Chevauchement (nouvelle durée empiète sur un autre RDV) | **Avertir + l'admin force** : 1ᵉʳ appel `force=false` → si conflit, renvoie `OVERLAP` + détails ; le dialog affiche l'avertissement + « Appliquer quand même » → rappel `force=true`. |
| Email cliente | **Au choix** : case « Informer la cliente » **décochée par défaut**. Si cochée → renvoie un récap à jour (`booking-confirmation`) vers l'email (éventuellement corrigé). |
| RDV en attente + changement de prix | **MAJ du montant seulement**. L'ancien lien Stripe garde l'ancien montant → l'admin utilise « Renvoyer le lien » (existant) si besoin. Pas de régénération auto. |
| Un seul dialog | Coordonnées **et** prestation/options dans le même dialog « Modifier ». |

## Architecture

Réutilise massivement l'existant (`createBookingAdmin` pour le calcul prix/durée + overlap,
`RescheduleDialog` pour le pattern dialog+action, `computeAvailableSlots`/la requête de conflit).

- **Server action** `updateBookingDetails(bookingId, input)` dans `src/lib/actions/booking-admin.ts`.
  `input` inclut `force?: boolean` et `notifyClient?: boolean`. Pattern `ActionResult` étendu d'un
  `code` (`"OVERLAP"` notamment) pour piloter l'UI.
- **Dialog client** `EditBookingDialog` dans `src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx`
  (calqué sur `RescheduleDialog` / `MarkCompletedDialog`).
- **Fiche RDV** `bookings/[id]/page.tsx` : fetch des prestations + options PUBLISHED, passées en
  props à `BookingActions` → `EditBookingDialog`.
- **`BookingActions`** : bouton « Modifier » (variant secondary) dans les blocs `AWAITING_DEPOSIT`
  **et** `CONFIRMED`, ouvre le dialog.

## Logique de `updateBookingDetails`

1. `requireAdmin()`.
2. Validation **Zod** (mêmes règles que `createBookingAdmin` : `firstName/lastName` 1-50,
   `email` valide, `phone` regex FR, `message` ≤ 2000 ; `serviceId` non vide ; `optionIds[]`).
3. Fetch booking (`select` : status, date, startTime, clientEmail, pendingGiftCardAmountCents) →
   refus si `status ∉ {AWAITING_DEPOSIT, CONFIRMED}`.
4. Fetch `service` (PUBLISHED) + `options` (PUBLISHED, IN optionIds) → erreurs si introuvables.
5. Recalcule : `totalDurationMinutes`, `totalPriceCents`, `depositCents` (via `computeDepositCents`
   + settings), `endTime = startTime + totalDurationMinutes`.
6. **Overlap** : `prisma.booking.findFirst({ where: { date, id: { not: bookingId }, status: { in:
   ["AWAITING_DEPOSIT","CONFIRMED"] }, AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }] } })`.
   Si trouvé **et** `!force` → `{ ok:false, code:"OVERLAP", error: "Chevauchement avec le RDV de
   {prénom} {heure}…" }`.
7. **Transaction** : `booking.update` (coordonnées + serviceId + totalDurationMinutes +
   totalPriceCents + depositCents + endTime) ; **remplace les options** : `bookingOption.deleteMany({ bookingId })`
   puis `create` des nouvelles.
8. `audit(admin.id, bookingId, "booking.updated", { diff })`.
9. Si `notifyClient` → `buildBookingConfirmationEmail(...)` + `sendEmail` (tag `booking.updated`)
   vers le nouvel email. Fail-soft (un échec d'email ne bloque pas).
10. `revalidatePath("/admin", "layout")`. Retourne `{ ok:true, message }`.

## Points d'attention (gérés)

- **CONFIRMED déjà payé** : on met à jour le **snapshot** (prix/acompte) ; l'acompte déjà encaissé
  n'est ni re-débité ni remboursé → réconcilié au `markBookingCompleted` (flux existant via `revenueCents`).
- **AWAITING_DEPOSIT + prix changé** : `depositCents` mis à jour ; l'ancien lien Stripe (montant
  périmé) → bouton « Renvoyer le lien » (existant, `resendBookingPaymentLink`).
- **Carte cadeau en attente** (`pendingGiftCardAmountCents`) : snapshot conservé tel quel ; si le
  nouveau `depositCents` < montant GC en attente, l'admin reste maître (cas rare, non bloquant MVP).
- **Édition coordonnées seule** (prestation inchangée) : durée inchangée → pas de risque de
  chevauchement (l'overlap check ne trouvera rien, ou on le saute si `serviceId`+`optionIds` inchangés).

## UI (`EditBookingDialog`)

- Pré-rempli avec les valeurs courantes (coordonnées + prestation + options cochées).
- Sélecteur de **prestation** (liste PUBLISHED) + **options** (cases, filtrées par catégorie de la
  prestation — comme le formulaire de création).
- Affiche la **durée + le montant estimé recalculés** en live (réutilise le format prix).
- Case **« Informer la cliente par email »** (décochée par défaut).
- Soumission → `updateBookingDetails(force:false)`. Si `code:"OVERLAP"` → bandeau d'avertissement
  rouge + bouton **« Appliquer quand même »** → rappel `force:true`.
- Feedback succès/erreur via le pattern `runAction` existant de `BookingActions`.

## Tests (`test/booking-update.test.ts`)

Suite Vitest (DB de test, pattern `e2e/db` comme `gift-card-redeem.test.ts`) :
- Coordonnées mises à jour (sans changer la prestation).
- Changement de prestation → `totalDurationMinutes` / `totalPriceCents` / `endTime` recalculés.
- Garde statut : refus si `COMPLETED`.
- Chevauchement : crée un RDV adjacent, change la prestation pour une plus longue → `force=false`
  renvoie `OVERLAP`, `force=true` applique.
- Remplacement d'options (delete/recreate).

## Fichiers

- **Modifié** : `src/lib/actions/booking-admin.ts` (+ action `updateBookingDetails`).
- **Créé** : `src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx`.
- **Modifié** : `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx` (bouton + dialog).
- **Modifié** : `src/app/admin/(protected)/bookings/[id]/page.tsx` (fetch services+options → props).
- **Créé** : `test/booking-update.test.ts`.

## Hors scope (YAGNI)

- Changement de date/heure (déjà couvert par « Déplacer »).
- Refund/recharge automatique sur changement de prix (réconciliation manuelle au markCompleted).
- Régénération auto du lien de paiement.
