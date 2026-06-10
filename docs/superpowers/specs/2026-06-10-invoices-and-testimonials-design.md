# Spec — Factures PDF (toutes ventes) + Gestion des avis clientes

**Date :** 2026-06-10
**Statut :** validé par Damien (périmètre, UX, en-tête facture, opt-in/auto-send)
**Branche :** `feat/invoices-and-testimonials`

---

## Contexte

Deux features admin à livrer avant déploiement :

1. **Factures** : génération d'une facture PDF légale (micro-entreprise, B2C)
   pour **toutes les ventes** — RDV honorés, cartes cadeau, ebooks. Stockée
   dans la plateforme dans tous les cas ; envoyée par email à la cliente selon
   le flow (opt-in ou automatique).
2. **Avis clientes** : CRUD admin des témoignages affichés sur la landing
   (aujourd'hui hardcodés dans `testimonials-section.tsx`).

### Décisions validées

| Sujet | Décision |
|---|---|
| Périmètre factures | Toutes les ventes : bookings + cartes cadeau + ebooks |
| En-tête facture | « CN manucure by Clochette Nails » en grand, « EI Gomes Chloé » + infos légales en petit dessous — **paramétrable** (produit duplicable) |
| Case envoi (booking, GC admin) | **Décochée par défaut** (opt-in) |
| Ebooks + GC achetées en ligne | Envoi **automatique**, PDF joint au mail transactionnel existant (pas de 2ᵉ mail) |
| Consultation | **Liste plate** `/admin/finances/factures` (pas d'annuaire clientes — rôle du futur ERP) |
| API / ERP | Events `invoice.*` dans `OutboundEvent` ; le modèle snapshot rend une future API REST triviale |
| Avis admin | Sous-page `/admin/parametres/avis`, carte lien depuis Paramètres |
| PDF | `@react-pdf/renderer` (cohérence écosystème — certificats Nails Academy) |
| Stockage | Fichier généré **une fois**, immuable, `private/uploads/invoices/{année}/{numéro}.pdf` + snapshot complet en DB |
| Génération | Synchrone fail-soft (pas de worker) ; un échec PDF ne casse jamais le flow principal |

---

## Feature 1 — Factures

### 1.1 Modèle Prisma

```prisma
enum InvoiceDocType {
  INVOICE      // Facture
  CREDIT_NOTE  // Avoir
}

enum InvoiceSourceType {
  BOOKING
  GIFT_CARD
  EBOOK
}

enum InvoiceStatus {
  ISSUED
  CANCELLED   // jamais supprimée (séquence fiscale) — marquée annulée
}

model Invoice {
  id      String            @id @default(cuid())
  number  String            @unique // "FAC-2026-0001" / "AV-2026-0001"
  docType InvoiceDocType    @default(INVOICE)
  sourceType InvoiceSourceType
  status  InvoiceStatus     @default(ISSUED)

  // Références source — nullables + SetNull : la facture survit à tout
  bookingId       String?
  booking         Booking?       @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  giftCardId      String?
  giftCard        GiftCard?      @relation(fields: [giftCardId], references: [id], onDelete: SetNull)
  ebookPurchaseId String?
  ebookPurchase   EbookPurchase? @relation(fields: [ebookPurchaseId], references: [id], onDelete: SetNull)

  // Avoir → facture d'origine
  parentInvoiceId String?
  parentInvoice   Invoice?  @relation("CreditNotes", fields: [parentInvoiceId], references: [id], onDelete: Restrict)
  creditNotes     Invoice[] @relation("CreditNotes")

  // Snapshot immuable (la facture doit rester identique 10 ans,
  // même si les settings / prix catalogue changent ensuite)
  sellerSnapshot Json   // { headerName, legalOwner, address, siret, contactEmail, contactPhone, vatMention, legalFooter }
  customerName   String
  customerEmail  String
  lines          Json   // [{ label, quantity, unitCents, totalCents }]
  payments       Json   // [{ label, amountCents }] — acompte / espèces / CB / carte cadeau…
  totalCents     Int    // TTC. Toujours positif (docType distingue facture/avoir)
  serviceDate    DateTime? @db.Date // date de la prestation (bookings) ; null GC/ebooks (= date émission)

  issuedAt    DateTime  @default(now())
  pdfPath     String    // relatif au rootDir invoices : "2026/FAC-2026-0001.pdf"
  sentAt      DateTime?
  sentTo      String?
  createdById String?   // admin User.id si action manuelle, null si webhook
  cancelledAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([sourceType, issuedAt])
  @@index([customerEmail])
  @@index([issuedAt])
  @@map("invoices")
}

model InvoiceCounter {
  series     String @id // "FAC-2026", "AV-2026"
  lastNumber Int    @default(0)

  @@map("invoice_counters")
}
```

Relations inverses à ajouter : `invoices Invoice[]` sur `Booking`, `GiftCard`,
`EbookPurchase`.

**Numérotation** : séquentielle continue sans trou (exigence fiscale), série
annuelle par type de document (`FAC-2026-NNNN`, `AV-2026-NNNN`, padding 4).
Allocation dans la **même transaction Prisma** que la création de la row :
`upsert` du compteur avec `increment` (row lock Postgres) → ni trou ni doublon
sous concurrence. Retry unique en cas de violation d'unicité sur le create
concurrent du compteur (première facture de l'année).

### 1.2 Nouveaux champs PlatformSettings (section « Facturation » des Paramètres)

```prisma
/// Nom commercial affiché en grand en tête de facture.
/// null → fallback businessName. Pour Clochette : "CN manucure by Clochette Nails".
invoiceHeaderName String?
/// Exploitant(e) avec mention EI obligatoire. Ex : "EI Gomes Chloé".
invoiceLegalOwner String?
/// Mention franchise TVA — éditable (passage CIBS sept. 2026 sans redéploiement).
invoiceVatMention String @default("TVA non applicable, art. 293 B du CGI")
/// Mentions bas de facture : immatriculation RM/RNE, assurance RC pro
/// (assureur + couverture géographique), médiateur… Texte libre multi-lignes.
invoiceLegalFooter String? @db.Text
```

Champs réutilisés : `businessName`, `businessSiret`, `businessAddress`,
`contactEmail`, `contactPhone`, `vatEnabled`/`vatRate`.

La section Facturation du formulaire Paramètres édite ces 4 champs (le SIRET
et l'adresse sont déjà dans la section Identité). Seed Clochette :
`invoiceHeaderName = "CN manucure by Clochette Nails"`,
`invoiceLegalOwner = "EI Gomes Chloé"`.

### 1.3 Conformité légale (micro-entreprise, franchise TVA, B2C)

Mentions portées par le template (couvre la facture ET la « note » obligatoire
B2C ≥ 25 € — arrêté du 3 octobre 1983) :

- Numéro de facture + **date d'émission** + **date de la prestation** (bookings)
- Vendeur : nom commercial (`invoiceHeaderName`), exploitante avec mention
  **« EI »** (`invoiceLegalOwner`), adresse, **SIRET**, email/téléphone
- Cliente : nom + email (adresse non requise en B2C pour ces montants)
- Décompte détaillé : désignation, quantité, prix unitaire, total par ligne
- **Total TTC** (= HT en franchise)
- Mention TVA : `invoiceVatMention` — défaut art. 293 B CGI ; deviendra
  « TVA non applicable, art. L. 223 et s. du CIBS » au 1ᵉʳ sept. 2026
  (tolérance fin 2027) → simple édition de settings, zéro redéploiement
- `invoiceLegalFooter` : immatriculation, assurance RC pro, médiateur
- Si `vatEnabled = true` un jour : le template affiche colonnes HT / TVA
  (`vatRate`) / TTC au lieu de la mention franchise

Notes : e-invoicing/e-reporting 2026-2027 ne concerne pas le B2C aujourd'hui
(e-reporting micro : sept. 2027 — hors scope, réévalué au moment venu).
**Aucune suppression de facture possible** (rupture de séquence interdite) :
seulement statut `CANCELLED` + avoir.

### 1.4 Service central `src/lib/invoice/`

| Fichier | Rôle |
|---|---|
| `create-invoice.ts` | `createInvoice(input)` : transaction numéro+row, rendu PDF, écriture fichier, event outbound. + builders par source : `createInvoiceForBooking(bookingId)`, `createInvoiceForGiftCard(giftCardId)`, `createInvoiceForEbookPurchase(purchaseId)`, `createCreditNote({ parentInvoiceId, amountCents, reason? })` |
| `invoice-pdf.tsx` | Template `@react-pdf/renderer` → `renderInvoicePdf(data): Promise<Buffer>`. Polices du design system embarquées (TTF), fallback Helvetica |
| `invoice-files.ts` | Résolution rootDir (`INVOICES_DIR` env pour les tests, défaut `private/uploads/invoices/`), écriture/lecture, mkdir récursif |
| `invoice-email.ts` | `sendInvoiceEmail(invoiceId)` : template email dédié « Votre facture » + PDF en pièce jointe, marque `sentAt`/`sentTo` |

Nouvelle dépendance : `@react-pdf/renderer`.

**`sendEmail` étendu** : champ optionnel
`attachments?: { filename: string; content: Buffer }[]` (support natif Resend),
ignoré en mode mock dev (loggé).

**Outbound events** : création de `src/lib/outbound-events.ts` (helper
centralisé prévu par `MANAGEMENT_API.md` §« Créer lib/outbound-events.ts ») —
utilisé par le service invoice uniquement ; la migration des `emitOutboundEvent`
dupliqués existants est **hors scope**. Events émis :
`invoice.issued` et `invoice.cancelled` avec payload
`{ invoiceId, number, docType, sourceType, totalCents, customerEmail, issuedAt }`.
`MANAGEMENT_API.md` mis à jour (liste des events).

### 1.5 Points de génération

| Vente | Où | Facture | Envoi email |
|---|---|---|---|
| RDV honoré | `markBookingCompleted` (action) | toujours, après le passage COMPLETED | ☐ case opt-in « Envoyer la facture par email » dans la modale |
| GC achetée en ligne (`PUBLIC`) | webhook `activateGiftCardFromSession` | toujours, après activation | auto — PDF joint au mail de reçu existant (`buildGiftCardPurchaseReceiptEmail`, destinataire = acheteuse) |
| GC vendue au salon (`ADMIN_SALE`) | `createGiftCardAdmin` | toujours | ☐ case opt-in dans le formulaire (désactivée si pas d'email acheteuse) |
| GC offerte (`ADMIN_GIFT`) | — | **aucune** (rien n'est vendu) | — |
| Ebook | webhook `confirmEbookPurchaseFromSession` | toujours, après confirmation | auto — PDF joint au mail d'achat existant (`buildEbookPurchasedEmail`) |

**Fail-soft (webhooks et actions)** : la génération est en `try/catch` après
les opérations critiques. En cas d'échec : le flow principal aboutit quand même
(mail envoyé sans pièce jointe le cas échéant), notification admin in-app
(pattern `notifyAdmin` existant), et bouton fallback « Générer la facture » en
admin. L'action `markBookingCompleted` retourne `ok: true` avec un message
signalant l'échec facture.

**Contenu des lignes par source :**

- **Booking** : une ligne par prestation + une par option (libellés et prix
  catalogue au moment de l'émission) ; si la somme catalogue ≠ total réellement
  payé (geste commercial, ajustement) → ligne « Remise » ou « Ajustement »
  pour que le total facturé = total encaissé. Paiements détaillés : acompte en
  ligne (si payé via Stripe), complément (espèces / CB / virement / chèque),
  part carte cadeau (« Carte cadeau •••• {4 derniers du code} »).
  `serviceDate` = date du RDV. Total = acompte payé + `revenueCents` + part GC.
- **Carte cadeau** : une ligne « Carte cadeau {headerName} » + montant
  (`amountInitialCents`). Paiement : Stripe (PUBLIC) ou méthode physique
  saisie (ADMIN_SALE).
- **Ebook** : une ligne avec le titre de l'ebook + prix payé. Paiement Stripe.

### 1.6 Avoirs (CREDIT_NOTE)

- **Automatiques** : `refundGiftCardStripe` et le refund ebook
  (`ebook-sales-admin`) créent un avoir du montant remboursé **si** une facture
  `ISSUED` existe pour la vente. PDF joint au mail de remboursement existant
  s'il y en a un, sinon stocké seulement.
- **Manuel** : action « Créer un avoir » sur toute facture `ISSUED` (modale :
  montant, défaut = total ; plafond = total − avoirs déjà émis ; motif optionnel).
- Les remboursements de **bookings** n'en ont pas besoin : `refundFull`
  s'applique avant complétion, donc avant toute facture.
- `updateBookingRevenue` : si une facture existe pour le booking, le retour
  inclut un avertissement (« Facture FAC-… déjà émise — créer un avoir si
  nécessaire ») ; pas de blocage.
- PDF avoir : même template, titre « AVOIR », référence « Annule (partiellement)
  la facture {number} », montant positif affiché comme remboursé.

### 1.7 UX admin

**Liste `/admin/finances/factures`** (Server Component, lien bouton depuis le
header de la page Finances — pas de nouvel onglet sidebar) :

- Colonnes : numéro, date, cliente (nom + email), type de vente, type de doc
  (facture/avoir), montant, statut envoi (envoyée le… / non envoyée)
- Filtres querystring : type de vente, facture/avoir, période, **recherche**
  numéro / nom / email (l'historique par cliente = recherche par son nom)
- Pied de liste : « N documents · total X € » sur la sélection courante
- Actions par ligne : **Télécharger**, **Renvoyer par email** (confirm),
  **Créer un avoir** (modale) — pattern modales admin existant
- Pagination offset simple (même pattern que les autres listes admin)

**Blocs contextuels** : fiche booking COMPLETED, fiche carte cadeau
(PUBLIC/ADMIN_SALE), détail vente ebook → bloc « Facture » : numéro + émise
le + télécharger + renvoyer ; ou bouton « Générer la facture » si absente
(fallback / antériorité).

**Téléchargement** : `GET /api/v1/admin/invoices/[id]/download` — guard
`requireAdmin`, stream du fichier depuis `private/`,
`Content-Disposition: attachment; filename="{number}.pdf"`.

**Audit** (actions admin uniquement, helper `audit()` existant) :
`invoice.issued` (génération manuelle), `invoice.resent`,
`invoice.credit_note_created`.

### 1.8 Sécurité, conformité, ops

- PDFs **jamais** sous `public/` ; lecture uniquement via la route admin
  authentifiée. Pas de lien de téléchargement cliente (elle reçoit le PDF par
  email).
- Conservation : pas de suppression possible (ni UI ni action) ; soft delete
  booking → facture conservée (SetNull).
- Backup VPS : `private/uploads/` entre dans la stratégie de backup fichiers
  (déjà requis pour les ebooks — rappel dans les notes de déploiement).
- Numéro de série continue ⇒ la base de prod fait foi ; les environnements
  dev/test ont leurs propres compteurs (aucun risque de collision, DB séparées).

### 1.9 Tests (Vitest, base `clochette_test`)

- `test/invoice-numbering.test.ts` : 20 créations concurrentes
  (`Promise.all`) → numéros uniques et continus 0001→0020 ; séries FAC/AV
  indépendantes ; séries annuelles distinctes.
- `test/invoice-create.test.ts` : booking complet (options + GC partielle +
  complément cash) → lignes, paiements, total = encaissé, snapshot vendeur
  depuis settings, buffer commençant par `%PDF`, fichier écrit sous
  `INVOICES_DIR` temporaire.
- `test/invoice-credit-note.test.ts` : avoir lié à sa facture, série AV,
  plafond (total − avoirs émis) refusé au-delà.
- Rendu visuel PDF : validation à l'œil sur exemples réels générés en dev
  (pas de test automatisé du rendu).

---

## Feature 2 — Avis clientes

### 2.1 Modèle Prisma

```prisma
model Testimonial {
  id          String   @id @default(cuid())
  quote       String   @db.Text
  rating      Int      @default(5) // 1..5 (validé côté action)
  authorName  String   // "Marie L." — l'initiale d'avatar est dérivée
  authorLabel String?  // "Cliente fidèle · 2024"
  sortOrder   Int      @default(0)
  published   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([published, sortOrder])
  @@map("testimonials")
}
```

PlatformSettings : `testimonialsGoogleLine String?` — la ligne « 4,9 / 5 ·
87 avis Google » (donnée externe, éditée à la main), masquée si vide/null.

### 2.2 Admin `/admin/parametres/avis`

- Carte lien « Avis clientes » sur la page Paramètres (gérer les avis affichés
  sur la landing).
- Sous-page : liste des avis (ordre = `sortOrder`), modale ajout/édition
  (citation, note 1-5, nom, label), réordonnancement par flèches ↑↓ (swap),
  toggle publier/dépublier, suppression avec confirmation. Champ
  `testimonialsGoogleLine` éditable en tête de page.
- `src/lib/actions/testimonials-admin.ts` : `createTestimonial`,
  `updateTestimonial`, `deleteTestimonial`, `reorderTestimonial(id, "up"|"down")`,
  `toggleTestimonialPublished`, `updateTestimonialsGoogleLine` — pattern
  `ActionResult`, `requireAdmin`, `audit()`, `revalidatePath("/")` +
  `revalidatePath("/admin/parametres/avis")`.

### 2.3 Landing

- `testimonials-section.tsx` → async Server Component :
  `findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })`.
- Section **masquée** (return null) si aucun avis publié.
- Ligne Google : depuis settings, masquée si vide.
- Rendu visuel inchangé (citation, étoiles, avatar initiale).

### 2.4 Reprise des données

Seed (`prisma/seed.ts`) : insertion des 3 avis actuellement hardcodés +
`testimonialsGoogleLine = "4,9 / 5 · 87 avis Google"` — la landing ne se vide
pas au premier déploiement.

### 2.5 Tests

Logique triviale (CRUD + tri) : pas de suite Vitest dédiée — gates lint/tsc +
vérification manuelle landing/admin. Le swap `reorderTestimonial` est le seul
candidat si on veut un test ; non requis.

---

## Hors scope (acté)

- Annuaire clientes / CRM → futur ERP Chloé (les events `invoice.*` +
  modèle snapshot préparent l'intégration API).
- Endpoints REST management `/api/v1/management/invoices` → avec l'ERP.
- E-reporting B2C (micro : sept. 2027) — réévalué au déploiement venu.
- Avoir multi-lignes détaillé (v1 = montant global).
- Migration des `emitOutboundEvent` dupliqués existants vers le helper
  centralisé (seuls les nouveaux events l'utilisent).
- Factures pour ventes hors plateforme.

## Ordre d'implémentation proposé

1. **Avis clientes** d'abord (petit, indépendant, quick win).
2. **Factures** ensuite (schema → service/PDF → points de génération →
   avoirs → UI liste/blocs → tests).
