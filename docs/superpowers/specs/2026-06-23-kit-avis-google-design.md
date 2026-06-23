# Kit d'avis Google — Design

**Date :** 2026-06-23
**Statut :** Validé (brainstorming)

## Objectif

Permettre au salon de solliciter des avis Google auprès des clientes, pour faire
grimper la note et le nombre d'avis (levier SEO local + réputation, y compris
e-mail). Deux canaux : un **e-mail de demande après un RDV honoré** (opt-in) et un
**lien permanent sur la landing**. Source de vérité unique : un lien d'avis Google
configurable en admin.

## Décisions actées (brainstorming)

- **Déclenchement e-mail** : case opt-in dans la modale « Marquer honoré »,
  **cochée par défaut** (si le lien est configuré), **envoi immédiat**.
- **Garde-fou anti-relance** : pas de 2ᵉ demande à la même cliente (par e-mail)
  sous **120 jours**.
- **Présentiel** (QR code / script de vive voix) : **hors scope** pour ce lot.
- **Case cochée par défaut** : oui.

## Architecture

Un réglage `googleReviewUrl` (PlatformSettings) = **source de vérité**. L'e-mail, la
landing (et un futur QR) le lisent. Si vide → toutes les surfaces « avis Google »
sont masquées (dégradation propre, aucun envoi).

Aucune capture in-app de l'avis : la cliente est redirigée vers Google, et c'est
Google qui héberge l'avis. On enregistre seulement qu'on a **demandé**
(`reviewRequestSentAt`), jamais si l'avis a été laissé. À distinguer du système
`Testimonial` existant (avis du site, saisis manuellement par l'admin) : ce sont
deux surfaces séparées.

## Modèle de données (Prisma)

- `PlatformSettings.googleReviewUrl String?` — lien court d'avis Google
  (ex. `https://g.page/r/.../review`). Validé URL `https` côté action si renseigné.
- `Booking.reviewRequestSentAt DateTime?` — horodatage de la dernière demande
  d'avis envoyée pour ce RDV (garde-fou + traçabilité).

→ `pnpm db:push` + `pnpm db:generate` en dev ; migration formelle au déploiement.

## Composants

### 1. Réglage admin (`googleReviewUrl`)
- Champ « Lien d'avis Google » dans `/admin/parametres` (settings-form), près des
  réglages avis/landing.
- Aide affichée : « GBP → Demander des avis → copier le lien court ».
- Validation : optionnel ; si renseigné → URL `https` valide, sinon `fieldError`.

### 2. Template e-mail de demande d'avis
- Nouveau fichier `src/lib/email/templates/booking-review-request.ts` :
  - `buildBookingReviewRequestEmail({ clientFirstName, serviceTitle, reviewUrl }): { subject, html, text }`
  - Construit via `emailLayout` (branding cohérent). Ton chaleureux, court. **Un
    seul** CTA doré « ⭐ Laisser un avis sur Google » → `reviewUrl`. Partie `text`
    fournie. Tokens globaux (`{{signature}}`, …) appliqués par `sendEmail`.
  - Subject proposé : « Comment s'est passé votre rendez-vous ? 🌸 »
- Envoyé via `sendEmail({ to, subject, html, text, tag: "booking.review_request" })`.

### 3. Déclenchement dans `markBookingCompleted` (`src/lib/actions/booking-admin.ts`)
- `MarkCompletedInput` reçoit un champ `requestReview: boolean`.
- La modale « Marquer honoré » ajoute une case **« Demander un avis Google »**,
  à côté de la case facture :
  - Affichée + **cochée par défaut** uniquement si `googleReviewUrl` est configuré.
  - Sinon masquée, avec un indice « configure le lien d'avis dans Paramètres ».
- Dans l'action, **après** le passage en `COMPLETED` (best-effort, hors de la
  transaction critique de complétion) :
  - **Conditions d'envoi** : `requestReview` && `googleReviewUrl` défini &&
    `booking.clientEmail` présent && l'e-mail ne commence pas par `admin@` &&
    **aucune demande à ce `clientEmail` dans les 120 derniers jours**.
  - Garde-fou 120 j :
    `prisma.booking.findFirst({ where: { clientEmail, reviewRequestSentAt: { gte: <now - 120j> } } })`.
  - Si conditions OK → `sendEmail(...)`, puis `reviewRequestSentAt = now` sur le
    booking, puis `emitOutboundEvent("booking.review_requested", { bookingId, clientEmail })`.
  - Si garde-fou bloque → pas d'envoi ; le signaler dans le message de retour
    (« avis déjà demandé récemment, non renvoyé »).
  - Échec d'envoi Resend → loggé, ne **bloque jamais** la complétion.
- Le message de retour de l'action reflète l'état : « avis demandé » /
  « avis déjà demandé récemment » / (rien si non coché ou lien absent).

### 4. CTA landing
- Dans le composant landing qui affiche `testimonialsGoogleLine` (section avis),
  ajouter un bouton **« Laissez votre avis ⭐ »** → `googleReviewUrl`
  (`target="_blank"`, `rel="noopener noreferrer"`).
- Rendu **uniquement** si `googleReviewUrl` est défini. Style raccord (CTA
  secondaire, cohérent avec `.section-cta`).

### 5. Event sortant (cohérence ERP)
- `emitOutboundEvent("booking.review_requested", { bookingId, clientEmail })` à
  l'envoi effectif, comme les autres events business.

## Flux de données

Admin coche « demander un avis » + marque honoré → l'action complète le RDV →
(si conditions remplies) envoie l'e-mail + pose `reviewRequestSentAt` + émet
l'event. / La landing lit `googleReviewUrl` → rend le CTA. / Les Paramètres
éditent `googleReviewUrl`.

## Cas limites

- `googleReviewUrl` vide → case masquée, CTA landing masqué, aucun envoi.
- Cliente sans e-mail → pas d'envoi.
- E-mail `admin@…` (RDV de test) → skip.
- Déjà demandé < 120 j (même e-mail) → skip + message admin.
- Échec Resend → loggé, complétion non bloquée.

## Tests

- **Vitest** (`test/`) — mock `sendEmail` :
  - envoie quand opt-in + URL + e-mail + pas de demande récente → `reviewRequestSentAt` posé.
  - skip quand une demande existe < 120 j (même e-mail) → pas d'envoi.
  - skip quand URL absente / e-mail absent.
- **Recette manuelle** : configurer `googleReviewUrl` ; marquer un RDV de test
  honoré (case cochée) → e-mail reçu avec le bouton vers le lien ; vérifier le CTA
  sur la landing ; re-marquer un RDV de la même cliente sous 120 j → skip.

## Hors scope (acté)

- QR code / script présentiel (plus tard).
- Capture in-app de l'avis (tout se passe sur Google).
- Filtre/gating automatique (ne demander qu'aux clientes contentes) — interdit par
  Google ; la décision reste manuelle, au cas par cas, via la case opt-in.
