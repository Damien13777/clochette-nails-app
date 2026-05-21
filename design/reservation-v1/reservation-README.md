# Réservation — Handoff dev (v1)

> Page `/reservation` · Clochette Nails · Référence : `Design System.html` (v1.1) + `Reservation.html` (mock validé)
> Cible : Next.js 16 App Router · Prisma 7 · NextAuth v5 · Tailwind v4

---

## 1. Overview

| | |
|---|---|
| **Objectif business** | Convertir une visiteuse intéressée en cliente avec acompte payé (CA garanti, no-show réduit). |
| **Cible** | Femmes 25-55, mobile-first (~70 % du trafic), niveau confort numérique moyen. |
| **Route** | `app/reservation/page.tsx` — à la racine (hors group `(marketing)` pour permettre un layout dédié sans header marketing complet). |
| **Stack styles** | Tailwind v4 (`@theme` tokens) + variables CSS héritées de `Design System.html`. |
| **Ratio Server/Client** | Page shell + sections statiques en **RSC** ; tout le flow stepper en **Client Component** unique (`<ReservationFlow />`) sous un `<Suspense>` côté page. Endpoints d'availability appelés depuis le Client via SWR. |
| **Lighthouse cible (mobile)** | Performance ≥ 88 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO non prioritaire (noindex). |

---

## 2. Déviations du Design System

**Aucune déviation — DS v1.1 strictement respecté.**

Notes d'application :
- Quatuor typographique : Cinzel (titres UPPERCASE), Julius Sans One (eyebrows + badges + boutons), Inria Serif Light (corps éditorial — récap, descriptions cards, libellés sensibles), Manrope (UI — labels formulaires, inputs, slots, valeurs récap).
- Palette : violet doux (`--color-violet-600` `#8868B0`) en accent UI principal, doré utilisé uniquement sur le badge "Premium" (Rallongement Couture).
- Composants utilisés tels que définis dans le DS (.btn, .card, .input, .badge-*, .field). Tooltip `.tt` réutilisable et tooltip du DS sans nouvelle variante.

---

## 3. Sections de la page

| # | Anchor | Description |
|---|---|---|
| 0 | `#header` | Header réduit (logo + lien "← Retour", pas de nav complète) |
| 1 | `#intro` | Eyebrow + H1 + sous-titre rassurance |
| 2 | `#step-1` | Choisissez votre prestation (chips catégorie + grid de cards) |
| 3 | `#step-2` | Personnalisez (options checkbox, facultatif, skippable) |
| 4 | `#step-3` | Choisissez votre créneau (calendrier + slots horaires) |
| 5 | `#step-4` | Vos coordonnées (form 5 champs) |
| 6 | `#step-5` | Photos (upload facultatif, drag-drop) |
| 7 | `#step-6` | Carte cadeau (input + validation API, facultatif) |
| 8 | `#recap` | Récap sticky desktop (colonne droite) + drawer mobile |
| 9 | `#mobile-cta` | Sticky bottom bar mobile (récap trigger + CTA pay) |

---

## 4. Détail par section

### 4.1 Step 1 — Prestation
- **État initial** : ouvert, autres steps `is-disabled`. Chip "Toutes" active.
- **Layout** : `grid sm:grid-cols-2 gap-3` ; chaque card = placeholder photo (aspect-ratio 4/3) + badge + durée estimée (préfixe `≈` + tooltip `.tt`) + nom (Cinzel) + description (Inria).
- **Composants** : `<CategoryChips />`, `<ServiceCard />`.
- **Interactions** : click chip → filtre `display:none` sur cards hors catégorie. Click card → `state.presta = …`, badge violet check apparaît, `completeStep(1)`, auto-advance vers Step 2 si catégorie ∈ {naturels, rallongement, pack} sinon vers Step 3.
- **Anim** : `slideDown` step body 400ms, `translateY(-2px)` hover card.

### 4.2 Step 2 — Options
- **État initial** : disabled tant que Step 1 non validé.
- **Skippable** : si aucune option choisie, le user clique le step suivant manuellement (pas d'auto-advance).
- **Layout** : `flex flex-col gap-2.5` ; chaque ligne = `.opt-row` (icon rond + label + description + durée `+ X min` + checkbox custom).
- **Checkbox custom** : vide par défaut (`.opt-check` bordure ink-300), cochée violet 600 quand `.is-checked` sur la row.

### 4.3 Step 3 — Créneau
- **Calendrier** : navigation mois `<` `>`, grille 7 colonnes Lun→Dim, jours dimanche + pattern indispo grisés. Sélection → fade-in panel "Créneaux disponibles".
- **Slots** : 15 créneaux fixes 09:00→18:00 par tranches de 30 min, pause 12h–14h. Boutons `.slot` pill, hover violet, selected = fond violet 600 + texte blanc.
- **Auto-advance** vers Step 4 à la sélection d'un slot.

### 4.4 Step 4 — Coordonnées
- **Form** : `grid sm:grid-cols-2 gap-4` — prénom, nom, email, téléphone FR, message (textarea full-width).
- **Validation live** : `validEmail()` (regex RFC simple) et `validPhone()` (regex FR `^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$`). Classes `.is-valid` / `.is-invalid` sur input au blur.
- **Field-help** : message d'erreur sous l'input, couleur danger.

### 4.5 Step 5 — Photos
- **Dropzone** : 5 fichiers max, 5 Mo / fichier, types `image/png,image/jpeg,image/webp`.
- **Thumbnails grid** : `grid grid-cols-3 sm:grid-cols-5 gap-2` ; chaque thumb 1:1 avec bouton supprimer (X rouge top-right).
- **Drag-drop + click input** ; feedback dropzone : bordure violet 600 + bg violet 50 sur dragover.

### 4.6 Step 6 — Carte cadeau
- **3 états** : neutre / valid (`bg-success-tint`, montant affiché) / invalid (border-danger, message FR).
- **Démo codes** : `EXPIREE`, `INVALIDE`, autre ≥4 chars = valide 100 €.
- **Bascule CTA** : si valeur carte ≥ acompte → libellé bouton change en "Valider la réservation" (pas de Stripe Checkout, validation directe).

### 4.7 Récapitulatif (aside sticky + drawer mobile)
- **Desktop** ≥ 768px : colonne droite `22rem`, sticky `top-[88px]`, fond `rgba(246,241,250,0.5)`, `max-h-[calc(100vh-104px)] overflow-y-auto`.
- **Mobile** < 768px : trigger sticky bottom + drawer modal qui slide-up. Contenu mirroré via `data-mirror`.
- **Données** : prestation · options · durée totale estimée · date · horaire · acompte (30 % du total, jamais le prix total brut).

---

## 5. Composants DS réutilisés

| Classe / Token | Usage |
|---|---|
| `.btn .btn-primary` | CTA "Valider et payer" |
| `.btn .btn-secondary` | "Récap" mobile, navigation calendrier |
| `.btn .btn-ghost .btn-icon-only` | Fermer drawer, X thumbnails |
| `.btn .btn-sm` | CTA mobile sticky |
| `.card .card-padded` | Conteneur récap aside |
| `.input` / `.textarea` | Coordonnées + carte cadeau |
| `.field .field-label .field-help` | Wrapper champs form |
| `.badge .badge-rose / .badge-gold / .badge-violet / .badge-outline / .badge-success` | Tags prestations + état carte cadeau |
| `.section-eyebrow` | "Étape par étape · 2 min" + "Votre réservation" |
| `.photo-placeholder` | Placeholders des cards prestations (à remplacer par `next/image`) |
| `--color-violet-600 / 700 / 100 / 50` | Accents UI |
| `--color-cream / paper / line / ink-*` | Surfaces + texte |
| `--color-success / danger / warning` | États form + tooltip carte cadeau |
| `--font-serif / display / sans / ui` | Quatuor typo |
| `--radius-sm / md / pill` | Cards / accordion / chips & slots |
| `--shadow-sm / md / lg / focus` | Cards / hover / dropdown / focus ring |

---

## 6. Composants spécifiques à créer

À placer dans `src/components/reservation/`.

| Composant | Type | Responsabilités | Props |
|---|---|---|---|
| `ReservationFlow` | Client | Orchestrateur global, owns state, render steps + récap. | `services: Service[]`, `categories: Category[]`, `options: Option[]` |
| `ReservationStepper` | Client | Accordéon 6 steps (active/complete/disabled), gère ouverture/fermeture, scroll-into-view. | `currentStep`, `completedSteps`, `onChangeStep` |
| `ServiceSelector` | Client | Step 1 — chips + grid cards filtrable. | `services`, `selectedId`, `onSelect` |
| `ServiceCard` | Client | Card prestation individuelle (placeholder photo + badge + nom + durée tooltip). | `service`, `selected`, `onClick` |
| `CategoryChips` | Client | Pills filtre catégorie horizontal scrollable. | `categories`, `activeId`, `onChange` |
| `OptionsPicker` | Client | Step 2 — checkbox custom rows. | `options`, `selectedIds`, `onToggle` |
| `BookingCalendar` | Client | Step 3 — calendrier mois + slots. Fetch availability. | `serviceId`, `optionIds`, `onSelectSlot` |
| `CalendarMonth` | Client | Sous-composant grille jours navigable. | `month`, `unavailableDates`, `selectedDate`, `onSelect` |
| `SlotPicker` | Client | Liste pills créneaux pour un jour donné. | `date`, `slots`, `selected`, `onSelect` |
| `ClientForm` | Client | Step 4 — 5 champs validés live, react-hook-form + Zod. | `defaultValues`, `onValid` |
| `FileUploader` | Client | Step 5 — dropzone + thumbs + magic-byte check. Lazy-loaded. | `max=5`, `maxSize=5MB`, `accept`, `onChange` |
| `GiftCardField` | Client | Step 6 — input + bouton vérifier + 3 états. | `onValidated` |
| `ReservationSummary` | Client | Récap (desktop aside + mobile drawer). | `state` |
| `StickyMobileBar` | Client | Bottom bar mobile avec trigger drawer + CTA pay. | `total`, `canSubmit`, `onPay` |
| `Tooltip` | Client (peut être DS) | Tooltip réutilisable `.tt`. | `label`, `children` |

---

## 7. State management

**Recommandation : Zustand** (single store `useReservationStore`) — léger, persiste facile en localStorage, évite le prop-drilling sur 14+ composants.

```ts
interface ReservationState {
  serviceId: string | null;
  optionIds: string[];
  date: string | null;        // ISO yyyy-mm-dd
  time: string | null;        // HH:mm
  client: { firstname: string; lastname: string; email: string; phone: string; message?: string };
  files: File[];
  giftCard: { code: string; status: 'idle'|'valid'|'invalid'|'expired'; value?: number } | null;
  step: 1|2|3|4|5|6;
  completed: number[];
  setService, setOptions, setSlot, setClient, setFiles, setGiftCard, advance, reset
}
```

**Persistence** : `zustand/middleware/persist` sur `localStorage` clé `clochette.reservation.v1`. Hydratation sur mount avec `hydrationGuard` pour éviter mismatch SSR. Clear sur succès Stripe (callback `/reservation/success`).

---

## 8. API calls

Toutes les routes sous `/api/v1/`.

| Méthode | URL | Trigger | Body / Query |
|---|---|---|---|
| `GET` | `/api/v1/services` | Page mount (RSC) | — |
| `GET` | `/api/v1/availability/months` | Mount Step 3 ouvert | `?from=YYYY-MM&to=YYYY-MM` |
| `GET` | `/api/v1/availability/slots` | Sélection d'un jour | `?date=&serviceId=&optionIds=` |
| `POST` | `/api/v1/gift-cards/validate` | Click "Vérifier" | `{ code: string }` |
| `POST` | `/api/v1/upload` | Drop fichier | `multipart/form-data` (1 file/req) |
| `POST` | `/api/v1/bookings` | Click "Valider et payer" | (cf. schéma §10) |

### Types réponses

```ts
type Service = { id: string; slug: string; name: string; category: string; baseDurationMin: number; badge?: 'signature'|'premium'|'soin'|'sur-mesure'|'depose'; description: string; photoUrl?: string };
type AvailabilityMonth = { date: string; available: boolean }[]; // 1 entrée / jour
type AvailabilitySlots = { time: string; available: boolean }[]; // 15 entrées max
type GiftCardValidation =
  | { status: 'valid'; value: number; currency: 'EUR' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'depleted' };
type BookingResponse =
  | { checkoutUrl: string }              // cas standard, redirect Stripe
  | { confirmed: true; redirectUrl: string }; // carte cadeau couvre l'acompte
```

### Gestion d'erreur (UI)
- Toast `useToast()` + état `error` local du composant.
- 409 (slot pris) → re-fetch `availability/slots`, force retour Step 3, toast "Ce créneau vient d'être réservé."
- 422 → mappage champ-par-champ vers `setError` react-hook-form.
- 5xx → toast générique + bouton "Réessayer".

---

## 9. Server Actions

Préférer **Route Handlers** (`app/api/v1/*/route.ts`) pour rester compatible avec un mobile futur. Une seule Server Action utile :

### `createBookingAction` (alternative au POST /bookings)
```ts
"use server";
import { bookingSchema } from "@/schemas/booking";
export async function createBookingAction(input: unknown): Promise<BookingResponse> {
  const data = bookingSchema.parse(input);
  // 1. Lock le slot (Redis SETNX 90s)
  // 2. Recompute prix total (jamais trust client)
  // 3. Si giftCardCode → applyGiftCard, débite (transition GiftCardLedger)
  // 4. INSERT Booking (status AWAITING_DEPOSIT) + BookingOption[] + BookingFile[]
  // 5. Crée Stripe Checkout Session OU confirme direct si covered
  // 6. Émet OutboundEvent BookingCreated (queue : SMS rappel, email confirmation)
  // 7. Return { checkoutUrl } | { confirmed, redirectUrl }
}
```

---

## 10. Schemas Zod

```ts
import { z } from "zod";

export const clientSchema = z.object({
  firstname: z.string().trim().min(1, "Prénom requis").max(60),
  lastname:  z.string().trim().min(1, "Nom requis").max(60),
  email:     z.string().email("Email invalide").max(120),
  phone:     z.string().regex(/^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/, "Numéro français invalide"),
  message:   z.string().max(500).optional(),
});

export const fileSchema = z.object({
  filename: z.string().max(120),
  mime: z.enum(["image/png","image/jpeg","image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024, "Max 5 Mo"),
});

export const giftCardCodeSchema = z.object({
  code: z.string().trim().min(4).max(24).regex(/^[A-Z0-9-]+$/i),
});

export const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).max(8).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  client: clientSchema,
  fileIds: z.array(z.string().uuid()).max(5).default([]),
  giftCardCode: z.string().optional(),
  consent: z.literal(true),     // CGU acceptées
  honeypot: z.string().max(0),  // anti-bot
  captchaToken: z.string().min(10), // reCAPTCHA v3
});

export type BookingInput = z.infer<typeof bookingSchema>;
```

---

## 11. Stripe Checkout

```
[Client] click "Valider et payer"
  └─→ POST /api/v1/bookings  (bookingSchema)
        ├─ Server : lock slot 90s + valide gift card + insert Booking AWAITING_DEPOSIT
        ├─ Stripe : checkout.sessions.create({
        │     mode: 'payment',
        │     line_items: [{ price_data: depositPrice, quantity: 1 }],
        │     success_url: `${origin}/reservation/success?session_id={CHECKOUT_SESSION_ID}`,
        │     cancel_url:  `${origin}/reservation?cancelled=1`,
        │     metadata: { bookingId }
        │  })
        └─ Réponse : { checkoutUrl }   OU   { confirmed: true, redirectUrl: '/reservation/success?b=<id>' }

[Client] window.location.href = checkoutUrl || redirectUrl
[Stripe Webhook] checkout.session.completed → Booking.status = CONFIRMED, OutboundEvent : SMS + email
```

**Important :** aucun email avant confirmation paiement (webhook).

---

## 12. États d'erreur (copy FR)

| Code | Contexte | Copy |
|---|---|---|
| `SLOT_TAKEN` (409) | Race condition au submit | "Ce créneau vient d'être réservé. Sélectionnez-en un autre." |
| `GIFT_INVALID` | API gift-card | "Code carte cadeau introuvable." |
| `GIFT_EXPIRED` | API gift-card | "Cette carte cadeau a expiré." |
| `GIFT_DEPLETED` | API gift-card | "Le solde de cette carte est épuisé." |
| `UPLOAD_TOO_LARGE` | Drop fichier | "Fichier trop volumineux (5 Mo max)." |
| `UPLOAD_BAD_TYPE` | Drop fichier | "Format non supporté (JPG, PNG ou WEBP)." |
| `NETWORK` | Fetch fail | "Connexion interrompue. Réessayez." |
| `STRIPE_UNAVAILABLE` | Checkout fail | "Le paiement est temporairement indisponible. Réessayez dans un instant." |
| `EMAIL_INVALID` | Form blur | "Email invalide." |
| `PHONE_INVALID` | Form blur | "Numéro français invalide." |

---

## 13. Responsive

| Breakpoint | Layout principal | Récap | Mobile bar | Calendar |
|---|---|---|---|---|
| `<640` | 1 col stack | drawer modal | sticky bottom (récap + CTA pay) | grid 7 cols compact, fonts -1 step |
| `640-767` | 1 col stack | drawer modal | sticky bottom | grid 7 cols standard |
| `768-1023` | `grid-cols-[1fr_20rem]` | aside sticky droite | masqué | standard |
| `≥1024` | `grid-cols-[1fr_22rem]` | aside sticky droite | masqué | standard |

---

## 14. Animations

| Trigger | Effet | Implémentation |
|---|---|---|
| Step active → expanded | slide-down 400ms cubic-bezier(.2,.7,.3,1) | `@keyframes slideDown` (déjà dans le mock) |
| Chevron step | rotate(180deg) 300ms | CSS transition sur `.step-chevron` |
| Card prestation hover | translateY(-2px) + shadow-sm | CSS transition `all .25s` |
| Selection card | ring violet 600 (`0 0 0 2px`) + scale check | CSS class `.is-selected` |
| Navigation mois calendar | fade-out 150 → render → fade-in 150 | `useTransition` React 19 + CSS opacity |
| Slot select | bg violet 600 + color white | CSS class `.is-selected` |
| Validation carte cadeau (loading) | spinner intra-bouton 1.2s ease infinite | `.spinner` du DS |
| Validation carte cadeau (success) | check-circle pop + bg success-tint | `@keyframes pop` 350ms |
| Drawer mobile | translateY(100% → 0) 400ms | CSS class `.is-open` |
| Reduced motion | toutes transitions ramenées à 0.01s | `@media (prefers-reduced-motion: reduce)` |

---

## 15. Accessibilité

- **Stepper** : chaque `<article class="step">` est un `role="region"` avec `aria-labelledby="step-N-title"` et `aria-expanded`. Bouton header `aria-controls` cible `step-N-body`.
- **Calendar** : conteneur `role="grid" aria-labelledby="cal-title"`, jours `role="gridcell"` + `aria-selected`, navigation flèches ←↑→↓ (jour) + PgUp/PgDn (mois) + Home/End (semaine).
- **Slots** : `role="radiogroup" aria-labelledby="slots-title"`, chaque pill `role="radio"` + `aria-checked`.
- **Form** : `<label for>` explicite, `aria-invalid`, `aria-describedby` sur `.field-help`.
- **Live regions** : `<div role="status" aria-live="polite">` pour confirmations (carte cadeau validée, slot sélectionné), `<div role="alert">` pour erreurs réseau.
- **Focus order** : suit l'ordre visuel ; trap focus dans drawer mobile (Tab cycle), `Esc` ferme.
- **Skip link** : `<a href="#step-1" class="sr-only focus:not-sr-only">Aller au formulaire</a>`.
- **prefers-reduced-motion** : voir §14.

---

## 16. SEO

```ts
// app/reservation/page.tsx
export const metadata: Metadata = {
  title: "Réserver un rendez-vous · Clochette Nails",
  description: "Réservez votre prestation en quelques minutes. Acompte sécurisé via Stripe, confirmation SMS, rappel la veille.",
  robots: { index: false, follow: true }, // page conversion, pas de contenu indexable
  alternates: { canonical: "https://clochette-nails.fr/reservation" },
  openGraph: { type: "website", locale: "fr_FR" },
};
```

Pas de JSON-LD sur cette page (réservé à la Landing avec `BeautySalon` + `Service`).

---

## 17. Performance

- **LCP** : titre H1 "Réserver votre rendez-vous" — pur texte, font préchargée (`next/font/google` avec `display: 'swap'` + `preload: true`). Aucun fetch bloquant.
- **Fonts** : `next/font/google` pour Cinzel (400, 500), Julius Sans One (400), Inria Serif (300, 300i), Manrope (400, 500, 600). Subsets `latin` + `latin-ext`.
- **Code-splitting** :
  - `FileUploader` → `dynamic(() => import('@/components/reservation/FileUploader'), { ssr: false, loading: () => <Skeleton /> })`.
  - `BookingCalendar` → `dynamic(...)`, déclenché au premier passage Step 3.
- **ISR** : NON. Page Client interactive avec data live ; `export const dynamic = 'force-dynamic'`.
- **Cache** : `GET /availability/months` → `Cache-Control: private, max-age=3600`. `GET /availability/slots` → no-cache (slots changent dès qu'une autre cliente réserve).
- **Images** : photos prestations en `next/image` avec `sizes` correct + placeholder blur. Pour le mock, placeholders SVG diagonaux.

---

## 18. Sécurité

| Mesure | Implémentation |
|---|---|
| reCAPTCHA v3 | Token côté Client, vérif score ≥ 0.5 côté server avant `bookings.create` |
| Honeypot | Champ `<input name="website" tabIndex={-1} className="sr-only" />` ; rejet si non vide |
| Rate limit | Middleware Upstash `30 req/min/IP` sur `/api/v1/bookings`, `10 req/min/IP` sur gift-cards/validate, `5 uploads/min/IP` |
| Magic-byte upload | `file-type` package server-side, refuse les uploads dont les premiers octets ne matchent pas le mime déclaré |
| CSRF | NextAuth v5 gère pour les routes session-protected ; pour cette page anonyme, double-submit cookie sur `/bookings` |
| Validation Zod | `safeParse` systématique en bord d'API + en form (react-hook-form resolver) |
| Slot-lock | Redis SETNX `slot:{serviceId}:{date}:{time}` TTL 90s pendant le checkout |
| Secrets | `STRIPE_SECRET_KEY`, `RECAPTCHA_SECRET`, `UPSTASH_*` en env, jamais loggés |

---

## 19. Checklist d'intégration (Phase 1)

### Composants à créer (file paths)
- [ ] `src/components/reservation/ReservationFlow.tsx`
- [ ] `src/components/reservation/ReservationStepper.tsx`
- [ ] `src/components/reservation/ServiceSelector.tsx`
- [ ] `src/components/reservation/ServiceCard.tsx`
- [ ] `src/components/reservation/CategoryChips.tsx`
- [ ] `src/components/reservation/OptionsPicker.tsx`
- [ ] `src/components/reservation/BookingCalendar.tsx`
- [ ] `src/components/reservation/CalendarMonth.tsx`
- [ ] `src/components/reservation/SlotPicker.tsx`
- [ ] `src/components/reservation/ClientForm.tsx`
- [ ] `src/components/reservation/FileUploader.tsx`
- [ ] `src/components/reservation/GiftCardField.tsx`
- [ ] `src/components/reservation/ReservationSummary.tsx`
- [ ] `src/components/reservation/StickyMobileBar.tsx`
- [ ] `src/components/ui/Tooltip.tsx` (si pas déjà dans DS)
- [ ] `src/store/reservation.ts` (Zustand)
- [ ] `src/schemas/reservation.ts` (Zod)
- [ ] `app/reservation/page.tsx`
- [ ] `app/reservation/success/page.tsx`
- [ ] `app/reservation/loading.tsx`

### Endpoints API
- [ ] `app/api/v1/services/route.ts` (GET, cache 1h public)
- [ ] `app/api/v1/availability/months/route.ts` (GET, cache 1h private)
- [ ] `app/api/v1/availability/slots/route.ts` (GET, no-cache)
- [ ] `app/api/v1/gift-cards/validate/route.ts` (POST, rate-limited)
- [ ] `app/api/v1/upload/route.ts` (POST, multipart, magic-byte)
- [ ] `app/api/v1/bookings/route.ts` (POST, captcha, slot-lock, Stripe)
- [ ] `app/api/webhooks/stripe/route.ts` (POST, raw body, signature verif)

### Server Actions (optionnel — alternative à `/bookings`)
- [ ] `src/actions/createBooking.ts`

### Schemas Prisma à vérifier
- [ ] `Booking` (status enum AWAITING_DEPOSIT → CONFIRMED → COMPLETED → CANCELLED → NO_SHOW)
- [ ] `BookingOption` (m2m via table jointe)
- [ ] `BookingFile` (FK → File)
- [ ] `GiftCard` + `GiftCardLedger` (transactions de débit)
- [ ] `Service`, `ServiceOption`, `Category`
- [ ] `OutboundEvent` (queue email/SMS)

### Tests E2E (Playwright)
- [ ] `tests/e2e/reservation.happy-path.spec.ts` — flow complet jusqu'à redirect Stripe
- [ ] `tests/e2e/reservation.giftcard-covers.spec.ts` — carte cadeau couvre acompte
- [ ] `tests/e2e/reservation.slot-race.spec.ts` — slot pris pendant le checkout
- [ ] `tests/e2e/reservation.form-validation.spec.ts` — erreurs par champ
- [ ] `tests/e2e/reservation.upload.spec.ts` — drag-drop + limites
- [ ] `tests/e2e/reservation.mobile-drawer.spec.ts` — drawer + sticky bar

---

## 20. Fichiers sources

| Fichier | Rôle |
|---|---|
| `Reservation.html` | Mock HTML validé v1 — source de vérité visuelle et interactive |
| `Design System.html` | Référence DS v1.1 — tokens, composants, typo |
| `reservation-README.md` | Ce document |

**Statut :** v1 validée, prête au portage Phase 1.
