# Admin Calendar v1 — Notes d'intégration Phase 1

Complément au `admin-calendar-README.md`. Handoff exceptionnel — quelques harmonisations à appliquer lors du portage.

---

## 1. Décisions Phase 0 respectées (rappel)

| Décision | Statut |
|---|---|
| Rate-limit in-memory (pas d'Upstash) | ✓ §18 |
| Server Actions pour mutations admin | ✓ §9 |
| OutboundEvent pour audit | ✓ §18 (events dédiés cités) |
| Pattern admin-shell réutilisé du dashboard | ✓ §6 (référence explicite) |
| Stripe direct flow (pas de "relance acompte") | ✓ implicite (action manuelle absente) |
| DS v1.1 strict | ✓ §2 (8 nuances couleur catégorie = ajout pas déviation) |

---

## 2. ServiceCategory — clarification

Le README propose **8 catégories** : `natural | rallong | soin | art | french | retir | evnmt | autre`.
Notre schema Prisma Phase 0 a **6 catégories** : `POSE_NATURELS | RALLONGEMENT | PACK_SPECIAL | SOIN_MAINS | SOIN_PIEDS | DEPOSE`.

**Résolution** : ce ne sont pas les mêmes concepts.

- **`ServiceCategory` (enum Prisma)** = catégorie métier (6 valeurs), utilisée pour grouper les prestations côté public et pour les filtres administratifs.
- **Palette de couleurs visuelles (1-8)** = slot couleur dans la grid calendrier, attribuée par hash déterministe (`hash(serviceId) % 8`). Indépendant de la catégorie métier.

Le README a confondu les deux. **Décision** :

```ts
// src/lib/admin/category-palette.ts
const PALETTE = [
  'natural', 'rallong', 'soin', 'art',
  'french', 'retir', 'evnmt', 'autre',
] as const;
export type PaletteSlot = typeof PALETTE[number];

export function getColorSlotFor(serviceId: string): PaletteSlot {
  // Hash simple FNV-1a ou djb2 → modulo 8
  let h = 0;
  for (let i = 0; i < serviceId.length; i++) h = ((h << 5) - h) + serviceId.charCodeAt(i) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
```

L'API renvoie `booking.service.colorSlot` calculé côté serveur (stable, ne dépend pas du Client). Le CSS du DS contient `.booking-chip--natural`, `.booking-chip--rallong`, etc. (8 classes de couleur).

→ `booking.service.category` (notre enum métier 6 valeurs) reste utilisé pour le filtre dropdown. Le `colorSlot` (8 valeurs) sert uniquement au rendu visuel.

---

## 3. BookableMonth format — `yyyymm` string vs `year + month` Int

**Handoff propose** : `yyyymm: '2026-05'` (string)
**Notre schema Phase 0** : `year Int + month Int`

**Décision** : garder notre schema (deux Int) pour faciliter les requêtes natives (`WHERE year = 2026 AND month >= 5`).

Helper pour exposer en string côté API :
```ts
// Côté API : transformer pour matcher le contrat handoff
const months = await prisma.bookableMonth.findMany();
return months.map(m => ({
  yyyymm: `${m.year}-${String(m.month).padStart(2, '0')}`,
  openedAt: m.enabledAt.toISOString(),
  openedByUserId: m.enabledById,
  bookingsCount: /* count */,
}));
```

Côté Client : utiliser `yyyymm` en string pour les URLs et la navigation (`?month=2026-05`).

Migration trivial si besoin plus tard (ajout d'une colonne calculée).

---

## 4. GiftCard `version` field — à ajouter au schema

Le README propose un field `version` sur `GiftCard` pour l'optimistic locking lors des redemptions concurrentes (§18).

**Décision** : adopté. Ajouter au schema Phase 0 :

```prisma
model GiftCard {
  // ... champs existants ...
  version Int @default(0)
  // ...
}
```

Logique dans la Server Action `redeemGiftCardAction` :
```ts
const result = await prisma.giftCard.updateMany({
  where: { id, version: currentVersion },
  data: {
    balanceCents: { decrement: amountCents },
    version: { increment: 1 },
  },
});

if (result.count === 0) {
  // Conflict — quelqu'un d'autre a modifié la carte
  return { error: 'CONCURRENT_MODIFICATION', code: 'CONFLICT_409' };
}
```

Pattern équivalent applicable aux autres ressources critiques (Booking en cas d'actions concurrentes admin).

---

## 5. RefundModal — composant partagé multi-contexte

Le README confirme `RefundModal` est **réutilisable** :
- Refund d'une booking (acompte Stripe)
- Refund d'une GiftCard (montant restant non utilisé)
- Refund d'un EbookPurchase

→ À placer dans `src/components/admin/modals/RefundModal.tsx` (pas dans `calendar/`).
→ Props : `target: { kind: 'booking' | 'ebook' | 'gift-card', id: string }`, `originalAmountCents: number`.
→ Logique dispatch côté Server Action `refundAction(target, params)`.

C'est l'occasion de centraliser : créer un dossier `src/components/admin/modals/` partagé entre Calendar, Bookings, Ebooks, GiftCards. Plus de duplication.

---

## 6. Composants à placer hors `calendar/`

Le README mélange volontairement modals partageables et modals spécifiques calendrier. À clarifier au portage :

| Composant | Emplacement |
|---|---|
| `RefundModal` | `src/components/admin/modals/RefundModal.tsx` (partagé) |
| `AdminCancelModal` | `src/components/admin/modals/AdminCancelModal.tsx` (partagé) |
| `RedemptionModal` | `src/components/admin/modals/RedemptionModal.tsx` (partagé — utilisable hors calendar : page détail booking, page cartes cadeau) |
| `UnavailabilityModal` | `src/components/admin/calendar/UnavailabilityModal.tsx` (calendar-specific) |
| `BookingDetailDrawer` | `src/components/admin/bookings/BookingDetailDrawer.tsx` (partagé entre Calendar et page Bookings) |
| `GiftCardRedemptionBlock` | `src/components/admin/bookings/GiftCardRedemptionBlock.tsx` (sub-component du drawer booking) |

Placement plus modulaire → évite la duplication quand on construira `/admin/bookings` plus tard.

---

## 7. Phase 1.5 — différé

Items reportés à Phase 1.5 (post-launch V1) :
- `CalendarWeekView` — vue semaine 7 cols + timeline verticale heures
- `CalendarDayView` — vue jour timeline détaillée
- `RecurringUnavailModal` — création de blocages récurrents (le mock affiche la liste, création différée)
- Virtualisation conditionnelle si > 100 bookings/mois

**Décision** : V1 = vue mois uniquement (suffisante pour un salon avec ~30 bookings/mois). Les vues semaine/jour ajoutent surtout du confort pour des salons à fort volume.

À J0 : le toggle "Mois | Semaine | Jour" est affiché mais les options Semaine/Jour sont en `disabled` + tooltip "Bientôt disponible".

---

## 8. Schemas Prisma — additions/clarifications Phase 1

Items à confirmer/ajouter au schema Phase 0 lors du scaffolding :

| Model | Action |
|---|---|
| `BookableMonth` | ✓ existant (year + month Int) |
| `BusinessHours` | ✓ existant (dayOfWeek + isOpen + 4 fields HH:MM) |
| `Unavailability` | ✓ existant (startsAt + endsAt) — note : le mock utilise `fromAt/toAt` mais notre schema utilise `startsAt/endsAt`. Harmoniser au profit de notre nommage. |
| `RecurringUnavailability` | ✓ existant (dayOfWeek + startTime + endTime + startsFrom + endsAt) |
| `Booking` | ✓ existant + `adminNotes Text?` (déjà prévu) |
| `GiftCard` | + **`version Int @default(0)`** pour optimistic locking |
| `OutboundEvent` | ✓ existant + ajouter types `admin.month_opened`, `admin.month_closed`, `admin.hours_updated`, `admin.unavail_created`, `admin.gift_card_redeemed` |

---

## 9. Endpoints API et Server Actions — répartition

Le README propose **Server Actions** pour les mutations + **routes API** pour les GET (React Query). C'est cohérent. Pattern :

```
Server Actions (mutations, audit-loggées)
└── src/server/actions/calendar/*.action.ts
    └── toggleBookableMonth, saveBusinessHours, createUnavailability, etc.

Routes API (GET, React Query)
└── app/api/admin/calendar/*/route.ts
    └── GET bookings, GET months, GET hours, GET unavailabilities
```

→ Cohérent avec notre architecture inter-app (les routes API restent exposables au hub Management si besoin un jour).

---

## 10. Tests prioritaires — Phase 1

Adopter la checklist du handoff. Top 5 critiques pour valider V1 :

1. **`gift-card-redemption.spec.ts`** — le flow le plus complexe (acompte + post-RDV)
2. **`bookable-months.spec.ts`** — toggle on/off + impact sur dispo public
3. **`business-hours.spec.ts`** — édit + save + validation Zod
4. **`drawer-booking.spec.ts`** — open + contenu + actions complete/cancel/refund
5. **`a11y.spec.ts`** — navigation clavier grid + focus trap drawer

---

## 11. Le pattern admin est désormais figé

Avec Dashboard + Calendar validés, on a **tous les patterns admin** :
- ✓ Admin shell (sidebar + topbar + content area)
- ✓ Header de page (eyebrow + H1 + actions droite)
- ✓ Tabs sticky
- ✓ Tables data + cards mobile responsive
- ✓ Drawers latéraux 480px / fullscreen mobile
- ✓ Modals centrés
- ✓ RefundModal réutilisable
- ✓ Toast notifications
- ✓ Optimistic UI + React Query
- ✓ Server Actions avec audit
- ✓ Empty states + loading skeletons

→ Tous les écrans admin restants (Bookings, Prestations, Photos, Cartes cadeau, Ebooks, Blog, Newsletter, Contacts, Finances, Settings, Logs) sont des **applications de ce pattern** avec des contenus différents. **Pas besoin de mocker** chacun avec Claude Design — on peut les coder directement en Phase 1 sur la base de ces patterns.

---

**Statut** : Phase 0 design **complète**. 5 écrans validés, tous les patterns admin posés, infra ready, decisions architectures consignées. Prêt à attaquer Phase 1.

**Sources** :
- `AdminCalendar.html` — mock visuel canonique (4 tabs + drawers + modals)
- `admin-calendar-README.md` — handoff Claude Design exhaustif (598 lignes)
- `admin-dashboard-README.md` — référence admin-shell
- `integration-notes.md` — ce document (harmonisations + ServiceCategory clarif + version GiftCard)
