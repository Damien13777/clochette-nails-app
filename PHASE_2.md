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
