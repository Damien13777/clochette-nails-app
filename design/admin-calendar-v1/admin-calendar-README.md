# Admin · Calendrier — Handoff dev (v1)

> Page `/admin/calendrier` · Clochette Nails · Référence : `Design System.html` (v1.1) + `AdminCalendar.html` (mock validé) + `admin-dashboard-README.md` (pattern admin-shell)
> Cible : Next.js 16 App Router · NextAuth v5 · Prisma 7 · Tailwind v4

---

## 1. Overview

| | |
|---|---|
| **Objectif business** | Centre opérationnel du salon. Chloé y pilote 4 niveaux d'actions : (1) ouvrir/fermer des **mois entiers** (`BookableMonth`), (2) définir les **horaires hebdomadaires** (`BusinessHours`), (3) bloquer des **périodes ponctuelles** (`Unavailability`) ou récurrentes (`RecurringUnavailability`), (4) visualiser et gérer les **bookings** via vue calendrier. C'est l'écran le plus complexe de l'admin. |
| **Cible** | Chloé (rôle ADMIN). |
| **Route** | `app/admin/calendrier/page.tsx` sous `app/admin/layout.tsx` (admin-shell). Sous-routes possibles via query (`?tab=months|hours|unavail|view`, `?month=2026-05`). |
| **Stack styles** | Tailwind v4 (`@theme`) + DS v1.1. Manrope dominant. Cinzel pour H1/H2, nom du mois, dates. Julius Sans One pour eyebrows, labels, badges, toggles vue. Inria Serif uniquement pour emphase italique éventuelle. |
| **Ratio Server/Client** | Page = RSC qui hydrate l'état initial (4 fetches en parallèle). Toute la vue calendrier + drawers + modals + tabs = **Client island** (Zustand pour multi-tabs state partagé : mois affiché, vue active, drawer ouvert, modal ouvert). |
| **Lighthouse cible** | Performance ≥ 88 (composant lourd) · Accessibility ≥ 96 · Best Practices ≥ 95 · SEO N/A. |

---

## 2. Déviations DS v1.1

**Aucune déviation structurelle.**

Ajouts spécifiques au calendrier, formalisés mais dans la palette DS :
- **8 nuances de catégorie de prestation** (`--color-cat-natural / -rallong / -soin / -art / -french / -retir / -evnmt / -autre`). Toutes désaturées (oklab proche du violet/rose/beige de la palette DS). Affectation déterministe par `serviceId` via hash modulo 8.
- **Hatching pattern** (`repeating-linear-gradient` 45° à `--color-ink-300` α.18) pour signaler les jours de mois non ouvert (`BookableMonth` absent). Pure CSS, pas de SVG.

---

## 3. Sections de la page

| # | Anchor | Description |
|---|---|---|
| — | shell | `AdminSidebar` (Calendrier `aria-current=page`) + `AdminTopbar` identiques au dashboard |
| 0 | `page-header` | Eyebrow "Calendrier" + H1 "Disponibilités & rendez-vous" + actions droite (Bloquer / Nouveau créneau) |
| 0b | `tab-bar` | Tabs sticky `top: 64px` : Vue calendrier · Mois ouverts · Horaires hebdo · Indispos |
| 1 | tab `view` | Toolbar (nav mois + view toggle + filtre cat) + grid 7×6 + légende |
| 2 | tab `months` | Grid 12 mois (4 cols desktop) + toggle ouvert/fermé |
| 3 | tab `hours` | 7 lignes (Lun→Dim) avec 4 inputs HH:MM + switch ouvert/fermé + save-bar sticky |
| 4 | tab `unavail` | 2 colonnes : `Unavailability` (ponctuelles) + `RecurringUnavailability` |
| D1 | drawer | Détail du jour (bookings + créneaux libres + actions) |
| D2 | drawer | Détail booking (cliente, presta, paiement, **flow gift-card**, notes admin, actions) |
| M1 | modal | `RedemptionModal` — encaisser via carte cadeau |
| M2 | modal | `RefundModal` — remboursement total/partiel |
| M3 | modal | `UnavailabilityModal` — bloquer une période ponctuelle/partielle |

---

## 4. Détail par section

### 4.0 Page header + Tabs
- Header : eyebrow Julius Sans One + H1 Cinzel + 2 boutons droite (`btn-secondary btn-sm` "Bloquer une période" / `btn-primary btn-sm` "Nouveau créneau").
- Tabs : `tab-bar` sticky sous topbar (top 64px), bordure inférieure ink-line, indicateur actif = barre 2px violet 600 sous le label, role `tablist` + chaque trigger `role=tab aria-selected aria-controls`.

### 4.1 Tab "Vue calendrier" (défaut)
- **Toolbar** : chevron prev / `Cinzel 1.25rem` nom du mois courant / chevron next / bouton "Aujourd'hui" — view toggle "Mois | Semaine | Jour" (segmented pill) — filtre dropdown catégories.
- **Grid mois** : `cal-grid` (card) → header 7 jours (`columnheader` Lun→Dim) + body `display: grid; grid-template-columns: repeat(7, 1fr)`. 5 ou 6 lignes selon mois. Cells min-height 140px desktop / 80px mobile.
- **États cellule** :
  | État | Classes | Visuel |
  |---|---|---|
  | Hors mois | `.cal-cell--out` | opacity 0.5, ink-300 |
  | Mois pas ouvert | `.cal-cell--unbookable` | hatching diagonal, `cursor: not-allowed` |
  | Jour fermé (BusinessHours) | `.cal-cell--closed` | bg bone, num ink-300, pas de bookings affichées |
  | Indispo (Unavailability ce jour) | `.cal-cell--unavail` | bordure warning + flag pastille "Indispo" |
  | Aujourd'hui | `.cal-cell--today` | inset shadow 2px violet-600 + flag "Auj." |
  | Sélectionné | `.cal-cell--selected` | bg violet-100 + inset shadow violet-600 |
- **Pastilles bookings** : barres `.booking-chip--{cat}` hauteur 18px, border-left 3px catégorie, texte 11px "HH:MM · Client". Max 3 visibles + "+N autres" (`.more-chip`). `AWAITING_DEPOSIT` → `.booking-chip--awaiting` (opacity 0.7 + dashed outline warning).
- **Interactions** : clic cell jour → drawer "Détail du jour" · clic pastille → drawer "Détail booking" · clavier ↑↓←→ + Enter (gridcell navigation).
- **Filtre catégorie** : applique un filter sur les bookings rendus dans la grid (purement client-side, pas de refetch).
- **Légende** colorée sous la grid (8 cat. + flags).

### 4.2 Tab "Mois ouverts"
- Eyebrow "BookableMonth" + H2 + texte d'aide max 60ch.
- Grid `grid-cols-2 lg:grid-cols-4 gap-3` · 12 cards (année courante).
- Card mois : nom Cinzel + année (Julius) + switch (24×44px) en haut à droite. Si ouvert → bg violet-50, badge `Réservable` vert, sous-ligne "N bookings ce mois". Si fermé → badge neutre, texte invite.
- Toggle = optimistic UI : `POST /api/admin/calendar/months` ou `DELETE`. Audit log côté backend. **Note : la fermeture d'un mois ne supprime pas les bookings existantes** (seulement empêche les nouvelles).

### 4.3 Tab "Horaires hebdo"
- Eyebrow "BusinessHours" + H2 + texte d'aide.
- Card contenant 7 `hours-row` (Lun→Dim) : grid `90px 60px 1fr` (jour / switch / inputs). Inputs HH:MM `<input type="time" class="input input-time">` (largeur 100px).
- 4 champs par jour : ouverture / début pause / fin pause / fermeture. Pause optionnelle (laisser breakStart=breakEnd=null pour sans pause — Phase 2).
- Si fermé : zone grisée "Fermé" badge neutre.
- **Save-bar sticky** : apparaît dès qu'une modif est détectée (`hoursState !== initialState`), avec "Annuler" + "Sauvegarder".
- **Validation côté Zod** : `openingTime < breakStart < breakEnd < closingTime` (et heures cohérentes 00:00–23:59).

### 4.4 Tab "Indispos"
- 2 colonnes desktop, empilées mobile.
- **A — Périodes bloquées (ponctuelles)** : liste paginée. Chaque row : `when` (date début → date fin Cinzel) + raison Manrope + sous-ligne (heures si partiel · durée) + actions edit/delete (ou badge "Passé" pour les anciennes en read-only). Bouton "Bloquer une nouvelle période" → ouvre `UnavailabilityModal`.
- **B — Blocages récurrents** : "Tous les `<jour>` de `<heure>` à `<heure>`" + raison + date début + date fin optionnelle. Bouton "Ajouter une récurrence" → modal (à implémenter en Phase 1.5).

### D1 Drawer "Détail du jour"
- Header : eyebrow + date Cinzel + bouton close.
- Section "Bookings du jour" : liste de mini-cards (heure Cinzel + nom + presta + badge statut + badge GC si applicable). Click → switch vers drawer booking.
- Section "Créneaux libres" : chips pill bone affichant les slots disponibles selon `BusinessHours` du jour, en excluant les bookings et indispos.
- Footer : 2 boutons "Bloquer la journée" / "Indispo partielle".

### D2 Drawer "Détail booking" ⭐
- Header : eyebrow `BK-ID` + date Cinzel + close. **Border-top 4px** color-coded par catégorie de presta.
- **Section Cliente** : nom Cinzel + email + tel + bouton "Envoyer un email" (`mailto:` direct ou modal templates en Phase 2).
- **Section Prestation** : nom + options listées + durée totale.
- **Section Paiement** :
  - Statut booking (badge)
  - DL : Total prestation / Acompte versé / Stripe ID (mono) / Payé le
  - **Si carte cadeau utilisée** → bloc `.gc-box` violet-50 :
    - Code masqué (4 derniers caractères : `...E5F6`)
    - DL : Solde initial / Utilisé (acompte) / Solde restant (Cinzel violet-700)
    - **CTA primary "Encaisser le solde via carte cadeau"** → ouvre `RedemptionModal`.
- **Section Photos** (mini-grid 3 cols) : photos uploadées par la cliente lors de la réservation (Phase 1 affichage, upload existant).
- **Section Notes admin** : `<textarea>` debounce 1.5s → autosave silencieux, status text "Modification en cours…" → "Enregistré ✓" 1.8s → "Aucune modification".
- **Footer actions** :
  - `Marquer terminé` (`COMPLETED`, visible si jour ≤ aujourd'hui)
  - `Refund` → `RefundModal`
  - `Annuler` (texte rouge) → `AdminCancelModal` (avec option refund inline)
  - `No-show` → marque `NO_SHOW` + log

### M1 RedemptionModal (post-RDV gift card)
- Header eyebrow "Carte cadeau · ...XXXX" + titre.
- Body :
  - Section eyebrow "Solde restant" + montant Cinzel 2.25rem violet-700.
  - Label + input `<input type="number" step="0.01" min="0.01" max="{remaining}">` préfixé `€`.
  - Boutons rapides : 10 / 20 / 50 / "Solde complet" (= max).
  - Note : "La cliente recevra un email de confirmation avec le solde restant."
- Footer : Annuler ghost / Encaisser X € primary.
- **Validation** : `0,01€ < montant ≤ solde restant`. Disabled si invalid.
- **API** : `POST /api/admin/bookings/:id/redeem-gift-card` `{ amountCents }`.

### M2 RefundModal (réutilisable bookings + ebooks + gift cards)
- Toggle "Total / Partiel" (segmented `view-toggle`).
- Si partiel : sub-toggle "€ / %" + input.
- **Aperçu live** dans card bone : Acompte initial − Pénalité = Remboursé. La pénalité s'applique selon politique d'annulation (Phase 2).
- Raison (textarea, audit-logged).
- Footer : Annuler / `Rembourser X €` `.btn-danger`.
- **API** : `POST /api/admin/bookings/:id/refund` `{ type: 'total'|'partial', amountCents?, percent?, reason? }`.

### M3 UnavailabilityModal
- Champs : date début / date fin / case "Journée partielle" → inputs De/À HH:MM / raison.
- Validation : `from ≤ to`, `partial.from < partial.to` si partiel.
- **API** : `POST /api/admin/unavailabilities`.

---

## 5. Composants DS réutilisés

| Token / classe | Usage |
|---|---|
| `.btn .btn-primary/-secondary/-ghost/-danger/-sm` | Toutes actions |
| `.badge .badge-success/-warning/-danger/-violet/-neutral` | Statuts booking, badges GC, badges flags |
| `.card` | Sections, mois, drawer cards |
| `.input` (+ `.input-time`) | Tous champs |
| `.section-eyebrow` | Eyebrows partout |
| `--color-violet-700/600/300/100/50` | Accent UI complet |
| `--color-gold-50/300/600` | Pas utilisé sur le calendrier directement |
| `--color-success/warning/danger` | Statuts |
| `--font-serif/display/ui` | Cinzel · Julius · Manrope |
| `--radius-sm/md/pill` | Inputs / cards / pills |
| `--shadow-xs/sm/md/lg/focus` | Cards / hover / drawer / modal / focus |

---

## 6. Composants spécifiques

À placer dans `src/components/admin/calendar/`.

### Shell (réutilisé du dashboard, **inchangé**)
`AdminLayout`, `AdminShell`, `AdminSidebar`, `AdminNavLink`, `AdminTopbar`, `AdminSearch`, `NewMenu`, `NotificationBell`, `UserMenu` — cf. `admin-dashboard-README.md` §6.

### Calendrier (spécifiques)

| Composant | Type | Responsabilités | Props |
|---|---|---|---|
| `CalendarPage` (page.tsx) | Server | `Promise.all([fetchBookings, fetchMonths, fetchHours, fetchUnavails])` → hydrate Zustand store via Client wrapper. | — |
| `CalendarTabs` | Client | Wrapper Zustand subscriber, switch entre les 4 tabs. | `initial: HydratedState` |
| `CalendarToolbar` | Client | Nav mois (prev/next/today), view toggle, filtre catégorie. | — |
| `CalendarMonthView` | Client | Grid 7×N, rend les cells. **Mémoize** par `(year, month, bookings, filter)`. | `bookings`, `monthCursor`, `filter`, `onDayClick`, `onBookingClick` |
| `CalendarWeekView` | Client | Vue semaine 7 cols + heures verticales (Phase 1.5). | idem |
| `CalendarDayView` | Client | Vue jour : timeline verticale heure par heure (Phase 1.5). | idem |
| `CalendarCell` | Client | Une cellule jour. Mémoizé. | `date`, `flags`, `bookings[]`, `onClick` |
| `BookingChip` | Client | Pastille booking. | `booking`, `onClick` |
| `DayDetailDrawer` | Client | Drawer "Détail du jour". | `date` (depuis store) |
| `BookingDetailDrawer` | Client | Drawer "Détail booking". | `bookingId` (depuis store) |
| `GiftCardRedemptionBlock` | Client | Bloc `.gc-box` dans le drawer booking + bouton open modal. | `giftCard`, `bookingId` |
| `BookingActions` | Client | Footer drawer (complete / refund / cancel / no-show). | `booking` |
| `AdminNotesEditor` | Client | Textarea autosave 1.5s debounce. | `bookingId`, `initialValue` |
| `RedemptionModal` | Client | Encaisser via GC. | `bookingId`, `giftCard` |
| `RefundModal` | Client | Total/partiel + €/%. **Réutilisable** booking + ebook + gift card. | `target: { kind, id }`, `originalAmountCents` |
| `AdminCancelModal` | Client | Annulation avec option refund inline. | `bookingId` |
| `UnavailabilityModal` | Client | Création période bloquée. | `mode: 'create'|'edit'`, `initial?` |
| `RecurringUnavailModal` | Client | Création récurrence (Phase 1.5). | idem |
| `BookableMonthsGrid` | Client | Grid 12 cards + switch optimistic. | `openMonths`, `bookingsPerMonth` |
| `BusinessHoursEditor` | Client | 7 lignes + save-bar sticky. **Local state** jusqu'au save. | `initialHours[7]` |
| `UnavailabilityList` | Server (initial) / Client (mut) | Liste paginée ponctuelles + actions edit/delete. | `unavails[]` |
| `RecurringUnavailabilityList` | idem | Liste récurrences. | `recurring[]` |
| `Toast` | Client | Toast bottom-center, 2.2s. | imperative `toast(msg)` |

---

## 7. State management

**Zustand recommandé** (slice par concern, partagé entre tabs et drawers).

```ts
// src/stores/admin-calendar.store.ts
type CalendarState = {
  // navigation
  monthCursor: Date;
  view: 'month' | 'week' | 'day';
  categoryFilter: ServiceCategory | null;
  selectedDay: Date | null;

  // overlays
  openDrawer: 'day' | 'booking' | null;
  openModal: 'redemption' | 'refund' | 'cancel' | 'unavail' | 'recurring' | null;
  activeBookingId: string | null;

  // tab actif (synchro URL via shallow router)
  activeTab: 'view' | 'months' | 'hours' | 'unavail';

  // actions
  goPrevMonth(): void;
  goNextMonth(): void;
  goToday(): void;
  setView(v): void;
  selectDay(d): void;
  openBooking(id): void;
  closeOverlays(): void;
};
```

- **React Query** pour les fetches : `useBookings(yyyymm)`, `useMonths()`, `useHours()`, `useUnavails()`, `useRecurringUnavails()`. Cache 60s, `refetchOnWindowFocus: true`.
- **Mutations** via React Query `useMutation` + invalidation : `useToggleMonth()`, `useSaveHours()`, `useCreateUnavail()`, `useRedeemGiftCard()`, `useRefundBooking()`, etc.
- **Optimistic UI** : sur toggle `BookableMonth` et sur autosave notes. Rollback si erreur.

---

## 8. API calls

| Méthode | URL | Trigger | Réponse |
|---|---|---|---|
| `GET` | `/api/admin/calendar/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD` | Tab view, mois affiché | `BookingForCalendar[]` |
| `GET` | `/api/admin/calendar/months` | Tab months mount | `BookableMonth[]` (12 entrées par défaut) |
| `POST` | `/api/admin/calendar/months` | Switch on | `{ ok, month }` |
| `DELETE` | `/api/admin/calendar/months/:yyyymm` | Switch off | `{ ok }` |
| `GET` | `/api/admin/business-hours` | Tab hours mount | `BusinessHoursWeek` |
| `PATCH` | `/api/admin/business-hours` | Save | `{ ok }` |
| `GET` | `/api/admin/unavailabilities?from=&to=` | Tab unavail + dot indispo grid | `Unavailability[]` |
| `POST` | `/api/admin/unavailabilities` | Modal | `Unavailability` |
| `PATCH` | `/api/admin/unavailabilities/:id` | Edit row | `Unavailability` |
| `DELETE` | `/api/admin/unavailabilities/:id` | Delete row | `{ ok }` |
| `GET` | `/api/admin/recurring-unavailabilities` | Tab unavail (B) | `RecurringUnavailability[]` |
| `POST` / `DELETE` | `/api/admin/recurring-unavailabilities[/:id]` | Idem | idem |
| `POST` | `/api/admin/bookings/:id/redeem-gift-card` | RedemptionModal | `{ ok, newBalance }` |
| `POST` | `/api/admin/bookings/:id/refund` | RefundModal | `{ ok, refundedCents }` |
| `POST` | `/api/admin/bookings/:id/cancel` | CancelModal | `{ ok }` |
| `POST` | `/api/admin/bookings/:id/complete` | Action drawer | `{ ok }` |
| `POST` | `/api/admin/bookings/:id/no-show` | Action drawer | `{ ok }` |
| `PATCH` | `/api/admin/bookings/:id/notes` | Autosave debounce | `{ ok, savedAt }` |

### Types

```ts
export type ServiceCategory = 'natural' | 'rallong' | 'soin' | 'art' | 'french' | 'retir' | 'evnmt' | 'autre';

export type BookingForCalendar = {
  id: string;
  startAt: string;            // ISO
  endAt: string;
  client: { id: string; firstname: string; lastname: string; email: string; phone?: string };
  service: { id: string; name: string; category: ServiceCategory; durationMin: number };
  options: { id: string; name: string }[];
  status: 'CONFIRMED' | 'AWAITING_DEPOSIT' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  hasGiftCard: boolean;
  giftCard?: { codeLast4: string; initialCents: number; usedForDepositCents: number; remainingCents: number };
};

export type BookableMonth = { yyyymm: string; openedAt: string; openedByUserId: string; bookingsCount: number };

export type BusinessHoursWeek = {
  monday: DayHours; tuesday: DayHours; wednesday: DayHours;
  thursday: DayHours; friday: DayHours; saturday: DayHours; sunday: DayHours;
};
export type DayHours = { isOpen: boolean; openingTime?: string; breakStart?: string; breakEnd?: string; closingTime?: string };

export type Unavailability = { id: string; fromAt: string; toAt: string; isPartial: boolean; reason: string };
export type RecurringUnavailability = {
  id: string; dayOfWeek: 1|2|3|4|5|6|7;
  fromTime: string; toTime: string;
  startsOn: string; endsOn?: string;
  reason: string;
};
```

### Gestion d'erreur
- Tous les fetches sous React Query `onError` → toast + retry button card.
- Mutations : rollback optimistic + toast.

---

## 9. Server Actions

Pour la cohérence App Router et les mutations critiques avec audit, on utilise **Server Actions** plutôt que des routes API pour :

- `toggleBookableMonthAction(yyyymm, open)`
- `saveBusinessHoursAction(week)`
- `createUnavailabilityAction(payload)` / `deleteUnavailabilityAction(id)`
- `createRecurringUnavailabilityAction(payload)` / `deleteRecurringUnavailabilityAction(id)`
- `redeemGiftCardAction(bookingId, amountCents)` ⭐
- `refundBookingAction(bookingId, params)`
- `cancelBookingAction(bookingId, refundParams?)`
- `completeBookingAction(bookingId)` / `markNoShowAction(bookingId)`
- `updateBookingNotesAction(bookingId, notes)` (autosave)

Chaque action : `'use server'` + `requireAdmin()` + Zod parse + Prisma + `OutboundEvent` log + `revalidatePath('/admin/calendrier')`.

Les routes API listées en §8 restent en fallback pour les fetches GET (React Query côté Client).

---

## 10. Schemas Zod

```ts
import { z } from "zod";

export const dayHoursSchema = z.object({
  isOpen: z.boolean(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).refine(d => !d.isOpen || (d.openingTime && d.closingTime), { message: "openingTime et closingTime requis si ouvert" })
  .refine(d => !d.breakStart || !d.breakEnd || d.breakStart < d.breakEnd, { message: "breakStart < breakEnd" })
  .refine(d => !d.openingTime || !d.closingTime || d.openingTime < d.closingTime, { message: "openingTime < closingTime" });

export const businessHoursWeekSchema = z.object({
  monday: dayHoursSchema, tuesday: dayHoursSchema, wednesday: dayHoursSchema,
  thursday: dayHoursSchema, friday: dayHoursSchema, saturday: dayHoursSchema, sunday: dayHoursSchema,
});

export const bookableMonthSchema = z.object({ yyyymm: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export const unavailabilityCreateSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  partial: z.object({ fromTime: z.string().regex(/^\d{2}:\d{2}$/), toTime: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
  reason: z.string().min(2).max(200),
}).refine(p => p.fromDate <= p.toDate, { message: "fromDate ≤ toDate" });

export const recurringUnavailabilityCreateSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  fromTime: z.string().regex(/^\d{2}:\d{2}$/),
  toTime: z.string().regex(/^\d{2}:\d{2}$/),
  startsOn: z.string().date(),
  endsOn: z.string().date().optional(),
  reason: z.string().min(2).max(200),
}).refine(p => p.fromTime < p.toTime);

export const redeemGiftCardSchema = z.object({
  amountCents: z.number().int().positive(),
});

export const refundSchema = z.object({
  type: z.enum(['total', 'partial']),
  amountCents: z.number().int().nonnegative().optional(),
  percent: z.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional(),
}).refine(d => d.type === 'total' || d.amountCents !== undefined || d.percent !== undefined);
```

---

## 11. Real-time updates

**Polling React Query, pas WebSockets.**

| Endpoint | `staleTime` | `refetchInterval` | `refetchOnWindowFocus` |
|---|---|---|---|
| `bookings?from&to` (tab view, mois courant) | 30s | 60s | ✓ |
| `bookings` (autres mois préchargés) | 5min | — | — |
| `months` | 5min | — | ✓ |
| `hours` | 5min | — | ✓ |
| `unavailabilities` | 1min | — | ✓ |

- **Prefetch** : au mount, on prefetch mois courant + précédent + suivant pour rendre les flèches instantanées.
- **Optimistic** : tous les toggles + autosave notes + create/delete unavail.

---

## 12. États d'erreur

| Cas | UI |
|---|---|
| **Loading initial** | Skeleton calendar (grid bone gris) + skeleton tabs + cards skeleton sur autres tabs |
| **Empty bookings (mois vide)** | Grid affichée sans pastilles, légende visible, message discret "Aucune réservation ce mois" en footer |
| **Empty unavailabilities** | Card "Aucune période bloquée — votre semaine est libre." + bouton Bloquer |
| **Erreur fetch** | Toast `Connexion impossible` + bouton retry sur la card affectée |
| **Overlap booking (édit creneau)** | Modal warning "Conflit avec BK-XXXX (10:00–11:30). Continuer écrasera ce slot ? [Annuler] [Forcer]" |
| **Save concurrent (BusinessHours)** | Optimistic apply + si conflict 409 : revert + toast "Quelqu'un d'autre a modifié les horaires entre-temps. Rechargez." |
| **Refund > acompte** | Disabled bouton "Rembourser" + helper "Montant supérieur à l'acompte versé" |
| **Redeem > solde** | Disabled bouton + helper "Solde insuffisant" |
| **403 session expirée** | Middleware redirect `/admin/connexion?callbackUrl=/admin/calendrier` |

---

## 13. Responsive

| Breakpoint | Layout |
|---|---|
| `< 640` | Sidebar drawer · tabs → `<select>` natif · grid mois compact : dots colorés par cat (max 4 dots/jour), tap = liste bookings sous la grid · drawer fullscreen · modals fullscreen |
| `640-1023` | Sidebar drawer · tabs scrollables horizontalement · grid mois standard avec pastilles · drawer fullscreen · modals centrés |
| `≥ 1024` | Layout complet : sidebar fixe 260px · tabs visibles · grid mois 140px/cell · drawer latéral 480px · modals 460px |

Mode mobile compact : `.cal-cell` perd les pastilles, affiche au plus 4 dots `<span class="dot dot-{cat}">`. Click → drawer day fullscreen.

---

## 14. Animations

| Trigger | Effet | Implémentation |
|---|---|---|
| Tab switch | fade-up 250ms | `.tab-panel.is-active` animation |
| Mois prev/next | fade-out 150ms → re-render → fade-in 150ms | CSS opacity transition + setTimeout |
| Sélection jour | bg fade 200ms | CSS transition |
| Drawer slide-in | translateX 100% → 0, 350ms cubic-bezier `.2,.7,.3,1` | `.drawer.is-open` |
| Modal | backdrop fade 250ms + card scale `.98→1` + opacity 250ms | CSS transition |
| Hover pastille booking | translateY(-1px) + shadow-sm | CSS transition `.2s` |
| Autosave notes | Status text fade "Modification en cours… → Enregistré ✓" 1.8s puis "Aucune modification" | setTimeout chained |
| Toast | translateY(120% → 0) 300ms + auto-dismiss 2.2s | CSS transition |
| `prefers-reduced-motion` | Toutes anims réduites à 0.01ms | media query global |

---

## 15. Accessibilité

- **Grid** : `role="grid" aria-labelledby="month-label"`. Header `role="row"` + `role="columnheader"`. Cells `role="gridcell" tabindex="0"`. Cell aujourd'hui : `aria-current="date"`.
- **Navigation clavier grid** :
  - ← → ↑ ↓ : jour précédent/suivant/semaine ±
  - PgUp / PgDn : mois précédent/suivant
  - Home / End : début/fin de semaine
  - Enter / Space : ouvrir drawer day
  - Esc : fermer drawer/modal
- **Pastille booking** : `<button>` natif + `aria-label="Booking Marie L. à 10h, Semi-permanent Reflet, statut confirmé"`.
- **Tabs** : `role="tablist"` + chaque trigger `role="tab" aria-selected aria-controls`. Tab panels `role="tabpanel" aria-labelledby`.
- **Drawer** : `role="dialog" aria-modal="true" aria-labelledby aria-hidden`. **Focus trap** sur ouverture, restore focus à la fermeture. `Esc` ferme.
- **Modal** : idem drawer.
- **Switch** : `<input type="checkbox">` natif + label associé. Aria-label sur la cellule mère.
- **Inputs time** : `<input type="time">` (clavier natif HH:MM).
- **Save-bar** : `role="status" aria-live="polite"`.
- **Toast** : `role="status" aria-live="polite"`.
- **Polling tactful** : pas de live region intrusive, refresh silencieux.
- **prefers-reduced-motion** respecté.

---

## 16. SEO

```ts
export const metadata: Metadata = {
  title: "Calendrier · Administration",
  robots: { index: false, follow: false },
};
```

Pas de canonical / OG / JSON-LD. Page strictement privée.

---

## 17. Performance

- **RSC + Promise.all** : 4 fetches initiaux en parallèle (bookings mois courant, months, hours, unavails).
- **Suspense par tab** : seul le tab actif charge ses données. Lazy import (`dynamic(() => import('./BookableMonthsGrid'), { ssr: false })`) pour les tabs months/hours/unavail.
- **Mémoization** : `CalendarCell` et `BookingChip` mémoizés (`React.memo` + key stable).
- **Virtualisation conditionnelle** : si > 100 bookings dans le mois affiché → `react-virtual` sur le rendu des chips par cell. Phase 1.5 si jamais ça pose problème en prod.
- **Prefetch mois adjacents** : `queryClient.prefetchQuery` au mount.
- **Date utils** : `date-fns` (tree-shakable). Pas de moment.js.
- **Hash catégorie** : calculé côté serveur (stable) et envoyé dans `booking.service.category`. Pas de hash côté Client.
- **Fonts** : `next/font/google` avec Cinzel 500/600 + Julius 400 + Manrope 400/500/600/700 + Inria italic 300. `display: swap`.
- **`export const dynamic = 'force-dynamic'`** sur `/admin/calendrier`. Pas d'ISR (données toujours fraîches).
- **Cache-Control** : `private, max-age=10, swr=30` sur bookings/months/hours. `no-cache` sur unavails.

---

## 18. Sécurité

| Mesure | Implémentation |
|---|---|
| Auth check layout | `app/admin/layout.tsx` (déjà en place pour dashboard) vérifie `session.user.role === 'ADMIN'` |
| Endpoints `/api/admin/*` | Helper `requireAdmin()` sur **chaque** route handler et server action |
| Server Actions | `'use server'` + `requireAdmin()` first ligne + Zod parse + try/catch + log error |
| Rate-limit applicatif | **In-memory LRU bucket** (cf. dashboard §18). 60 req/min/session. Pas d'Upstash. |
| Headers | `X-Frame-Options: DENY`, `nosniff`, CSP strict (déjà en place) |
| CSRF | NextAuth v5 + double-submit cookie sur server actions |
| Audit log | Toute mutation → `OutboundEvent: AdminActionPerformed` (userId, action, payload digest, IP, UA). **Spécifiquement** : `ToggleBookableMonth`, `SaveBusinessHours`, `CreateUnavailability`, `RedeemGiftCard`, `RefundBooking`, `CancelBooking` ont des events dédiés. |
| Gift card redemption | Lock optimiste : `version` field sur `GiftCard`. UPDATE WHERE id AND version=X. Si rowcount=0 → 409 + toast "Carte déjà modifiée, rechargez". |
| Refund | Idempotency-key côté Stripe : si refund déjà effectué pour ce `bookingId+amountCents+nonce`, no-op. |
| Pas de PII en clair | Codes GC stockés hashés ; affichage masqué `...E5F6` (4 derniers chars seulement). Stripe IDs : ok visibles côté admin. |

---

## 19. Checklist d'intégration (Phase 1)

### Routes & page
- [ ] `app/admin/calendrier/page.tsx` (RSC, Promise.all)
- [ ] `app/admin/calendrier/loading.tsx` (skeleton)
- [ ] `app/admin/calendrier/error.tsx` (boundary)

### Composants — vue calendrier
- [ ] `src/components/admin/calendar/CalendarTabs.tsx`
- [ ] `src/components/admin/calendar/CalendarToolbar.tsx`
- [ ] `src/components/admin/calendar/CalendarMonthView.tsx`
- [ ] `src/components/admin/calendar/CalendarCell.tsx`
- [ ] `src/components/admin/calendar/BookingChip.tsx`
- [ ] `src/components/admin/calendar/CalendarWeekView.tsx` *(Phase 1.5)*
- [ ] `src/components/admin/calendar/CalendarDayView.tsx` *(Phase 1.5)*

### Composants — drawers
- [ ] `src/components/admin/calendar/DayDetailDrawer.tsx`
- [ ] `src/components/admin/calendar/BookingDetailDrawer.tsx`
- [ ] `src/components/admin/calendar/GiftCardRedemptionBlock.tsx`
- [ ] `src/components/admin/calendar/BookingActions.tsx`
- [ ] `src/components/admin/calendar/AdminNotesEditor.tsx`

### Composants — modals (réutilisables)
- [ ] `src/components/admin/modals/RedemptionModal.tsx`
- [ ] `src/components/admin/modals/RefundModal.tsx` *(réutilisé bookings + ebooks + GC)*
- [ ] `src/components/admin/modals/AdminCancelModal.tsx`
- [ ] `src/components/admin/modals/UnavailabilityModal.tsx`
- [ ] `src/components/admin/modals/RecurringUnavailModal.tsx` *(Phase 1.5)*

### Composants — autres tabs
- [ ] `src/components/admin/calendar/BookableMonthsGrid.tsx`
- [ ] `src/components/admin/calendar/BusinessHoursEditor.tsx`
- [ ] `src/components/admin/calendar/UnavailabilityList.tsx`
- [ ] `src/components/admin/calendar/RecurringUnavailabilityList.tsx`

### State
- [ ] `src/stores/admin-calendar.store.ts` (Zustand)
- [ ] `src/hooks/admin-calendar/useBookings.ts`
- [ ] `src/hooks/admin-calendar/useBookableMonths.ts`
- [ ] `src/hooks/admin-calendar/useBusinessHours.ts`
- [ ] `src/hooks/admin-calendar/useUnavailabilities.ts`

### Server actions
- [ ] `src/server/actions/calendar/toggle-bookable-month.action.ts`
- [ ] `src/server/actions/calendar/save-business-hours.action.ts`
- [ ] `src/server/actions/calendar/create-unavailability.action.ts`
- [ ] `src/server/actions/calendar/delete-unavailability.action.ts`
- [ ] `src/server/actions/calendar/create-recurring-unavail.action.ts`
- [ ] `src/server/actions/booking/redeem-gift-card.action.ts`
- [ ] `src/server/actions/booking/refund.action.ts`
- [ ] `src/server/actions/booking/cancel.action.ts`
- [ ] `src/server/actions/booking/complete.action.ts`
- [ ] `src/server/actions/booking/no-show.action.ts`
- [ ] `src/server/actions/booking/update-notes.action.ts`

### Endpoints API (fallback GET)
- [ ] `app/api/admin/calendar/bookings/route.ts`
- [ ] `app/api/admin/calendar/months/route.ts` (+ `[yyyymm]/route.ts` DELETE)
- [ ] `app/api/admin/business-hours/route.ts`
- [ ] `app/api/admin/unavailabilities/route.ts` (+ `[id]/route.ts`)
- [ ] `app/api/admin/recurring-unavailabilities/route.ts` (+ `[id]/route.ts`)

### Schemas Zod
- [ ] `src/schemas/admin/calendar.schemas.ts` (tous les schemas §10)

### Prisma (à vérifier dans schema existant)
- [ ] `BookableMonth` (yyyymm unique, openedAt, openedByUserId)
- [ ] `BusinessHours` (1 ligne par dayOfWeek + isOpen + champs HH:MM)
- [ ] `Unavailability` (fromAt, toAt, isPartial, reason)
- [ ] `RecurringUnavailability` (dayOfWeek, fromTime, toTime, startsOn, endsOn?, reason)
- [ ] `Booking` (status enum + relation `GiftCard` optionnelle)
- [ ] `GiftCard` (`balanceCents`, `version` pour locking optimiste)
- [ ] `OutboundEvent` (events dédiés cités §18)

### Tests
- [ ] `tests/e2e/admin-calendar.access.spec.ts` — redirect login
- [ ] `tests/e2e/admin-calendar.month-view.spec.ts` — render, navigation, filter
- [ ] `tests/e2e/admin-calendar.drawer-booking.spec.ts` — open, contenu, actions
- [ ] `tests/e2e/admin-calendar.gift-card-redemption.spec.ts` — flow complet GC
- [ ] `tests/e2e/admin-calendar.refund.spec.ts` — total + partiel + €/%
- [ ] `tests/e2e/admin-calendar.bookable-months.spec.ts` — toggle on/off
- [ ] `tests/e2e/admin-calendar.business-hours.spec.ts` — édit + save + validation
- [ ] `tests/e2e/admin-calendar.unavailabilities.spec.ts` — CRUD
- [ ] `tests/e2e/admin-calendar.a11y.spec.ts` — axe + clavier
- [ ] `tests/unit/admin-calendar.zod.spec.ts` — tous schemas
- [ ] `tests/unit/booking.gift-card.spec.ts` — concurrent redemption (version locking)

---

## 20. Fichiers sources

| Fichier | Rôle |
|---|---|
| `AdminCalendar.html` | Mock HTML validé v1 — source de vérité visuelle et interactive (4 tabs + drawers + modals) |
| `Design System.html` | Référence DS v1.1 — tokens, composants, typo |
| `admin-calendar-README.md` | Ce document |
| `admin-dashboard-README.md` | Référence shell (AdminSidebar/Topbar inchangés) |

**Statut :** v1 validée. Phase 1 = vue Mois + tabs Months/Hours/Unavail + drawers booking/day + modals Redemption/Refund/Unavailability. Phase 1.5 = vues Semaine/Jour + RecurringUnavailModal + virtualisation conditionnelle. Phase 2 = templates email actions, politique d'annulation paramétrable, multi-membres équipe.
