# CLAUDE.md

Guide pour Claude Code (claude.ai/code) quand il travaille sur ce repo.

## Projet en 1 paragraphe

Site vitrine + app de réservation pour le salon de prothésie ongulaire
**Clochette Nails** (Moncoutant-sur-Sèvre, France). Public consulte le site,
réserve un RDV avec acompte Stripe, achète des cartes cadeau, achète des ebooks.
L'admin (Chloé) gère prestations, RDV, photos portfolio, blog, ebooks, cartes
cadeau, contacts, paramètres et campagnes newsletter depuis `/admin`.

Réécriture complète d'une v1 PHP qui vit dans `../clochette-nails/`. Cette v2
est en local-only à ce stade — pas encore déployée.

## Stack

- **Next.js 16.2.6** (App Router, Turbopack en dev, Server Components + Server Actions)
- **React 19**, **TypeScript 5**
- **Prisma 7** + Postgres (driver `@prisma/adapter-pg` + `pg`)
- **NextAuth v5 beta** (admin uniquement à ce stade, table CLIENT préparée pour J+6mois)
- **Stripe** Checkout + webhooks (paiement acomptes RDV + cartes cadeau + ebooks)
- **Resend** + templates HTML maison (cf. `src/lib/email/`)
- **TipTap 3** WYSIWYG (blog, ebooks, newsletter)
- **Tailwind v4** via `@tailwindcss/postcss` (pas de `tailwind.config.*`, theme dans `globals.css` via `@theme`)
- **Sharp** pour traitement images (covers, photos, etc.)
- **pnpm 11** comme package manager

## Commandes

```
pnpm dev               # serveur dev Next.js (Turbopack)
pnpm build             # build prod
pnpm lint              # ESLint
pnpm db:push           # sync Prisma schema → DB (dev only, pas de migration formelle)
pnpm db:generate       # régénère le client Prisma
pnpm db:seed           # seed dev
pnpm db:studio         # UI Prisma Studio
```

**Hook `postinstall`** : `prisma generate` est exécuté automatiquement après
chaque `pnpm install`. Si tu vois `Cannot find module '.prisma/client/default'`,
relance `pnpm db:generate`.

## Layout des dossiers

```
src/
  app/
    page.tsx                          # landing publique
    admin/
      (protected)/                    # tout l'admin (auth middleware)
        bookings/                     # RDV
        prestations/                  # services + options
        photos/                       # portfolio + covers prestations + site media
        cartes-cadeau/                # gift cards (admin)
        ebooks/                       # catalogue + ventes
        blog/                         # articles
        newsletter/                   # abonnées + campagnes
        contacts/                     # messages contact
        logs/                         # audit log viewer
        notifications/                # cloche d'admin
        parametres/                   # PlatformSettings + email globals
        calendrier/                   # vue calendrier
    blog/, ebooks/, cartes-cadeau/    # pages publiques produits
    reservation/                      # tunnel de réservation
    api/
      v1/
        availability/                 # créneaux libres (consommé par tunnel)
        cron/                         # 3 crons (cf. section dédiée)
        admin/                        # endpoints internes admin
      webhooks/
        stripe/                       # gère booking + gift_card + ebook
        resend/                       # tracking newsletter (Svix)
  components/
    admin/                            # composants admin partagés (icons, bell, etc.)
    landing/                          # SiteHeader, SiteFooter, sections
  lib/
    actions/                          # server actions (un fichier par domaine)
    email/
      templates/                      # un fichier par template (booking-*, gift-card-*, ebook-*, newsletter-*)
      send.ts                         # wrapper Resend + applique globals
      globals.ts                      # loadEmailGlobals() = signature, banner, contact, etc.
    prisma.ts                         # client Prisma singleton + adapter pg
    paris-day.ts                      # helpers timezone Paris (CRITIQUE pour @db.Date)
    sanitize-html.ts                  # DOMPurify pour rendu TipTap public
    stripe.ts, rate-limit.ts, ...
prisma/
  schema.prisma                       # source unique de vérité DB
public/uploads/                       # GITIGNORED : photos covers / portfolio / etc.
private/uploads/                      # GITIGNORED : PDFs ebooks vendus
.env.local                            # GITIGNORED : secrets dev (template = .env.example)
PHASE_2.md                            # backlog post-MVP (cf. plus bas)
```

## Modèles Prisma critiques

`prisma/schema.prisma` est la source unique. Quelques invariants importants :

- **`Booking`** : status flow `AWAITING_DEPOSIT → CONFIRMED → COMPLETED` (ou
  `CANCELLED_*` / `EXPIRED` / `NO_SHOW`). `date` est `@db.Date` (sans heure) →
  **toujours** utiliser `paris-day.ts` pour comparer (sinon décalage été/hiver).
  Champs `clientActionToken` (single-use, annulation/déplacement cliente),
  `reminderJ7SentAt` / `reminderJ1SentAt` (idempotence rappels), `pendingGiftCardId`
  (gift card réservée mais pas encore décrémentée tant que paiement pas confirmé).

- **`GiftCard`** : champ `version` pour optimistic locking lors des
  redemptions concurrentes (cf. `lib/gift-card-redeem.ts`). Status : `PENDING_PAYMENT
  → ACTIVE → PARTIALLY_USED → FULLY_USED` (+ `EXPIRED`, `CANCELLED`, `REFUNDED`).
  Distinction `creationMode = ADMIN_GIFT` (geste commercial, **exclu du CA**)
  vs `PUBLIC` / `ADMIN_SALE` (comptés au CA à la vente, **pas à la redemption**
  → éviter double-comptage).

- **`EbookPurchase`** : `downloadToken` (64 chars hex) + `tokenExpiresAt` (30j)
  + `downloadCount` cap à **5** (cf. `MAX_DOWNLOADS_PER_TOKEN` dans
  `lib/ebook-download-token.ts`) avec **debounce 30s** pour gérer les
  double-fetch navigateur (HEAD + GET). `paymentStatus REFUNDED` + `tokenExpiresAt = now`
  pour révoquer.

- **`NewsletterCampaign` + `NewsletterDelivery`** : 1 ligne `Delivery` par
  (campagne × abonnée), trackée via `resendMessageId` matché aux webhooks
  Resend. Lock atomique `DRAFT|SCHEDULED → SENDING` via `updateMany` conditionnel.
  Filtres audience : `confirmedAt != null`, `unsubscribedAt == null`, `newsletterEnabled` global.

- **`AuditLog`** : utilisé partout pour tracer les actions admin (refund,
  cancel, reissue, send campaign…). Pattern : `await audit(adminId, resourceId, action, metadata)`.

## Auth (NextAuth v5)

- `src/auth.ts` configure NextAuth avec adapter Prisma
- `src/proxy.ts` (middleware) protège `/admin/(protected)/*`
- Server actions admin pattern :
  ```ts
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { ok: false, error: "Non autorisé" };
  ```
- Pages admin server pattern :
  ```ts
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/admin/connexion");
  ```

## Système email

- **`sendEmail(message)`** dans `lib/email/send.ts` : wrapper unique qui :
  1. Appelle `loadEmailGlobals()` pour récupérer la config admin (signature, contact, bannière header/footer, footer note saisonnier — éditables sur `/admin/parametres`)
  2. Substitue les **tokens** `{{signature}}`, `{{contactEmail}}`, `{{contactPhone}}`, `{{contactPhoneHref}}`, `{{salonAddressSuffix}}`, `{{headerImageRow}}`, `{{footerImageRow}}`, `{{footerNoteBelowCard}}` dans le `html`/`text`/`subject` du message
  3. Si `RESEND_API_KEY` présent → envoie via Resend, sinon → log console (dev fallback)
  4. Retourne `{ ok: true, id }` ou `{ ok: false, error }` (**ne throw jamais** → caller doit checker `result.ok`)
- **`emailLayout(...)`** dans `lib/email/templates/layout.ts` : wrapper HTML commun (`<table>` 600px responsive, header/footer composés via les tokens ci-dessus). Tous les templates l'utilisent.
- **Convention template** : 1 fichier par usage dans `lib/email/templates/` (`booking-*`, `gift-card-*`, `ebook-*`, `newsletter-*`, `booking-reminder.ts`…). Chacun exporte `buildXxxEmail(input) → { subject, html, text }`.
- **Toujours fournir le `text`** (fallback pour clients mail qui le supportent + meilleure deliverability). Helper `stripHtml()` dispo dans `newsletter-campaign.ts` si besoin de générer depuis le HTML.

## Notifications in-app (cloche admin)

- Table `Notification` (n → User admin) + enum `NotificationType` (`NEW_BOOKING`, `DEPOSIT_PAID`, `EBOOK_SOLD`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`, `CONTACT_MESSAGE`, `REFUND_PROCESSED`, `NEWSLETTER_SUBSCRIBE`, `NEWSLETTER_SENT`, `GIFT_CARD_EXPIRING`, `GIFT_CARD_PURCHASED`).
- Composant `<NotificationsBell />` dans `components/admin/notifications-bell.tsx` (dropdown header admin).
- Page liste `/admin/notifications` avec `<NotificationsListItem />`.
- **À chaque nouvel event business** (refund, vente, etc.) → créer une `Notification` :
  ```ts
  await prisma.notification.create({
    data: {
      userId: adminUser.id,
      type: "EBOOK_SOLD",
      title: `Ebook vendu : ${title}`,
      body: `Cliente : ${email}`,
      link: `/admin/ebooks/ventes/${purchaseId}`, // CRITIQUE : pointer vers le détail, pas la liste
      metadata: { purchaseId } as object,
    },
  });
  ```
- ⚠️ **Si tu ajoutes un `NotificationType` à l'enum**, mets aussi à jour les 2 maps :
  - `components/admin/notifications-bell.tsx` → `TYPE_META` (icône + couleur)
  - `app/admin/(protected)/notifications/list-item.tsx` → `TYPE_META` (icône + couleur + label)
  Sinon TypeScript râle ("Property 'XXX' is missing").

## Sous-nav admin (`_tabs.tsx`)

Pattern utilisé pour les sections admin multi-vues :
- `app/admin/(protected)/ebooks/_tabs.tsx` (Catalogue / Ventes)
- `app/admin/(protected)/newsletter/_tabs.tsx` (Abonnées / Campagnes)

Composant client minimal qui prend une prop `current: "x" | "y"` et rend 2-3 `<Link>` Next stylés en pills. À placer en haut de chaque page de la section. Réutiliser le même look/feel si tu ajoutes une nouvelle sous-nav.

## Rate-limit & anti-abuse

`lib/rate-limit.ts` : implémentation in-memory (clé = bucketName + key), reset par fenêtre glissante.

```ts
const rl = checkRateLimit(CONTACT.bucket, ip, 5, 60 * 60 * 1000);
if (!rl.allowed) return { ok: false, error: "Trop de tentatives." };
recordRateLimit(CONTACT.bucket, ip, 60 * 60 * 1000);
```

- **Buckets nommés** : `CONTACT`, `GIFT_CARD_VALIDATE`, etc. Définis comme constantes en haut du fichier.
- **In-memory** = non partagé entre instances. Pour du multi-instance en prod, migrer vers Redis/Upstash (cf. `lib/rate-limit.ts` qui le documente).
- **Honeypot** : pattern complémentaire — input caché en `position: absolute; left: -9999px;` que les bots remplissent. Si valeur non vide → action refusée silencieusement.
- **reCAPTCHA V3** : non encore branché. Cf. todo "Pré-déploiement reCAPTCHA V3".

## Flow paiement Stripe

1. Le user remplit le tunnel (`/reservation`, `/cartes-cadeau`, `/ebooks/[slug]`)
2. Server action crée le row en DB avec status `PENDING`/`AWAITING_DEPOSIT` + génère un Stripe Checkout Session
3. User redirige sur Stripe → paie
4. **Webhook `/api/webhooks/stripe`** reçoit `checkout.session.completed` →
   discrimine via `session.metadata.type` (`booking` / `gift_card` / `ebook`) →
   marque PAID + applique gift card si présente (idempotent) + envoie l'email
5. `StripeEvent` table déduplique les webhooks rejoués

**Gift card mix** : si une cliente paye un ebook 15€ et utilise une carte de 10€,
on fait Stripe Checkout pour 5€, et au webhook on applique aussi
`applyGiftCardRedemption(ebookPurchaseId, 10€)`. La carte cadeau a déjà été
comptée au CA à sa vente initiale → on ne re-compte que la portion Stripe à
l'ebook (cf. dashboard `revenueCents` calc).

## Crons

3 endpoints sous `/api/v1/cron/*`, tous auth via `Authorization: Bearer ${CRON_SECRET}` :

- **`expire-pending`** : toutes les 5 min — passe les bookings `AWAITING_DEPOSIT` à `EXPIRED` après `paymentExpiresAt`
- **`send-scheduled-newsletters`** : toutes les 5 min — déclenche les campagnes `SCHEDULED` dues
- **`send-booking-reminders`** : 2× par jour (9h + 18h UTC) — envoie les rappels J-7 et J-1. **Skip silencieusement entre 21h-8h Paris** (double safety).

⚠️ **Pas de Vercel Cron.** Le déploiement est sur **VPS Hostinger** via crontab Linux + `curl`. Le fichier `vercel.json` est hérité et vide (les lignes sont commentées comme inutilisées). Les 3 lignes crontab à configurer sont documentées dans la mémoire `project_prod_deployment_notes.md`.

## Webhooks

- **`/api/webhooks/stripe`** : signature via `STRIPE_WEBHOOK_SECRET`, raw body, déduplique via `StripeEvent` table
- **`/api/webhooks/resend`** : signature via `RESEND_WEBHOOK_SECRET` (Svix HMAC-SHA256), tracking opens/clicks/bounces des newsletters. En dev sans secret configuré, vérif skip avec warning. En prod sans secret → 503.

## Outbound API — Intégration future Management

Clochette Nails est destiné à devenir un satellite d'une **app de gestion
centrale** (le "main point" du projet global). Ce site doit émettre les
events business vers cette app pour qu'elle puisse agréger compta, CRM,
pilotage multi-sites.

**Infra déjà en place** : table `OutboundEvent` (queue persistante avec
retry/backoff), helper `emitOutboundEvent(type, payload)`, viewer admin
sur `/admin/webhooks` onglet "Sortants". Pas encore de worker qui dépile.

**État actuel** : 2 events émis sur ~30 prévus (`booking.created`,
`booking.confirmed`).

**Principe à appliquer pour chaque nouvelle feature** : **émettre l'event
business** via `emitOutboundEvent(...)` dans la queue, même si le worker
n'existe pas encore. Sinon l'app de gestion n'aura aucune trace
rétroactive. Les rows accumulées partiront dans l'ordre chronologique le
jour où le worker arrive.

➡️ **Spec complète : [`MANAGEMENT_API.md`](MANAGEMENT_API.md)**

Y figurent : catalogue exhaustif des events à émettre par domaine
(bookings, cartes cadeau, ebooks, newsletter, contacts, photos, settings),
format de payload standardisé (versionné v1), spec auth (HMAC envisagé),
schéma retry/backoff du worker, roadmap d'implémentation en 6 étapes, env
vars à ajouter, et state factuel "✅ émis vs 🚧 à émettre" tenu à jour.

## Conventions code

- **Server Actions** dans `src/lib/actions/{domain}.ts` avec `"use server"` en tête. Pattern uniforme :
  ```ts
  type ActionResult = { ok: true; ... } | { ok: false; error: string; fieldErrors?: Record<string, string> };
  ```
- **Sanitize HTML** : tout HTML user-generated (TipTap → blog, ebooks, newsletter) passe par `sanitizeHtml()` avant `dangerouslySetInnerHTML`. DOMPurify whitelist dans `lib/sanitize-html.ts`.
- **Rendering rich content** : classe CSS dédiée `.rich-content` dans `globals.css` (pas le plugin Tailwind Typography). Appliquée sur l'éditeur admin + les pages publiques de rendu.
- **Polices** via `style={{ fontFamily: "var(--font-serif/display/ui)" }}`. Pas de classes Tailwind pour la typo.
- **Couleurs** via custom properties : `bg-[var(--color-violet-600)]`, `text-[var(--color-ink-500)]`. Définies dans `@theme` de `globals.css`.
- **Pages serveur** : `export const dynamic = "force-dynamic"` + `metadata.robots = { index: false, follow: false }` pour les pages admin.
- **`paris-day.ts`** : toujours utiliser ses helpers pour comparer des dates Booking (`startOfTodayParisAsUtc`, `currentTimeHHMMParis`, etc.). Jamais `new Date().setHours(0,0,0,0)`.
- **Pas de commentaires inline** dans le code : un header-comment par fichier explique le rôle, le reste doit être self-documented.

## Pièges connus

- **Client Prisma stale** : après modif schema + `db:push`, redémarrer `pnpm dev` (le client en mémoire n'est pas hot-reload). Si `Cannot find module '.prisma/client/default'`, relance `pnpm db:generate`.
- **Server-only imports dans Client Component** : si un composant `"use client"` importe un fichier qui charge Prisma transitivement, Turbopack tente de bundler `pg` côté browser → erreurs `Can't resolve 'dns'/'fs'/'net'/'tls'`. Solution : extraire les constantes côté client dans un fichier dédié sans dep serveur (pattern `newsletter-sources.ts` ↔ `newsletter-audience.ts`).
- **Resend test mode** : sans domaine vérifié, Resend n'envoie qu'à l'adresse owner du compte. Au déploiement, vérifier le domaine `clochette-nails.fr` dans Resend Dashboard.
- **Email link dev vs prod** : `NEXT_PUBLIC_SITE_URL` non set en dev → fallback `https://www.clochette-nails.fr`. Liens email pointent alors vers prod même en dev.
- **Idempotence webhooks** : le webhook Stripe peut rejouer le même event. Check `paymentStatus === "PAID"` ou équivalent avant de retraiter.
- **`public/uploads/` gitignored** : si un déploiement passe par `git pull`, les sous-dossiers vides ne sont pas créés ; les helpers Sharp font `mkdir({ recursive: true })` à la demande.

## Secrets & .env

- `.env.local` GITIGNORED. Template = `.env.example` (committé).
- Liste complète des vars dans `.env.example` avec commentaires explicatifs.
- En prod (VPS Hostinger), définir : `DATABASE_URL`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAIL`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`.

## Roadmap

- **Todo MVP en cours** : suivie dans la session (cf. tâches actives au démarrage). Items principaux restants : A-11 Finances · A-12 Recherche globale admin · A-13 Webhook events viewer · INFRA SEO+RGPD · Pré-déploiement (reCAPTCHA + tests E2E) · Setup VPS Hostinger.
- **`PHASE_2.md`** à la racine : backlog post-MVP (A/B testing newsletter, watermark PDF ebook, charge.refunded Stripe, tracking opens/clicks rappels RDV, inspirations, filtres/saison/recos prestations).

## Travailler avec ce repo

- **Toujours une branche dédiée** par feature (`feat/{nom}`) ou doc (`docs/{nom}`). Merge non-ff dans main + delete branche.
- Avant un gros changement de schema, vérifier qu'il n'y a pas de données en local (`pnpm db:studio`) qu'on risque de perdre avec `db:push` non-destructif.
- Pour tester le flow paiement Stripe en local, lancer `stripe listen --forward-to localhost:3000/api/webhooks/stripe` en parallèle de `pnpm dev`.
- Pour les emails, en dev sans `RESEND_API_KEY` set, `sendEmail()` log dans la console au lieu d'envoyer.
