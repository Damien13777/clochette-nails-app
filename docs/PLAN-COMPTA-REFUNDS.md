# Plan — remédiation compta « remboursements » (cartes cadeau, ebooks, RDV)

> Checklist de couverture à cocher au fil de l'eau. **À relire intégralement
> AVANT de déclarer le lot terminé.** Convention de cadrage identique à
> `erp-clochette/docs/CADRAGE-CHECKLIST.md`.

**Statut** : cadrage validé, implémentation NON commencée.
**Date** : 21/07/2026 · **Branche prévue** : `fix/compta-refunds`

---

## EN CLAIR (à lire en premier)

### La règle

La compta fonctionne comme un **carnet de caisse**. Chaque fois que de l'argent
bouge, on écrit **une ligne datée**. Une ligne déjà écrite ne se modifie
**jamais**. Si on rend de l'argent en avril, on n'efface pas la vente de
février : on écrit une **nouvelle ligne « − » datée d'avril**.

Pourquoi c'est vital : les mois passés sont **arrêtés et déclarés**. Si un
chiffre de février peut encore bouger en avril, la compta n'est plus fiable et
l'ERP ne colle plus avec le site.

### Ce qui ne respecte pas la règle aujourd'hui

Les **RDV** la respectent — c'est ce qui a été mis en place le 18/07. Deux
choses ne la respectent pas :

1. **Rembourser une carte cadeau ou un ebook.** Au lieu d'écrire une ligne « − »
   en avril, le code retourne **modifier la vente de février**. Février change
   rétroactivement.
2. **Restituer une carte cadeau** (rembourser un RDV réglé avec une carte : le
   solde est re-crédité). Le code **efface la trace** que la carte avait servi.
   Un mois passé se recalcule alors différemment.

### Ce qu'on va faire, étape par étape

| # | En une phrase | Effet concret |
|---|---|---|
| 1 | On arrête d'effacer : une carte utilisée le 17 juillet restera « utilisée le 17 juillet » pour toujours. | **Plus aucun mois passé ne bouge.** Aucune migration. |
| 2 | On empêche de rembourser un RDV déjà marqué honoré. | Les stats d'un mois arrêté ne peuvent plus bouger. |
| 3 | « Annuler une carte cadeau » : aucun changement de calcul, on prévient juste l'ERP. | Rien ne change à l'écran. |
| 4 | On ajoute une case **« date de remboursement »** en base pour les cartes et les ebooks. | Aucun changement de comportement. Ça prépare l'étape 6. |
| 5 | On remplit cette date, et on ajoute le bouton manquant : rembourser une carte **vendue au comptoir**. | Aujourd'hui c'est impossible : le bouton exige un paiement Stripe. |
| 6 | **Le cœur.** Un remboursement écrit enfin une ligne « − » datée du jour, au lieu de modifier la vente. | La vente de février reste figée ; avril porte le « − ». |
| 7 | Quand une vente est intégralement remboursée, Stripe garde sa commission : on affiche « − 1,05 € » au lieu de 0. | On dit la vérité. |
| 8 | Ménage dans les messages envoyés à l'ERP (un doublon, un manquant). | Cohérence du canal. |
| 9 | Filet : capter un remboursement fait **directement depuis Stripe** (litige, chargeback). | Aujourd'hui totalement invisible. |
| 10 | On ajoute les tests manquants. | C'est leur absence qui a laissé passer le bug du ticket moyen. |

### Pourquoi ça ne peut rien casser

- Il y a **0 carte cadeau et 0 ebook** en base. Les étapes **3 à 7 ne touchent
  que ces deux objets** → elles ne peuvent **mathématiquement pas** changer un
  chiffre affiché aujourd'hui.
- Chaque étape est **livrée, testée et déployée séparément**.
- Après chaque étape : re-vérification que **juin = 2 264,00 €**. Une dérive
  d'un centime = on annule.
- On ne touche ni au **CA brut**, ni à la façon dont les **RDV** sont comptés.

### Le seul vrai danger

**L'étape 6.** Si le site se met à écrire des lignes de remboursement que l'ERP
ne sait pas lire, les deux systèmes ne collent plus — sans aucune alerte.
Donc **l'étape 6 ne part QU'AVEC la mise à jour de l'ERP**, jamais seule.

### Option « risque minimal » recommandée

Faire d'abord **1 → 9 → 2 → 3** : ça referme les deux défauts d'origine et
bouche le trou Stripe, **sans aucune migration** et **sans aucun risque de
divergence avec l'ERP**. Le vrai chantier carte cadeau (**4 → 7**) attend le
moment où on prépare la boutique, et part avec l'ERP.

---

## 0. Pourquoi ce lot

Le modèle comptable verrouillé le 18/07 est une **compta d'encaissement
append-only** : chaque mouvement d'argent est daté du jour où il a lieu, et une
écriture passée n'est jamais réécrite. Les **RDV** respectent ce modèle. Les
**cartes cadeau** et les **ebooks** ne le respectent pas encore.

Deux audits adversariaux (55 puis 85 agents) ont confirmé 38 + 65 constats.
Ce plan ne retient que ceux qui tiennent après vérification manuelle.

### État réel de la production (vérifié en SQL le 21/07, pas supposé)

| | Prod |
|---|---|
| Cartes cadeau (toutes créations confondues) | **0** |
| Ebooks achetés | **0** |
| Redemptions de carte cadeau | **0** |
| Redemptions annulées | **0** |
| RDV honorés | 61 (juin 20 / juillet 41+) |

**Conséquence : aucun de ces défauts ne casse quoi que ce soit aujourd'hui.**
Le lot est **préventif**. Un audit avait annoncé « 2 RDV armés, 28,50 € de
dérive » : ce constat venait de la base de **dev**, il est **faux en prod**.

**Il n'y a donc AUCUN backfill de données à faire.** Un `UPDATE` de rattrapage
mettrait à jour 0 ligne. Ce qui doit être corrigé en revanche, c'est le backfill
**outbound** (`src/lib/outbound/backfill.ts`), avant tout futur run de cutover ERP.

---

## 1. Décisions actées (ne pas rouvrir)

| # | Question | Décision de Damien |
|---|---|---|
| D1 | Que signifie « annuler une carte cadeau » ? | **Neutraliser la carte, l'argent n'est PAS rendu.** Donc le code actuel a RAISON de la laisser à 100 % au CA. |
| D2 | Ajouter une action « remboursement hors Stripe » ? | **Oui, action complète** (montant + date + moyen). **Sans** le cas du reliquat : une carte déjà entamée reste non remboursable. |
| D3 | Rembourses-tu parfois depuis le dashboard Stripe ? | **Non, toujours depuis l'admin.** `charge.refunded` devient un filet de sécurité (litiges, chargebacks) placé en fin de lot. |
| D4 | Rembourser un RDV déjà honoré ? | **Bloquer**, avec un message clair renvoyant vers l'avoir. |

Décisions techniques prises par moi, argumentées (à contester si tu n'es pas d'accord) :

| # | Décision | Pourquoi |
|---|---|---|
| D5 | `paymentStatus` reste **`PAID`** sur une carte remboursée ou annulée. **Invariant.** | `finances.ts:326` filtre dessus. Le muter ferait **sortir la vente du CA brut de son mois** → rupture directe de la réconciliation ERP au centime. C'est le piège que la correction « naïve » du défaut n°4 armait. |
| D6 | Les clamps `Math.max(0, …)` ne sautent **qu'après** la mise en place des lignes datées. | Les supprimer avant ferait apparaître un net négatif **dans le mois de la vente** = violation append-only. Ordre non négociable. |
| D7 | Un remboursement d'acompte réglé en carte cadeau n'écrit **rien** dans `refundedAmount`. | Aucun euro n'est sorti : c'est un re-crédit de dette. Et ce champ est exposé à l'ERP sous le nom `stripeRefundedCents` (`booking-admin.ts:731`, `backfill.ts:153`) — l'élargir corromprait le contrat. |

---

## 2. Ce qu'on ne touche PAS

- Le **CA brut** et sa réconciliation ERP au centime (5091,50 € au 18/07).
  Aucune étape ne doit le déplacer sans décision explicite.
- Les **cartes ADMIN_GIFT** exclues du CA (`finances.ts:325`) — choix assumé.
- Les **8 RDV où `revenueCents` = prix total** — régularisations volontaires de
  Chloé, ne JAMAIS les « corriger ».
- Le **CA en brut sans déduire les frais Stripe** — choix verrouillé.
- L'absence d'UI « mot de passe oublié » — choix sécurité assumé.
- `invoice/create-invoice.ts:266, 418, 430` : le filtre `reversedAt: null` y est
  **correct** (snapshot au moment de l'émission de la facture). Ne pas y toucher.
- Le bug de saisie `EditRevenueDialog` (`booking-actions.tsx:604-606` préremplit
  le prix total là où le formulaire d'honoré préremplit le reste-à-percevoir).
  **Bug distinct, à traiter à part, côté saisie — jamais côté calcul.**

---

## 3. Étapes

Chaque étape est **livrable et testable seule**, en TDD (test rouge d'abord).
Runner : `pnpm test`. Base de test : `.env.test` + `pnpm test:e2e:init` après
tout changement de schéma.

### Étape 1 — Le passé cesse d'être réécrit (aucune migration) 🔴 le plus de valeur

**Problème.** La compta lit les redemptions de carte cadeau via
`where: { reversedAt: null }`, c'est-à-dire comme une **gomme**. Annuler une
redemption fait donc **remonter rétroactivement le net d'un mois clos**.

**Correctif.** Une redemption est un événement daté (`redeemedAt`), pas un état
courant. On retire le filtre des **lecteurs comptables** :
`finances.ts:144` (`loadBookingSales`), `:208` (`loadBookingTransactions`),
`:388` + `:396` (ebooks), `:597` (`loadTopServices`), `:656` + `:672`
(`loadTopEbooks`), `outbound/backfill.ts:37` + `:190`.

**Tests d'abord** — `test/finances-reversal-append-only.test.ts` (déjà écrit) :
- une redemption `BOOKING_DEPOSIT` reversée ne change pas d'un centime la ligne
  d'acompte du mois de `confirmedAt` (net reste 0) ;
- idem pour un reversal **partiel** (aujourd'hui la ligne entière disparaît).

**Risque** : `giftCardUsedCents` remonterait sur une période déjà affichée s'il
existait une redemption reversée — il y en a **0** en prod. Le brut ne bouge pas.

**Effet** : résout **à lui seul** les défauts n°1 et n°2 du lot initial.

- [ ] Test rouge vérifié
- [ ] Correctif
- [ ] Suite complète verte

### Étape 2 — Interdire le remboursement d'un RDV déjà honoré (D4)

**Problème.** `refundBookingFull` (`booking-admin.ts:608-664`) n'a **aucune garde
de statut** : rembourser un RDV `COMPLETED` le fait passer en
`CANCELLED_BY_ADMIN` sans effacer `completedAt`. Le RDV sort du compte des
honorés → **ticket moyen, nombre de RDV honorés et Top prestations d'un mois
arrêté mutent**. Atteignable en deux clics.

**Correctif.** Garde serveur + message renvoyant vers l'avoir. Masquer aussi
l'action côté UI. Ne charge aujourd'hui que les redemptions `BOOKING_DEPOSIT`
(`:626-637`) — à documenter, puisque le cas `BOOKING_SERVICE` devient inatteignable.

**Tests d'abord** : « rembourser un RDV COMPLETED est refusé et ne modifie
aucun champ » ; « un RDV CONFIRMED reste remboursable ».

- [ ] Test rouge vérifié
- [ ] Correctif serveur + UI
- [ ] Suite verte

### Étape 3 — `cancelGiftCard` : event ERP + invariant gravé (D1, D5)

**Ne PAS toucher `paymentStatus`** (D5). L'annulation garde la carte au CA, ce
qui est **correct** puisque l'argent n'est pas rendu (D1).

**Correctif** : émettre `gift_card.cancelled` (à ajouter au catalogue
`MANAGEMENT_API.md`), commentaire `///` sur `GiftCard.paymentStatus` au schéma
pour graver l'invariant, notification `REFUND_PROCESSED` si pertinent.

- [ ] Test « une annulation sèche n'écrit ni `refundedAmount` ni `refundedAt` et laisse `paymentStatus = PAID` »
- [ ] Event + invariant documenté

### Étape 4 — Migration de schéma, ISOLÉE (aucun changement de comportement)

`refundedAt DateTime?` sur **`GiftCard`** et **`EbookPurchase`** ;
`refundMethod String?` sur `GiftCard` (requis par D2).
Colonnes **nullables** → rien ne casse. Aucune écriture, aucune lecture ici.

`pnpm db:push` en dev **puis `pnpm db:generate`** (Prisma 7 ne régénère pas le
client tout seul — incident du 22/06), puis `pnpm test:e2e:init` pour resynchroniser
la base de test.

- [ ] Schéma + `db:push` + `db:generate` + `test:e2e:init`
- [ ] Test « le client Prisma expose `refundedAt` sur les deux modèles »
- [ ] Aucun autre test cassé

### Étape 5 — Écrire la date et les montants (schéma dispo, loaders inchangés)

- `gift-card-admin.ts:464-471` : poser `refundedAt`.
- `ebook-sales-admin.ts:313-321` : poser `refundedAt`.
- **Nouvelle action « remboursement hors Stripe »** (D2) : montant + date + moyen
  (espèces / virement / chèque), avoir PDF, `emitOutboundEvent("gift_card.refunded")`.
  Sans elle, une carte vendue au comptoir est **structurellement irremboursable**.
  Garde : refus si la carte est déjà entamée (D2 sans reliquat).

- [ ] Tests d'abord (3 : Stripe pose `refundedAt` et garde `PAID` · annulation sèche n'écrit rien · hors Stripe écrit les 3 champs et émet l'event)
- [ ] Implémentation

### Étape 6 — Loaders GC/ebook : deux lignes au lieu d'une

`where` en `OR` sur le modèle des RDV (`finances.ts:186-190`) :
`paidAt ∈ fenêtre` **OU** (`refundedAmount > 0` ET `refundedAt ∈ fenêtre`).
Mappers : ligne de vente à `paidAt` avec `refundedCents: 0`, **plus** ligne
négative à `refundedAt` (`grossCents: −refunded`, `netCents: −refunded`,
`refundedInGrossCents: refunded`).

⚠️ **Piège n°1** : élargir le `where` sans splitter le mapper ferait remonter une
ligne de février dans avril — on contaminerait un mois de plus qu'avant.
⚠️ **Piège n°2** : découpler les ventes GC/ebook de `toUnitSales`
(`finances.ts:96-97`), sinon chaque ligne de remboursement compterait comme une
**vente** de −X et fausserait le nombre de ventes et le ticket moyen.

- [ ] Tests d'abord : « carte 150 € vendue le 28/02, remboursée le 10/04 → février figé à +150 brut, avril porte −150 » · « le nombre de ventes d'avril n'augmente pas » · symétrique ebook avec **paiement mixte** (10 € GC + 5 € CB)
- [ ] Implémentation

### Étape 7 — Suppression des clamps + nettoyage (D6, après l'étape 6 seulement)

Retirer `Math.max(0, …)` (`finances.ts:364`, `:403`, `:630`, `:679`) : sur une
vente intégralement remboursée le net vaut **−frais** (Stripe ne rend pas sa
commission), le clamp l'écrase à 0 et casse l'équation affichée.

Ensuite `refundedInGrossCents` vaut `refundedCents` partout ⇒ **le supprimer de
bout en bout** et réécrire les textes (`kpi-cards.tsx`, `finances/page.tsx:249`).

- [ ] Tests d'abord
- [ ] Implémentation + textes UI

### Étape 8 — Cohérence du canal sortant ERP

- `booking-client.ts:215-218` : émettre `booking.refunded` avec le même payload
  que le chemin admin (`booking-admin.ts:729-735`).
- `expire-pending/route.ts` : **`booking.expired` est émis DEUX FOIS** (`:99-103`
  et `:126-141`). La dédup ERP ne sauve pas (les events live ont `eventId = null`).
- `backfill.ts:154` : cesser de hardcoder `gcRefundedCents: 0`.
- **`ebook.purchased` n'est pas émis** par le webhook Stripe → l'ERP recevrait
  `invoice.issued` et `payment.fee_captured` **sans vente en face**.
- Achat d'ebook 100 % carte cadeau : **facture non émise** → avoir impossible au
  remboursement.

- [ ] Tests de parité de payload
- [ ] Correctifs

### Étape 9 — `charge.refunded` : filet de sécurité (D3, en dernier)

Tous les `refunds.create` du code sont **sans `amount`**, donc intégraux : un
remboursement **partiel** n'est réalisable que depuis le dashboard Stripe, et il
est aujourd'hui **invisible**. Damien ne rembourse jamais depuis le dashboard,
mais les **litiges et chargebacks** ne passent pas par l'admin.

À traiter aussi : les 4 call sites qui posent `refundedAmount` **sans tester
`refund.status`** (un refund `pending` puis `failed` produirait une ligne
négative pour de l'argent jamais parti).

- [ ] Handler + tests
- [ ] Garde `refund.status`

### Étape 10 — Combler le trou de couverture

Aucun test aujourd'hui sur `loadBookingTransactions`, `computeDailySeries`,
`computeFinanceAnalytics`, `buildTransactionsCsv` — tous en production. C'est ce
trou qui a laissé le bug du ticket moyen vivre un mois.

- [ ] Tests d'intégration sur ces 4 fonctions

---

## 4. Plan de validation

1. **`pnpm test` vert** à chaque étape (baseline actuelle : 113 tests, 21 fichiers).
2. **`pnpm exec tsc --noEmit`** et **`pnpm lint`** clean.
3. **Non-régression comptable, la vérification qui compte** : avant/après le lot,
   rejouer la requête SQL de contrôle sur la prod et vérifier que
   **juin = 2 264,00 € brut** et que le total réconcilié n'a pas bougé **d'un
   centime**. Toute dérive = arrêt immédiat.
4. **Scénarios manuels sur base de dev** (impossible en prod : 0 vente GC/ebook) :
   vendre une carte → la rembourser le mois suivant → vérifier que le mois de
   vente est figé et que le mois de remboursement porte la ligne négative.
5. **Déploiement** : `git pull` → `db:push` → **`db:generate`** → `build` →
   `pm2 restart` → health check, en **une seule connexion SSH** (fail2ban).

---

## 5. Écosystème (après Clochette)

À auditer avec la même grille, en priorisant **Nails Academy** qui manipule le
plus d'argent après Clochette (formations + ebooks + RDV payants, refunds
partiels avec pénalité) :

- [ ] Un champ montant remboursé **sans** champ date ?
- [ ] Une écriture de remboursement conditionnée à une part Stripe non nulle ?
- [ ] Un `cancelX()` qui oublie de fermer le statut de paiement ?
- [ ] Un agrégat filtrant sur un flag d'annulation nu (`reversedAt: null`, `deletedAt: null`) qui ferait bouger un mois clos ?
- [ ] Un KPI panier/ticket moyen qui confond **mouvements** et **ventes** ?

Grille de référence : section « Règles ARGENT & COMPTA » du `CLAUDE.md` global.

---

## 6. Ordre d'exécution recommandé

**1 → 2 → 3** (valeur immédiate, zéro migration, zéro risque)
**4** (migration isolée)
**5 → 6 → 7** (le cœur : dater les remboursements GC/ebook)
**8 → 9 → 10** (canal ERP, filet Stripe, couverture)

L'étape 1 seule referme les deux défauts qui ont motivé ce lot.

---

## 7. Risques et régressions

Classés par gravité réelle, pas par ordre d'étape. Chaque risque a été **vérifié**,
aucun n'est théorique.

### R1 — 🔴 Divergence Clochette ↔ ERP à l'étape 6 (le plus grave)

**Vérifié** : l'ERP ne connaît que 8 types d'events (`erp-clochette/src/lib/ledger/handlers.ts`) :
`booking.confirmed`, `booking.completed`, `booking.refunded`, `booking.revenue_updated`,
`payment.fee_captured`, `gift_card.purchased`, `ebook.purchased`, `invoice.issued`.
**Il n'a AUCUN handler `gift_card.refunded` ni `ebook.refunded`**, et un type inconnu
est **ignoré silencieusement** (`process.ts:12`, `handlers.ts:16`).

Donc dès l'étape 6, un remboursement de carte cadeau produirait une ligne négative
datée côté Clochette et **rien du tout** côté ERP. Les deux systèmes divergeraient
**sans aucune alerte** — exactement le scénario qui a coûté deux jours de
remédiation les 17-18/07.

**Mitigation obligatoire** : les handlers ERP doivent partir **dans la même vague**
que l'étape 6, jamais après. C'est déjà le TODO n°1 de la mémoire
`project_erp_compta_remediation`. **Ne pas livrer l'étape 6 seule.**

### R2 — 🔴 L'étape 2 ferme une porte sans en ouvrir une

**Vérifié** : `finances.ts` ne lit **jamais** les factures — un avoir a donc
**zéro effet sur le CA**. Bloquer le remboursement d'un RDV honoré en renvoyant
« passez par un avoir » laisserait Chloé **sans aucun moyen** d'enregistrer ce
remboursement en compta.

**Mitigation** : l'étape 2 est **couplée à l'étape 9**. Avec le handler
`charge.refunded`, un remboursement fait depuis le dashboard Stripe produit une
ligne négative datée du jour — ce qui devient la porte de sortie légitime, et qui
respecte l'append-only. **Livrer 2 et 9 ensemble, ou remonter 9 avant 2.**

### R3 — 🟠 L'étape 6 peut gonfler le CA d'un mois

Élargir le `where` en `OR` sans splitter le mapper ferait apparaître la **ligne de
vente de février dans le mois d'avril**. C'est le seul endroit du lot où une erreur
**déplace de l'argent**. Couvert par les tests spécifiés, mais à traiter avec la
plus grande attention.

### R4 — 🟠 L'étape 6 peut re-casser le ticket moyen corrigé le 21/07

`toUnitSales` (`finances.ts:96-97, 110-116`) transforme **chaque ligne** en vente.
Une ligne de remboursement deviendrait une « vente » de **−X €** → nombre de ventes
gonflé et ticket moyen faussé : très exactement le bug corrigé le matin même.
**Test de garde obligatoire** : « le nombre de ventes du mois de remboursement
n'augmente pas ».

### R5 — 🟡 Étape 7 : net négatif à l'écran, et churn sur du code neuf

Retirer les clamps peut produire un **net négatif** affiché. À vérifier :
`finances-chart.tsx` sait-il rendre une valeur négative ?

**Recommandation : ne PAS supprimer `refundedInGrossCents`.** Ce champ a été
déployé le 21/07 ; le retirer touche du code de quelques heures pour un bénéfice
utilisateur **nul**, avec le risque de réintroduire la double déduction. Garder le
retrait des clamps, abandonner le nettoyage du champ.

### R6 — 🟡 Étape 4 : les deux gotchas de déploiement connus

`pnpm db:push` **ne régénère pas** le client Prisma (incident du 22/06 → build cassé) :
`db:generate` obligatoire entre le push et le build. Et la base de test doit être
resynchronisée (`pnpm test:e2e:init`) sinon les tests DB cassent en série.
Risque **maîtrisé** par la procédure, mais fatal si oublié.

### R7 — 🟡 Étape 1 change la sémantique du backfill outbound

`outbound/backfill.ts` a été exécuté et réconcilié au centime le 18/07. Modifier
`sumRedemptions` fait qu'un **futur re-run** produirait des payloads différents de
ce que l'ERP a déjà ingéré. **Ne jamais relancer le backfill sans la procédure de
purge du 18/07** (purge outbound + incoming, re-dispatch, re-projection).

### R8 — 🟢 Double émission de `booking.expired` : sans impact financier

`booking.expired` **ne fait pas partie** des 8 types traités par l'ERP → il est
ignoré. La double émission n'est donc que du **bruit de queue**, pas une erreur de
compta. À corriger par propreté, sans urgence.

### R9 — 🟢 Propriété de sécurité : la prod est inaltérable par les étapes 3 à 7

Avec **0 carte cadeau et 0 ebook en base**, les étapes 3 à 7 ne peuvent
**mathématiquement pas** modifier un seul chiffre affiché en production. C'est une
excellente nouvelle pour le risque… et un problème pour la validation : **on ne
peut rien vérifier en prod**. D'où l'obligation des scénarios sur base de dev avec
données semées (§4.4).

Les seules étapes capables de déplacer un chiffre réel aujourd'hui sont la **1**
(uniquement s'il existait une redemption reversée — il n'y en a aucune), la **2**
(elle bloque une action) et les **8/9** (canal sortant et webhook).

### Garde-fou global

Avant et après **chaque** étape déployée : rejouer la requête SQL de contrôle sur
la prod et vérifier que **juin = 2 264,00 € brut**. Toute dérive = rollback immédiat.

---

## 8. Journal d'avancement

### 21/07/2026 — branche `fix/compta-refunds` (4 commits, NON poussée)

| Commit | Objet | État |
|---|---|---|
| `0578719` | **Étape 1** — les lecteurs comptables ne filtrent plus `reversedAt` | ✅ |
| `f5519b5` | Filet anti-régression, **score de mutation 7/7** (mesuré site par site) | ✅ |
| `dfa5d15` | **Correctif A** — date de cutover du backfill obligatoire (garde réelle, plus un commentaire) | ✅ |
| `6463b31` | **Correctif B** — CSV + tableau : plus de double déduction du remboursement | ✅ |

**Vérifications** : 122 tests verts (23 fichiers) · `tsc` 0 erreur · `lint` clean.

**Revue adversariale complète** (48 agents, 0 erreur) : **aucune régression de
calcul introduite**. Elle a mesuré le filet de tests à 1/7 avant renforcement,
porté à **7/7** ensuite.

### ⏳ Reste à traiter — reprise

**Prioritaire, atteignable aujourd'hui :**
1. **`booking.refunded` non émis sur annulation CLIENTE** (`booking-client.ts:215`
   n'émet que `booking.cancelled_by_client`, type sans handler ERP). Clochette
   écrit sa ligne négative, l'ERP n'écrit rien. **Divergence latente, pas encore
   matérialisée** : le seul remboursement en base (`cmqt90md`, 22,50 €, annulé le
   09/07) est couvert par le backfill du 18/07. C'est la PROCHAINE annulation
   cliente remboursée qui divergera. → se referme avec l'étape 8.
2. **Docs ERP à corriger** : `erp-clochette/docs/REMEDIATION-COMPTA-CRM.md` et
   `RUNBOOK-DEPLOY-RESET.md` spécifient encore `reversedAt IS NULL` dans la
   requête de réconciliation → elle remonterait un **écart fantôme** contre le
   nouveau backfill.
3. **Test doublon à nettoyer** : le cas « reversal PARTIEL » de
   `test/finances-reversal-append-only.test.ts` est un doublon strict du test
   précédent (mêmes fixtures, aucun point de mutation en plus).
   `reversedAmountCents` n'est lu par aucun lecteur comptable.

**Puis, dans l'ordre du plan** : étape 9 (`charge.refunded`) → étape 2 (garde sur
RDV honoré, **couplée à la 9**) → étape 3 (`cancelGiftCard`).
Étapes 4 à 7 : différées, à livrer **avec** les handlers ERP (risque R1).

**Déploiement** : rien n'est poussé. Aucun changement de schéma dans ces
4 commits → `git pull` · `pnpm build` · `pm2 restart` · health check, en une
seule connexion SSH.
