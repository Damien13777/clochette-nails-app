# Admin Dashboard v1 — Notes d'intégration Phase 1

Complément au `admin-dashboard-README.md`. Le handoff est très bon dans l'ensemble. Quelques harmonisations à appliquer lors du portage.

---

## 1. Décisions architecture déjà respectées par le handoff

| Décision Phase 0 | Statut dans le handoff |
|---|---|
| Rate-limit in-memory (pas d'Upstash) | ✓ Respecté explicitement §18 |
| RSC + React Query (pas de Zustand sur dashboard) | ✓ Justifié §7 |
| Stripe direct flow (pas de "relance acompte") | ✓ Note métier §4.6 |
| DS v1.1 strict (Cinzel + Julius + Manrope + Inria italique only) | ✓ |
| Manrope dominant côté admin | ✓ html font-family override |
| URLs en français | ✓ /admin, /admin/calendrier, /admin/parametres/horaires, etc. |

Pas d'override nécessaire de ce côté. Aligné avec nos décisions.

---

## 2. Harmonisations naming (Phase 1)

Le README utilise quelques noms qui diffèrent de notre schema Prisma Phase 0. À aligner :

### 2.1 Activity events

**Handoff propose** :
```ts
type ActivityEvent = {
  kind: 'BOOKING_CREATED' | 'DEPOSIT_PAID' | 'GIFT_CARD_PURCHASED'
      | 'CONTACT_RECEIVED' | 'PHOTO_ADDED' | 'EBOOK_PURCHASED';
};
```

**Notre catalogue OutboundEvent Phase 0** (dotted lowercase) :
```
booking.created · booking.confirmed · booking.completed · booking.cancelled
booking.refunded · booking.no_show
ebook.purchased · ebook.refunded
gift_card.purchased · gift_card.redeemed · gift_card.expired · gift_card.refunded
newsletter.subscribed · newsletter.unsubscribed
contact.message_received
```

**Décision** :
- Garder notre format `booking.created` etc. pour le catalogue `OutboundEvent` (cohérent inter-app pour le hub Management).
- Côté UI dashboard, mapper depuis ce catalogue : `BOOKING_CREATED` (label affiché) ← `booking.created` (event source).
- Mapping centralisé dans `src/lib/admin/activity-labels.ts` :

```ts
export const ACTIVITY_LABELS: Record<string, { icon: string; label: string }> = {
  'booking.created':       { icon: 'calendar-plus', label: 'Nouvelle réservation' },
  'booking.confirmed':     { icon: 'check-circle', label: 'Acompte payé' },
  'booking.cancelled':     { icon: 'calendar-x', label: 'Réservation annulée' },
  'ebook.purchased':       { icon: 'book-down', label: 'Ebook acheté' },
  'gift_card.purchased':   { icon: 'gift', label: 'Carte cadeau achetée' },
  'gift_card.redeemed':    { icon: 'gift', label: 'Carte cadeau utilisée' },
  'contact.message_received': { icon: 'mail', label: 'Nouveau message' },
  'newsletter.subscribed': { icon: 'mail-plus', label: 'Nouvelle abonnée' },
};
```

### 2.2 Alert kinds

**Handoff propose** : `GIFT_CARD_EXPIRING | BOOKING_AWAITING | CONTACT_UNREAD | EBOOK_DEPLETED`

**Décision** :
- Garder `GIFT_CARD_EXPIRING`, `BOOKING_AWAITING`, `CONTACT_UNREAD` — pertinents.
- **Retirer `EBOOK_DEPLETED`** : les ebooks sont **numériques illimités** (PDF téléchargeable), pas de stock virtuel. Pas de risque d'épuisement.
- Ajouter potentiellement (Phase 2) :
  - `BOOKING_NO_SHOW` : cliente absente, à marquer manuellement
  - `MONTH_CLOSING_SOON` : prochain mois pas encore ouvert, fermeture imminente
  - `LOW_AVAILABILITY` : <20% de créneaux libres ce mois

### 2.3 Notification types

**Handoff propose** : `BOOKING_CREATED | DEPOSIT_RECEIVED | GIFT_CARD_EXPIRING | MESSAGE_RECEIVED`

**Notre schema Prisma Phase 0** :
```prisma
enum NotificationType {
  NEW_BOOKING
  DEPOSIT_PAID
  EBOOK_SOLD
  BOOKING_CANCELLED
  CONTACT_MESSAGE
  REFUND_PROCESSED
  NEWSLETTER_SUBSCRIBE
}
```

**Décision** :
- Garder le `NotificationType` de notre schema (déjà acté Phase 0).
- Renommer côté UI au besoin (label friendly), mais l'enum DB reste.
- **Ajouter** à l'enum : `GIFT_CARD_EXPIRING` (utile pour la cloche admin quand une carte va expirer dans <30j).

Migration Prisma :
```prisma
enum NotificationType {
  NEW_BOOKING
  DEPOSIT_PAID
  EBOOK_SOLD
  BOOKING_CANCELLED
  CONTACT_MESSAGE
  REFUND_PROCESSED
  NEWSLETTER_SUBSCRIBE
  GIFT_CARD_EXPIRING   // ← ajouté
}
```

### 2.4 ContactMessage : status vs readAt

**Handoff propose** : `ContactMessage` avec `readAt: Date | null`

**Notre schema Phase 0** :
```prisma
enum ContactMessageStatus { NEW READ REPLIED ARCHIVED }

model ContactMessage {
  status     ContactMessageStatus  @default(NEW)
  // ...
  archivedAt DateTime?
}
```

**Décision** :
- Garder l'enum `status` de notre schema (4 états plus riches que juste un booléen "lu/non lu").
- Côté requête dashboard : `where: { status: 'NEW' }` au lieu de `where: { readAt: null }`.

### 2.5 Activity log : table dédiée ou agrégation ?

**Question implicite** : l'endpoint `/api/admin/activity-log` lit où ?

**Décision** :
- Notre table `OutboundEvent` contient déjà tous les events (statut PENDING/DELIVERED/FAILED/ABANDONED). Elle peut servir de source d'activité.
- **Alternative** : créer une table `ActivityLog` dédiée pour la UI admin (denormalisée, optimisée pour lecture rapide).

**Recommandation** : **OutboundEvent suffit pour V1**. Endpoint :

```ts
// GET /api/admin/activity-log?limit=10&period=today
const events = await prisma.outboundEvent.findMany({
  where: {
    type: { in: VISIBLE_ACTIVITY_TYPES },     // filtre les events "visibles" admin
    createdAt: { gte: periodStart(period) },
  },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
```

`VISIBLE_ACTIVITY_TYPES` = `['booking.created', 'booking.confirmed', 'gift_card.purchased', ...]` (exclut les events purement techniques).

Si V2 a besoin d'événements admin internes non liés à des events outbound (ex: "Chloé a modifié les horaires"), on créera `AdminAuditLog` (déjà dans notre schema sous le nom `AuditLog`).

---

## 3. Composants — additions / précisions

### 3.1 Sidebar `nav-config.ts`

Liste des items à mettre dans le fichier :

```ts
// src/components/admin/shell/nav-config.ts
import {
  LayoutDashboard, Calendar, CalendarCheck, Sparkles,
  Image as ImageIcon, Gift, BookText, Newspaper, MailPlus,
  MessageSquare, Wallet, Settings, ScrollText,
} from 'lucide-react';

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Pilotage',
    items: [
      { href: '/admin', icon: LayoutDashboard, label: 'Tableau de bord' },
      { href: '/admin/calendrier', icon: Calendar, label: 'Calendrier' },
      { href: '/admin/bookings', icon: CalendarCheck, label: 'Bookings', badgeKey: 'bookings' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/prestations', icon: Sparkles, label: 'Prestations' },
      { href: '/admin/photos', icon: ImageIcon, label: 'Photos' },
      { href: '/admin/cartes-cadeau', icon: Gift, label: 'Cartes cadeau', badgeKey: 'giftCards' },
      { href: '/admin/ebooks', icon: BookText, label: 'Ebooks' },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { href: '/admin/blog', icon: Newspaper, label: 'Blog' },
      { href: '/admin/newsletter', icon: MailPlus, label: 'Newsletter' },
      { href: '/admin/contacts', icon: MessageSquare, label: 'Contacts', badgeKey: 'contacts' },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/admin/finances', icon: Wallet, label: 'Finances' },
      { href: '/admin/parametres', icon: Settings, label: 'Paramètres' },
      { href: '/admin/logs', icon: ScrollText, label: 'Logs' },
    ],
  },
] as const;
```

Les `badgeKey` permettent à `AdminSidebar` de récupérer le compteur depuis le state global (ex: nombre de bookings AWAITING, cartes cadeau expirantes, messages non lus).

### 3.2 NewMenu (dropdown topbar "Nouveau")

Items proposés par le handoff (à confirmer côté business) :

```ts
[
  { href: '/admin/bookings/new', icon: 'calendar-plus', label: 'Nouvelle réservation (manuelle)' },
  { href: '/admin/prestations/new', icon: 'sparkles', label: 'Nouvelle prestation' },
  { href: '/admin/calendrier?action=add-slot', icon: 'clock', label: 'Ajouter un créneau' },
  { href: '/admin/photos?action=upload', icon: 'image-plus', label: 'Ajouter une photo' },
  { href: '/admin/ebooks/new', icon: 'book-down', label: 'Nouvel ebook' },
  { href: '/admin/blog/new', icon: 'newspaper', label: 'Nouvel article' },
]
```

---

## 4. Helpers à mutualiser

### 4.1 `requireAdmin()`

```ts
// src/lib/admin/require-admin.ts
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

// Pour Server Components
export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/admin/connexion?callbackUrl=' + encodeURIComponent('/admin'));
  }
  return session;
}

// Pour Route Handlers
export async function requireAdminApi() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Accès refusé', code: 'AUTH_FORBIDDEN' },
      { status: 403 }
    );
  }
  return session;
}
```

### 4.2 Rate-limit admin (in-memory bucket)

```ts
// src/lib/admin/rate-limit.ts
import { LRUCache } from 'lru-cache';

const limiter = new LRUCache<string, { count: number; resetAt: number }>({
  max: 5_000,
  ttl: 60_000,
});

const MAX_PER_MINUTE = 60;

export function checkAdminRateLimit(sessionId: string): { allowed: boolean } {
  const now = Date.now();
  const entry = limiter.get(sessionId);
  if (!entry || entry.resetAt < now) {
    limiter.set(sessionId, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }
  if (entry.count >= MAX_PER_MINUTE) return { allowed: false };
  entry.count++;
  return { allowed: true };
}
```

---

## 5. Tests prioritaires Phase 1

Adopter la checklist du handoff. Priorité :

1. **access.spec.ts** — non-auth → redirect login (sécurité de base)
2. **render.spec.ts** — toutes les sections RSC se rendent
3. **notifications.spec.ts** — polling + mark-read fonctionnel
4. **mobile-drawer.spec.ts** — burger + sidebar drawer + Esc
5. **a11y.spec.ts** — axe-core + focus order + nav clavier

---

## 6. Refactos pour les écrans admin suivants

Le handoff définit le **pattern admin-shell** réutilisable. Tous les écrans admin suivants (Calendrier, Bookings, Prestations, Photos, etc.) hériteront via `app/admin/layout.tsx` qui rend `<AdminShell>`. **Aucun re-design** de la sidebar/topbar n'est nécessaire.

Pattern par page admin :
```tsx
// app/admin/[any-section]/page.tsx
export default async function Page() {
  await requireAdminPage();
  const data = await fetchSectionData();
  return (
    <PageHeader title="…" eyebrow="…" actions={...} />
    <SectionContent data={data} />
  );
}
```

Le `<AdminShell>` (sidebar + topbar) est appliqué par le `layout.tsx` parent, pas répété par page.

---

## 7. Décisions naming finales (synthèse)

| Concept | Notre choix |
|---|---|
| Types d'events catalog | `booking.created`, `booking.confirmed`, `gift_card.redeemed`, etc. (dotted lowercase) |
| NotificationType enum DB | `NEW_BOOKING`, `DEPOSIT_PAID`, etc. (UPPER_SNAKE) + ajout `GIFT_CARD_EXPIRING` |
| Alert kinds (UI dashboard) | `GIFT_CARD_EXPIRING`, `BOOKING_AWAITING`, `CONTACT_UNREAD` (retirer `EBOOK_DEPLETED`) |
| ContactMessage state | enum `status: NEW \| READ \| REPLIED \| ARCHIVED` (pas juste `readAt`) |
| Activity source | `OutboundEvent` table (pas de table `ActivityLog` dédiée) |

---

**Statut** : décisions consignées, pattern admin-shell ready, prêt pour Phase 1.

**Sources** :
- `AdminDashboard.html` — mock visuel canonique (admin-shell + sections)
- `admin-dashboard-README.md` — handoff Claude Design (référence design)
- `integration-notes.md` — ce document (harmonisations Phase 1)
