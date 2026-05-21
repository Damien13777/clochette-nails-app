# Admin · Tableau de bord — Handoff dev (v1)

> Page `/admin` · Clochette Nails · Référence : `Design System.html` (v1.1) + `AdminDashboard.html` (mock validé)
> Cible : Next.js 16 App Router · NextAuth v5 · Prisma 7 · Tailwind v4

---

## 1. Overview

| | |
|---|---|
| **Objectif business** | Point central de pilotage : RDV à venir, CA, alertes, activité récente, raccourcis. Pose le pattern admin-shell décliné sur 10+ écrans (Calendrier, Bookings, Prestations, Photos, Ebooks, Blog, Cartes cadeau, Newsletter, Contacts, Finances, Settings, Logs). |
| **Cible** | Chloé (rôle ADMIN unique). Accès post-login uniquement. |
| **Route** | `app/admin/page.tsx` sous `app/admin/layout.tsx` (admin-shell). |
| **Stack styles** | Tailwind v4 (`@theme`) + DS v1.1. Manrope dominant. Cinzel pour H1/H2/dates/KPI values. Julius Sans One pour eyebrows/labels/badges/boutons. Inria Serif **uniquement** pour `<em>` italique des prénoms (Cinzel n'a pas d'italique). |
| **Ratio Server/Client** | `AdminShell` + page `/admin` = RSC qui fait `Promise.all` des 4 fetches. Chaque section critique (Bookings, Alerts, Activity, Notifications) enveloppée dans `<Suspense>` avec skeleton. Dropdowns (Bell, User, New) = Client islands. |
| **Lighthouse cible** | Performance ≥ 92 · Accessibility ≥ 98 · Best Practices ≥ 95 · SEO N/A. |

---

## 2. Déviations DS v1.1

**Aucune déviation — DS v1.1 strictement respecté.**

Notes admin-shell :
- `html { font-family: var(--font-ui); }` (Manrope) au lieu du `--font-sans` (Inria) public.
- Inria Serif chargée uniquement en variante `1,300` (italic light) pour le rendu `<em>` des prénoms (Cinzel n'a pas d'italique → fallback DS standard).
- Pas de poids hors quatuor DS, pas de couleur hors palette.

---

## 3. Sections de la page

| # | Anchor | Description |
|---|---|---|
| — | sidebar | Navigation principale 260px (13 entrées, 4 groupes) + footer version/logout |
| — | topbar | Search 360px + Nouveau dropdown + Bell + Avatar |
| 1 | `header-dashboard` | Eyebrow + H1 "Bonjour *Chloé*" + date du jour |
| 2 | `kpi-strip` | 4 KPIs (RDV semaine · CA mois · GC actives · Bookings attente) |
| 3 | `upcoming-bookings` | Table 5 prochains RDV (table desktop / cards mobile) |
| 4 | `alerts` | Liste cards d'alertes (GC expirantes, bookings AWAITING, msgs, stocks ebook) |
| 5 | `activity` | Timeline 10 entrées + tabs (Aujourd'hui/Semaine/Mois) |
| 6 | `quick-actions` | Grid 4 raccourcis (Ouvrir mois / Bloquer / Créer presta / Newsletter) |

---

## 4. Détail par section

### 4.0 Admin shell (réutilisable sur tous les écrans admin)
- **Sidebar** desktop fixe 260px, `border-right` line. Liens `.admin-nav-link` : icône Lucide 18px stroke 1.5 + label Manrope 500. Active state : `background: var(--color-violet-50)` + bandeau vertical 3px violet 600 à gauche + texte violet 700. Hover : violet-50 + violet 700. Badges latéraux possibles (compteurs). Groupes : Pilotage / Catalogue / Contenu / Système (eyebrows Julius Sans One).
- **Sidebar mobile** : transformée en drawer (`transform: translateX(-100%)`), trigger burger en topbar, backdrop `rgba(26,26,26,.4)` ; `Esc` ferme.
- **Topbar** 64px sticky : burger (mobile) · search 360px max avec hint `⌘ K` · `flex-1` · Bouton `Nouveau` (dropdown) · Bell (dot rouge + popover 5 notifs) · Avatar `C` (popover profil/settings/logout).

### 4.1 Header dashboard
- `section-eyebrow` "Espace administration" · H1 Cinzel "Bonjour *Chloé*" (italique sur prénom = Inria Serif italic via `h1 em` du DS) · sous-titre Manrope date du jour formatée FR.

### 4.2 KPI strip
- Grid : `grid-cols-2 lg:grid-cols-4 gap-4` · stagger fade-up.
- Card : icône violet 100 (40px) + delta % en haut · gros chiffre Cinzel `1.875rem` + label Julius Sans One.
- Anim count-up 700ms ease-out cubic au mount.
- KPI #4 (bookings en attente) : couleur danger/warning si > 0, neutre sinon.

### 4.3 Prochains rendez-vous
- Card, `lg:col-span-2`. Header section avec lien "Voir tous →".
- **Desktop** : `<table class="data-table">` 6 colonnes (Date, Cliente, Prestation, Durée, Statut, Action). `<caption class="sr-only">` + `<th scope="col">`. Hover row violet-50.
- **Mobile** : empilées en cards verticales (date Cinzel + cliente + presta + badge statut).
- Date Cinzel inline `15px` + heure ink-500 xs.
- Badge `GC` violet à côté du nom si carte cadeau utilisée.
- Statut : `badge-success` (Confirmé) / `badge-warning` (En attente).

### 4.4 Alertes
- `aside.card` 1/3 desktop. Header avec compteur badge warning.
- Rows : `.alert-row` (icône colorée pastille + titre + ligne contexte + chevron). Hover : bordure + bg violet 50.
- 3 types pastille : `alert-warning` (orange) / `alert-info` (violet) / `alert-danger` (rouge).
- **Empty state** (si 0 alerte) : icône check-circle vert + texte "Tout va bien" centré (à implémenter en Phase 1).

### 4.5 Activité récente
- Card full-width. Tabs pills "Aujourd'hui / Cette semaine / Ce mois" (filtre côté Client via React Query refetch).
- Liste `<ol>` timeline (chaque `<li>` : pastille icon 32px + titre + sous-ligne meta time).
- 10 entrées max + lien "Voir le journal complet" → `/admin/logs`.

### 4.6 Raccourcis
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` · stagger fade-up.
- Card hoverable : icône violet 100 + titre Cinzel + 1 ligne desc + arrow translateX au hover.
- **Sans doublon avec le menu `Nouveau` de la topbar** : ce dernier couvre les créations d'entités (booking, prestation, créneau, photo, ebook, article). Les raccourcis du bas couvrent des **actions opérationnelles** complémentaires.

| # | Titre | Icône | Sous-ligne | Cible route |
|---|---|---|---|---|
| 1 | Bloquer une période | `ban` | Vacances, formation, indisponibilité | `/admin/calendrier?action=block` |
| 2 | Configurer les horaires | `clock` | Plages d'ouverture du salon | `/admin/parametres/horaires` |
| 3 | Exporter la compta | `file-down` | CSV des paiements du mois | `/admin/finances/export?period=current-month` |
| 4 | Envoyer une newsletter | `send` | Composer et envoyer aux abonnées | `/admin/newsletter/new` |

> Note métier : les acomptes étant prélevés directement à la réservation par la cliente (Stripe synchrone), il n'y a **pas de raccourci de relance** côté admin. Le statut `AWAITING_DEPOSIT` reste possible pour les bookings créées manuellement par Chloé (cas marginal) et reste affichable dans l'alerte dédiée, mais ne fait pas l'objet d'un raccourci.

---

## 5. Composants DS réutilisés

| Classe / Token | Usage |
|---|---|
| `.btn .btn-primary` / `.btn-sm` | Bouton "Nouveau" topbar |
| `.btn-ghost` | Boutons "Tout marquer lu", footer sidebar |
| `.btn-icon-only` (via `.icon-btn`) | Bell, avatar, eye action table |
| `.card` / `.card-padded` / `.card-hoverable` | Sections + raccourcis |
| `.badge .badge-violet/-success/-warning/-danger/-outline/-gold` | Statuts bookings, compteurs, GC tag |
| `.input` | Search topbar |
| `.section-eyebrow` | Eyebrow header + dans popover |
| `--color-violet-600/700/100/50/300` | Accent UI |
| `--color-gold-50/300/600` | Timeline gift card (timeline icon) |
| `--color-success/warning/danger` | Statuts + KPI #4 + alerts |
| `--font-serif / display / ui / italic` | Cinzel · Julius Sans One · Manrope · Inria italic (em uniquement) |
| `--radius-sm/md/lg/pill` | Inputs / cards / chips / boutons |
| `--shadow-xs/sm/md/lg/focus` | Cards / hover / popover / focus |

---

## 6. Composants spécifiques

À placer dans `src/components/admin/`.

### Shell (réutilisé sur tous les écrans admin)

| Composant | Type | Responsabilités | Props |
|---|---|---|---|
| `AdminLayout` (app/admin/layout.tsx) | Server | Vérifie session ADMIN, render `<AdminShell>`. Redirect `/admin/connexion?callbackUrl=…` si pas connecté. | `children` |
| `AdminShell` | Server | Compose `<AdminSidebar>` + `<AdminTopbar>` + `<main>`. | `children`, `user` |
| `AdminSidebar` | Client (état drawer) | Nav verticale, gère drawer mobile. Items définis dans `nav-config.ts`. | `currentPath`, `badges: { bookings?: number, giftCards?: number, contacts?: number }` |
| `AdminNavLink` | Client | Lien avec active state, badge optionnel. | `href`, `icon`, `label`, `badge?`, `isActive` |
| `AdminTopbar` | Client | Burger + AdminSearch + NewMenu + NotificationBell + UserMenu. | `user`, `unreadCount` |
| `AdminSearch` | Client | Input + `⌘K` shortcut, ouvre Cmdk palette future. | — |
| `NewMenu` | Client | Dropdown "Nouveau" (6 actions). | — |
| `NotificationBell` | Client | Bouton + bell-dot + popover 5 notifs récentes. Polling 30s. | `initialNotifications` |
| `UserMenu` | Client | Avatar + popover profil/settings/logout. | `user` |

### Dashboard

| Composant | Type | Responsabilités | Props |
|---|---|---|---|
| `DashboardPage` (app/admin/page.tsx) | Server | `Promise.all([fetchStats, fetchBookings, fetchAlerts, fetchActivity])`. | — |
| `KpiCard` | Server | Card unique d'un KPI. Count-up = Client island wrapper `<CountUp>` autour de la valeur. | `icon`, `label`, `value`, `delta?`, `tone?: 'neutral'|'warning'` |
| `CountUp` | Client | Anime un nombre 0→target sur mount (cubic ease, 700ms). | `value`, `duration?`, `format?` |
| `UpcomingBookingsTable` | Server | Table 5 RDV. Sub-component `BookingRow`. | `bookings: BookingSummary[]` |
| `BookingRow` | Server | Une ligne (table desktop / card mobile via media query). | `booking` |
| `AlertsList` | Server | Liste cards alertes. Empty state si vide. | `alerts: Alert[]` |
| `AlertRow` | Server | Une row alerte. | `alert` |
| `ActivityTimeline` | Client | Timeline + tabs. Refetch via React Query au changement de tab. | `initialData`, `initialPeriod: 'today'\|'week'\|'month'` |
| `QuickActionsGrid` | Server | Grid 4 cards. Liens vers routes admin. | — |

---

## 7. State management

**Recommandation : RSC + React Query côté Client pour les sections live.**

- **RSC** charge l'état initial via `Promise.all` parallèle (stats, bookings, alerts, activity).
- **React Query** côté Client uniquement pour :
  - `NotificationBell` : polling `staleTime: 30s`, `refetchInterval: 30000`.
  - `ActivityTimeline` : refetch au changement de tab.
  - `AlertsList` : refetch on focus + interval 60s (optionnel Phase 2).
- Pas de Zustand : pas d'état global partagé sur cette page.
- État UI (drawer, dropdowns) : `useState` local dans chaque composant.

```ts
// QueryClient provider
<QueryClientProvider client={queryClient}>
  {/* admin pages */}
</QueryClientProvider>
```

---

## 8. API calls

| Méthode | URL | Trigger | Réponse type |
|---|---|---|---|
| `GET` | `/api/admin/stats?period=week,month` | RSC mount | `DashboardStats` |
| `GET` | `/api/admin/bookings?status=CONFIRMED,AWAITING_DEPOSIT&upcoming=true&limit=5` | RSC mount | `BookingSummary[]` |
| `GET` | `/api/admin/alerts` | RSC mount | `Alert[]` |
| `GET` | `/api/admin/activity-log?limit=10&period=today` | RSC + refetch tab | `ActivityEvent[]` |
| `GET` | `/api/admin/notifications?limit=5&unreadOnly=false` | Polling 30s Client | `Notification[]` |
| `POST` | `/api/admin/notifications/mark-read` | Click "Tout marquer lu" | `{ ok: true }` |

### Types

```ts
export type DashboardStats = {
  weekBookings: { current: number; delta: number };        // delta = % vs semaine n-1
  monthRevenue: { currentCents: number; delta: number };
  activeGiftCards: { count: number; remainingCents: number; delta: number };
  pendingBookings: { count: number };
};

export type BookingSummary = {
  id: string;
  startAt: string;        // ISO
  client: { firstname: string; lastname: string; email: string };
  serviceName: string;
  optionsLabel?: string;
  durationMin: number;
  status: 'CONFIRMED' | 'AWAITING_DEPOSIT';
  hasGiftCard: boolean;
};

export type Alert = {
  id: string;
  kind: 'GIFT_CARD_EXPIRING' | 'BOOKING_AWAITING' | 'CONTACT_UNREAD' | 'EBOOK_DEPLETED';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  context: string;
  href: string;
};

export type ActivityEvent = {
  id: string;
  kind: 'BOOKING_CREATED' | 'DEPOSIT_PAID' | 'GIFT_CARD_PURCHASED' | 'CONTACT_RECEIVED' | 'PHOTO_ADDED' | 'EBOOK_PURCHASED';
  actor: { name?: string; anonymous?: boolean };
  meta: Record<string, string | number>;
  occurredAt: string;
};

export type Notification = {
  id: string;
  kind: 'BOOKING_CREATED' | 'DEPOSIT_RECEIVED' | 'GIFT_CARD_EXPIRING' | 'MESSAGE_RECEIVED';
  title: string;
  occurredAt: string;
  readAt: string | null;
  href: string;
};
```

### Gestion d'erreur
- RSC : `try/catch` autour de `Promise.allSettled` ; chaque section affiche son erreur isolément (`<SectionError onRetry />`).
- Client (React Query) : `onError` toast + bouton retry sur la card. Stale data conservée.

---

## 9. Server Actions

Dashboard **read-only** → **pas de server action obligatoire**. Cas pertinents :

- `markAllNotificationsReadAction(userId)` — alternative au POST endpoint.
- `dismissAlertAction(alertId)` — futur Phase 2.

Toutes les mutations passent par les routes API standard.

---

## 10. Schemas Zod

Optionnel mais recommandé pour valider les réponses API côté Client (defense in depth).

```ts
import { z } from "zod";

export const dashboardStatsSchema = z.object({
  weekBookings: z.object({ current: z.number().int(), delta: z.number() }),
  monthRevenue: z.object({ currentCents: z.number().int(), delta: z.number() }),
  activeGiftCards: z.object({ count: z.number().int(), remainingCents: z.number().int(), delta: z.number() }),
  pendingBookings: z.object({ count: z.number().int() }),
});

export const bookingSummarySchema = z.object({
  id: z.string().uuid(),
  startAt: z.string().datetime(),
  client: z.object({ firstname: z.string(), lastname: z.string(), email: z.string().email() }),
  serviceName: z.string(),
  optionsLabel: z.string().optional(),
  durationMin: z.number().int().positive(),
  status: z.enum(['CONFIRMED', 'AWAITING_DEPOSIT']),
  hasGiftCard: z.boolean(),
});

export const alertSchema = z.object({
  id: z.string(),
  kind: z.enum(['GIFT_CARD_EXPIRING','BOOKING_AWAITING','CONTACT_UNREAD','EBOOK_DEPLETED']),
  severity: z.enum(['info','warning','danger']),
  title: z.string(),
  context: z.string(),
  href: z.string(),
});

export const activityEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['BOOKING_CREATED','DEPOSIT_PAID','GIFT_CARD_PURCHASED','CONTACT_RECEIVED','PHOTO_ADDED','EBOOK_PURCHASED']),
  actor: z.object({ name: z.string().optional(), anonymous: z.boolean().optional() }),
  meta: z.record(z.union([z.string(), z.number()])),
  occurredAt: z.string().datetime(),
});
```

---

## 11. Real-time updates

**Polling, pas WebSockets** (volume faible, simplicité).

| Composant | Stratégie | Intervalle |
|---|---|---|
| `NotificationBell` | React Query `refetchInterval` | 30 s |
| `AlertsList` | React Query `refetchOnWindowFocus` + interval optionnel | 60 s (Phase 2) |
| `ActivityTimeline` | Refetch manuel au changement de tab + `refetchOnWindowFocus` | — |
| `KPIs` + `UpcomingBookings` | RSC, pas de polling — refresh via `router.refresh()` au focus tab | — |

Header `Cache-Control: private, max-age=10, stale-while-revalidate=30` côté API pour limiter la charge backend.

**Tactful polling** : pas de spinner intrusif ; mise à jour silencieuse + indicateur badge dot sur la cloche si nouvelle notif.

---

## 12. États d'erreur

| État | UI |
|---|---|
| **Loading initial** (RSC) | Skeleton shimmer dans `<Suspense fallback>` : KPI 4 cards grises, table 5 rows skeleton, alerts 4 rows skeleton, timeline 5 rows skeleton |
| **Empty bookings** | "Aucun rendez-vous à venir" + lien "Ouvrir un créneau" |
| **Empty alerts** | Icône `check-circle` vert + "Tout va bien" centré |
| **Empty activity** | "Aucune activité sur cette période" + tab fallback |
| **Erreur fetch section** | Card avec icône `alert-triangle` + message FR + bouton "Réessayer" (refetch) |
| **Erreur réseau global** | Toast `useToast()` "Connexion impossible. Réessayez." |
| **403 Session expirée** | Middleware redirect → `/admin/connexion?callbackUrl=/admin` |

---

## 13. Responsive

| Breakpoint | Layout |
|---|---|
| `< 640` | Sidebar drawer · topbar minimal (burger + Nouveau icon-only + bell + avatar) · KPI 2x2 · sections empilées · bookings en cards (pas de table) |
| `640-767` | Sidebar drawer · search topbar visible · KPI 2x2 · sections empilées |
| `768-1023` | Sidebar drawer · KPI 4x1 · bookings en table · alertes empilées sous bookings |
| `≥ 1024` | Sidebar fixe 260px · KPI 4x1 · bookings 2/3 + alertes 1/3 · quick actions 4x1 |

---

## 14. Animations

| Trigger | Effet | Implémentation |
|---|---|---|
| Mount sections | fade-up 8px 400ms | `@keyframes fadeUp` + classe `.anim-fade-up` |
| Mount grids (KPI + raccourcis) | stagger 60ms par enfant | `.stagger > *:nth-child(N)` delay |
| KPI values | count-up 0 → target, cubic-ease-out 700ms | JS `requestAnimationFrame` |
| Hover KPI / Card hoverable | translateY(-2px) + shadow-md + border violet-300 | CSS transition `.25s` |
| Hover row table | bg violet-50 | CSS transition `.15s` |
| Sidebar drawer mobile | translateX(-100% ↔ 0) 300ms | CSS transition |
| Dropdowns | opacity + translateY(-4px → 0) 200ms | CSS transition `.popover.is-open` |
| Nav active bar | bandeau 3px violet fade-in | pseudo `::before` + bg transition |
| Quick action arrow | translateX(3px) + color violet | hover CSS `.25s` |
| `prefers-reduced-motion` | Toutes anims off, opacity 1, transform none | media query global |

---

## 15. Accessibilité

- **Sidebar** : `<aside aria-label="Navigation principale">` + `<nav role="navigation">`. Active item : `aria-current="page"`. Badges latéraux ont leur compte dans le `aria-label` du lien parent ("Bookings · 3 en attente").
- **Topbar** : search en `<div role="search">` + `<label class="sr-only">` + `<input type="search">`. Raccourci `⌘K`/`Ctrl+K` capté côté JS.
- **Bell** : `aria-label="3 notifications non lues"` dynamique. Popover `role="dialog" aria-modal="false"`.
- **Avatar dropdown** : bouton `aria-haspopup="menu" aria-expanded` + panel `role="menu"`.
- **Tables** : `<caption class="sr-only">` + `<th scope="col">` + chaque action `aria-label`.
- **Empty states** : focus visible sur le CTA primaire.
- **Tabs activité** : `role="tablist"` + chaque pill `role="tab" aria-selected aria-controls`.
- **Drawer mobile** : trap focus + `Esc` ferme + `aria-hidden` sur le contenu derrière.
- **Polling** : silencieux, aucune live region. Une nouvelle notif déclenche un `aria-live="polite"` sur le badge (annonce discrète).
- **Contrast** : tous textes ink-500 sur paper ≥ AA. Badges vérifiés sur leur bg.
- **prefers-reduced-motion** : toutes animations désactivées (cf. §14).

---

## 16. SEO

```ts
export const metadata: Metadata = {
  title: "Tableau de bord · Administration",
  robots: { index: false, follow: false },
};
```

Pas de JSON-LD. Pas de canonical. Pas d'OG. Page strictement privée.

---

## 17. Performance

- **RSC + `Promise.all` parallèle** : les 4 fetches partent en concurrence côté server, jamais en cascade.
- **`Suspense` par section** : KPI strip + bookings + alertes + activity ont chacune leur boundary → première section ready = stream du HTML sans attendre les autres.
- **`loading.tsx`** : skeleton complet du shell + sections (`app/admin/loading.tsx`).
- **LCP** : H1 "Bonjour Chloé" (texte). Fonts préchargées (`next/font/google` avec Cinzel 500, Julius Sans One 400, Manrope 400/500/600, Inria Serif italic 300 — uniquement les poids utilisés).
- **Code-split** : `NotificationBell`, `UserMenu`, `NewMenu`, `AdminSearch` = Client islands isolés. `CountUp` micro-component (~0.5kB).
- **React Query** config : `staleTime: 30s` par défaut, `gcTime: 5min`, `refetchOnWindowFocus: true`, `retry: 1`.
- **Cache API** : `Cache-Control: private, max-age=10, swr=30` sur `/api/admin/stats` et `/api/admin/notifications`. `no-cache` sur `/api/admin/alerts`.
- **Pas d'ISR** : `export const dynamic = 'force-dynamic'` sur `/admin`. Données toujours fraîches.
- **Images** : aucune sur le dashboard (icônes Lucide en SVG inline). Avatar = initiales texte.

---

## 18. Sécurité

| Mesure | Implémentation |
|---|---|
| Auth check layout | `app/admin/layout.tsx` : `const session = await auth()` ; redirect si `!session || session.user.role !== 'ADMIN'` |
| Middleware (`proxy.ts`) | Matche `/admin/:path*` (sauf `/admin/connexion`, `/admin/mot-de-passe-oublie`) → redirect login |
| Endpoints admin | Tous protégés par helper `requireAdmin()` dans chaque route handler (vérifie `auth()` + role) |
| Rate-limit applicatif | **In-memory token bucket** (LRU `node-cache` ou `lru-cache`) sur endpoints admin, max 60 req/min par session. Moins critique car endpoints session-protected. Pas d'Upstash. |
| Headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP strict (pas d'inline script en prod, nonce-based) |
| CSRF | NextAuth v5 protège les actions implicitement. Pour `POST /api/admin/*` : double-submit cookie pattern (helper `csrfGuard()`). |
| Cookies session | `HttpOnly`, `Secure`, `SameSite=Lax` |
| Logs admin | Toute action admin (mutations) → `OutboundEvent: AdminActionPerformed` (userId, route, IP, UA, payload digest) |
| Pas de leak données client | Réponses API filtrent : pas de hash mdp, pas de tokens internes, IPs masquées dans le log |
| Sanitization | Données utilisateur (noms, messages) toujours rendues via React (auto-escape). Pas de `dangerouslySetInnerHTML`. |

---

## 19. Checklist d'intégration (Phase 1)

### Layout & shell
- [ ] `app/admin/layout.tsx` (RSC, vérif session, render AdminShell)
- [ ] `app/admin/loading.tsx` (skeleton complet)
- [ ] `app/admin/error.tsx` (boundary erreur globale)
- [ ] `src/components/admin/shell/AdminShell.tsx`
- [ ] `src/components/admin/shell/AdminSidebar.tsx`
- [ ] `src/components/admin/shell/AdminNavLink.tsx`
- [ ] `src/components/admin/shell/AdminTopbar.tsx`
- [ ] `src/components/admin/shell/AdminSearch.tsx`
- [ ] `src/components/admin/shell/NewMenu.tsx`
- [ ] `src/components/admin/shell/NotificationBell.tsx`
- [ ] `src/components/admin/shell/UserMenu.tsx`
- [ ] `src/components/admin/shell/nav-config.ts` (config items sidebar)

### Dashboard
- [ ] `app/admin/page.tsx` (RSC, Promise.all fetches)
- [ ] `src/components/admin/dashboard/DashboardHeader.tsx`
- [ ] `src/components/admin/dashboard/KpiCard.tsx`
- [ ] `src/components/admin/dashboard/CountUp.tsx` (Client)
- [ ] `src/components/admin/dashboard/UpcomingBookingsTable.tsx`
- [ ] `src/components/admin/dashboard/BookingRow.tsx`
- [ ] `src/components/admin/dashboard/AlertsList.tsx`
- [ ] `src/components/admin/dashboard/AlertRow.tsx`
- [ ] `src/components/admin/dashboard/ActivityTimeline.tsx` (Client)
- [ ] `src/components/admin/dashboard/QuickActionsGrid.tsx`

### Endpoints API
- [ ] `app/api/admin/stats/route.ts` (GET)
- [ ] `app/api/admin/bookings/route.ts` (GET avec filtres)
- [ ] `app/api/admin/alerts/route.ts` (GET, agrège GC expirantes / bookings AWAITING / contacts unread / ebooks épuisés)
- [ ] `app/api/admin/activity-log/route.ts` (GET avec `?period=today|week|month`)
- [ ] `app/api/admin/notifications/route.ts` (GET + POST mark-read)

### Helpers
- [ ] `src/lib/admin/require-admin.ts` (guard role ADMIN)
- [ ] `src/lib/admin/rate-limit.ts` (in-memory LRU bucket, 60 req/min)
- [ ] `src/lib/admin/csrf-guard.ts` (double-submit cookie)
- [ ] `src/schemas/admin/dashboard.ts` (Zod)

### React Query
- [ ] `src/components/providers/QueryProvider.tsx` (QueryClientProvider)
- [ ] Wraps `app/admin/layout.tsx`

### Schemas Prisma (existants à vérifier)
- [ ] `Booking` (avec status enum + relation gift card)
- [ ] `GiftCard` (avec expiresAt + remainingCents)
- [ ] `ContactMessage` (avec readAt)
- [ ] `Ebook` (avec virtualStock)
- [ ] `Notification` (par user, readAt nullable)
- [ ] `OutboundEvent` + `ActivityLog`

### Tests
- [ ] `tests/e2e/admin-dashboard.access.spec.ts` — redirect login si non auth
- [ ] `tests/e2e/admin-dashboard.render.spec.ts` — toutes les sections présentes
- [ ] `tests/e2e/admin-dashboard.notifications.spec.ts` — polling + mark-read
- [ ] `tests/e2e/admin-dashboard.tabs.spec.ts` — switch tab activity → refetch
- [ ] `tests/e2e/admin-dashboard.mobile-drawer.spec.ts` — burger + drawer
- [ ] `tests/e2e/admin-dashboard.a11y.spec.ts` — axe-core scan, focus order, tab keyboard
- [ ] `tests/unit/admin.rate-limit.spec.ts` — LRU bucket comportement

---

## 20. Fichiers sources

| Fichier | Rôle |
|---|---|
| `AdminDashboard.html` | Mock HTML validé v1 — source de vérité visuelle et interactive (admin-shell + sections) |
| `Design System.html` | Référence DS v1.1 — tokens, composants, typo |
| `admin-dashboard-README.md` | Ce document |

**Statut :** v1 validée, prête au portage Phase 1. Le pattern admin-shell sera repris à l'identique sur tous les écrans `/admin/*`.
