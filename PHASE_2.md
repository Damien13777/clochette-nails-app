# Phase 2 — Backlog post-MVP

Fonctionnalités décidées comme étant "Phase 2" pendant la construction du MVP.
À reprendre une fois la prod stable et selon les besoins observés à l'usage.

Chaque item garde la décision/le contexte qui a mené à le différer.

---

## Newsletter

### A/B testing
Tester 2 variantes de sujet (ou de contenu) sur un petit % de l'audience, mesurer
le gagnant après une fenêtre (taux d'ouverture / clic) puis envoyer la variante
gagnante au reste des destinataires.

**Pourquoi différé :** demande un volume statistiquement significatif (300+
abonnées par variante minimum) pour produire des résultats fiables. À implémenter
quand la base d'abonnées atteint cette taille.

**Pré-requis :** tracking opens/clicks via webhook Resend (déjà en place).

**Effort :** ~équivalent au reste de la newsletter (variantes en DB, split
aléatoire reproductible, cron de détermination du gagnant, UI résultats live).

---

## Stripe / paiements

### Webhook `charge.refunded`
Tracker les remboursements initiés directement depuis le dashboard Stripe (hors
de notre admin). Aujourd'hui un refund manuel côté Stripe n'est pas reflété en
DB (`refundedAmount` reste à 0).

**Pourquoi différé :** en pratique tous les refunds passent par l'admin (booking
ou ebook), qui les enregistre déjà. Le cas "refund externe" est marginal.

**À ajouter quand :** Chloé commencera à toucher au dashboard Stripe directement
ou si on observe des incohérences DB / Stripe.

---

## Ebooks

### Watermark PDF avec email cliente
Génération à la volée d'une copie du PDF avec l'email de la cliente tamponné
dans le pied de page de chaque page. Anti-piratage par traçabilité.

**Pourquoi différé :** le cap actuel "5 téléchargements par lien sur 30 j"
décourage déjà le partage casual. Le watermark vise les pirates déterminés —
overkill tant qu'aucune fuite observée.

**Effort :** moyen (pdf-lib pour modifier les PDFs à la volée, performance à
surveiller pour les gros PDFs).

---

## Rappels RDV par mail

### Tracking opens/clicks
Étendre le webhook Resend (déjà en place pour la newsletter) pour matcher aussi
les events des mails de rappel (tags `booking.reminder.j7` / `booking.reminder.j1`)
et stocker `reminderJ7OpenedAt`, `reminderJ7ClickedAt`, etc. sur `Booking`.

**Pourquoi différé :** savoir si une cliente a ouvert son rappel est moins
critique que pour une newsletter marketing. La cliente vient au RDV ou non —
c'est ce qui compte.

**À ajouter quand :** on observe trop de no-shows → comprendre si les rappels
sont vraiment lus.

---

## Réservation — features confort

### Combo natif : multi-prestations dans une même réservation
Permettre à la cliente de combiner librement N prestations dans un seul RDV
(ex : pose semi mains + soin pieds), avec durée cumulée, prix sommé, options
applicables par prestation.

**Pourquoi différé :** au lancement V1, on couvre le besoin via la catégorie
`PACK_SPECIAL` (services pré-composés saisis en admin — "Pose semi mains +
pieds", etc.). C'est figé mais zéro dev. La compo libre par la cliente demande
un refacto large.

**Refacto attendu :**
- Schema Prisma : table pivot `BookingService` (Booking 1-N Service) avec
  `addedDurationMinutes` / `addedPriceCents` snapshotés
- `createBookingAction` + outbound `booking.created` payload : passer en `serviceIds[]`
- `ReservationFlow` state : `serviceIds: string[]` au lieu de `serviceId: string`
- `OptionsPicker` : choisir à quelle prestation rattacher l'option (UX épineuse)
- `BookingCalendar` : recalcul durée totale dynamique
- `ReservationSummary` + templates emails (confirm + rappels J-7/J-1) + admin
  (détail booking, calendrier, liste) : afficher la liste des prestations
- Webhook Stripe `checkout.session.completed` : déjà ok via metadata mais
  vérifier le label de session
- Migration : convertir les Bookings existants en `BookingService` à 1 entrée

**À ajouter quand :** Chloé observe que les clientes demandent régulièrement
des combos non prévus dans le catalogue PACK_SPECIAL, ou que l'admin du
catalogue devient lourd à maintenir (multiplication des packs).

**Effort :** ~2-3 jours dev + 1 jour de migration/tests.

### Inspirations / album de tendances
Permettre à la cliente de parcourir un mini-album d'inspirations avant son RDV
et de "favoriser" celles qui lui plaisent, transmises automatiquement à Chloé.

**Pourquoi différé :** demande un travail UX/produit important. Aujourd'hui les
clientes envoient leurs inspirations en photos jointes à la réservation, ce qui
fonctionne.

### Filtres avancés (résa)
Filtrer les créneaux disponibles par : matin/après-midi, semaine/week-end,
créneaux libres ≥ X jours d'avance, etc.

**Pourquoi différé :** la UX actuelle (clic sur jour → voir les créneaux libres)
suffit tant que le volume reste modeste.

### Saison & suggestions
- Afficher un mini-encart "saison de cette couleur" sur les pages prestations
- Recommander des prestations connexes ("vous prenez X, regardez aussi Y")

**Pourquoi différé :** ces features nécessitent un système de taxonomie sur les
prestations (tags "été", "fête", "discret"…) qui n'existe pas encore en DB.

---

## Notes générales

- Avant chaque item de cette liste, vérifier si le problème qu'il résout existe
  vraiment en prod (don't optimize for hypothetical pain).
- La todo principale (in-flight) continue à suivre les priorités MVP.
- Quand un item est démarré, le déplacer dans la todo principale et le supprimer
  d'ici.
