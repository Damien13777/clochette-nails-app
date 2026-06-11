# Audit UI/UX pré-déploiement — Clochette Nails v2

**Date :** 2026-06-11 · **Base :** `main` @ `660e4a1` · **Méthode :** revue
heuristique au navigateur (Chrome piloté) — landing mobile 390px, funnel de
réservation complet interactif, page cartes-cadeau, admin 1280px (dashboard,
bookings liste + fiche, Finances→Factures, Paramètres→Avis). Compte admin
temporaire créé puis supprimé pour la session.

**Reste à faire par Damien :** passe sur appareils réels iPad/iPhone (les bugs
iOS du projet — date input, text-size-adjust — n'ont jamais été reproductibles
en émulation).

---

## Synthèse

**Niveau très élevé.** Le funnel de réservation est exemplaire (étapes
accordéon, récap sticky avec acompte en direct, créneaux qui intègrent la
durée de prestation ET la pause déjeuner, consentement légal propre,
formulaire final complet). L'admin est cohérent, hiérarchisé et agréable.
**1 finding UX réel** à arbitrer, 1 incohérence de contenu corrigée, le reste
est de la confirmation de qualité.

| # | Sév. | Sujet | Statut |
|---|------|-------|--------|
| 1 | 🟡 | **Calendrier réservation : jours fermés cliquables** — la cliente découvre « Salon fermé ce jour-là » par essai-erreur (3 jours fermés sur 7 : lun/mer/dim) | **À arbitrer** — proposition ci-dessous |
| 2 | 🔵 | Cartes cadeau : metas/OG disaient « valable 12 mois » alors que settings = 180 j (6 mois) et que la page affiche 6 | ✅ corrigé — `generateMetadata` branché sur `giftCardExpiryDays` |
| 3 | ℹ️ | Bouton « N » flottant sur toutes les pages | Non-sujet : Next.js DevTools, dev uniquement |
| 4 | ℹ️ | Captures fullPage « vides » (sections Reveal) et images lazy absentes | Artefact d'outil de capture, pas un bug — `Reveal` gère `prefers-reduced-motion` en CSS ✓ |

## Finding #1 — jours fermés cliquables (proposition)

**Constat** : dans l'étape « Date et créneau », tous les jours ≥ aujourd'hui
sont cliquables à l'identique. Cliquer dimanche 14 → sélection violette puis
« Salon fermé ce jour-là. » Le message est propre, mais avec lun/mer/dim
fermés, la cliente peut enchaîner 2-3 clics « pour rien » avant de trouver un
jour ouvert — friction inutile dans LE parcours de conversion.

**Proposition** : griser et désactiver les jours **structurellement fermés**,
calculés côté serveur pour le mois affiché à partir de : `BusinessHours`
(pattern hebdo), `DayException` (fermetures ponctuelles), `BookableMonth`
(mois non ouverts). On ne précalcule PAS la disponibilité fine par créneau
(coûteux et inutile : un jour ouvert mais complet affichera « aucun créneau »,
ce qui est un message différent et acceptable). Effort estimé : ~1 h
(endpoint léger ou prop serveur + état disabled du gridcell, déjà stylé pour
les jours passés).

## Confirmations de qualité (vérifiées en situation)

**Funnel réservation (mobile 390px)** — le cœur du business :
- 4 étapes accordéon avec états (✓ vert, actif, désactivé), reassurance
  « ~2 minutes », récap sticky permanent (prestation · durée · **acompte
  calculé en direct** : 13,50 € affiché dès la sélection).
- Étape 1 : 11 prestations en radios a11y + filtres par catégorie (tabs).
- Étape 2 : 9 options avec durées « + X min », CTA qui s'adapte
  (« Continuer sans option »).
- Étape 3 : calendrier custom (pas d'input natif → pas de piège iOS) ;
  **créneaux intelligents** : pour 2 h de prestation, dernier départ 10:30
  (fin 12:30 = début de pause), reprise 13:30 — la logique métier
  durée × horaires × pause est exacte.
- Étape 4 : coordonnées avec placeholder FR, upload photos (5 max · 5 Mo ·
  formats listés), code cadeau vérifiable inline, **consentement CGV +
  mention acompte non remboursable > 72 h**, mention reCAPTCHA, CTA explicite
  (« Continuer vers le paiement de l'acompte ») désactivé tant que le
  consentement manque.

**Landing mobile** : hero + badges, sections engagement/prestations (images,
badge SIGNATURE)/portfolio (filtres + photos filigranées)/avis (cards
alignées, ligne Google pilotée par settings)/contact/CTA final — cohérence DS
totale, rien à signaler.

**Cartes cadeau** : presets de montants + montant libre, toggle « Pour
offrir / Pour moi », CTA dynamique (« Payer 50,00 € — carte bancaire »),
mentions Stripe/validité.

**Admin (1280px)** : dashboard (KPIs, agenda badgé, alertes « Tout va
bien ») ; login avec état d'erreur propre ; bookings (tabs par statut avec
compteurs, pagination) ; fiche booking (hiérarchie d'actions : honorée en
primaire violet → déplacer → no-show orange → annuler rouge ; états paiement
contextualisés « Aucun acompte demandé » ; rappels J-7/J-1 avec envoi manuel ;
notes admin avec compteur) ; Finances→Factures (état vide propre, filtres) ;
Paramètres→Avis (CRUD complet, réordonnancement, ligne Google).

**A11y spot-checks** : radios/tabs/gridcells correctement exposés dans l'arbre
d'accessibilité, un seul h1 rendu par page, labels de formulaires liés,
`aria-label` sur boutons d'ordre des avis.

## Hors scope → checklist Damien (appareils réels)

1. iPad Air + iPhone : funnel réservation complet, modales admin
   (« Marquer honorée », « Déplacer »), page factures.
2. Safari macOS : un passage rapide (rendu fonts/backdrop).
3. Lighthouse ré-audit post-déploiement (déjà 100/100/100 en local).
