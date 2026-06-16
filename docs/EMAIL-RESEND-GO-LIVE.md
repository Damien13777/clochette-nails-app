# Runbook — Passage en production Resend (Clochette Nails v2)

> Mise en service de l'**envoi d'emails** (transactionnels + newsletter) via
> Resend, domaine d'envoi **`clochette-nails.fr`**. À suivre dans l'ordre.
> Compte créé avec une **adresse perso** pour l'instant → transfert de propriété
> vers l'email **studioG4** plus tard (cf. dernière section).
> Complète `docs/STRIPE-GO-LIVE.md` et `TODO.md` (§ Déploiement).

## Architecture (pour comprendre les choix)

- **Resend ENVOIE** les emails (`resend.emails.send`) — confirmations RDV,
  factures, cartes cadeau, ebooks, **newsletter**. SDK `resend` **v6.12.3**
  (≥ minimum requis → `webhooks.verify()` OK, rien à mettre à jour).
- **From** : `Clochette Nails <contact@clochette-nails.fr>` (`RESEND_FROM_EMAIL`).
  ⚠️ Le domaine du `from` doit matcher **exactement** le domaine vérifié.
- **Webhook** `/api/webhooks/resend` (signature **Svix**) : tracking newsletter
  (ouvertures/clics/bounces/plaintes). 8 events gérés.
- **Pas de mode test/live** chez Resend (contrairement à Stripe) : une seule clé
  API. Tant que le domaine n'est pas vérifié, Resend n'envoie qu'à l'adresse du
  compte (sandbox `onboarding@resend.dev`).

> 🟢 **Bonne nouvelle timing** : la **vérification du domaine (Phase 2) peut se
> faire MAINTENANT**, sans attendre jeudi. Elle n'ajoute que des enregistrements
> TXT/CNAME au DNS — **elle ne touche pas l'enregistrement A**, donc le site v1
> en prod n'est pas impacté. La faire tôt = DNS propagé + 1 risque de moins le
> jour J.

---

## Phase 1 — Créer le compte (maintenant)

- [ ] S'inscrire sur `resend.com` avec **l'adresse perso** (transfert studioG4
      plus tard)
- [ ] Activer la **2FA** sur le compte (il enverra des emails au nom du salon)

## Phase 2 — Vérifier le domaine d'envoi (maintenant — ne casse rien)

- [ ] Resend → **Domains → Add Domain** → `clochette-nails.fr`
- [ ] **Région : EU (Ireland)** — résidence des données RGPD + proche des
      destinataires FR. ⚠️ La région est **définitive** par domaine → choisir EU
      dès maintenant.
- [ ] Resend affiche les **enregistrements DNS à créer** (générés pour ton
      domaine) : **DKIM** (TXT/CNAME), **SPF** (TXT, souvent sur un sous-domaine
      d'envoi type `send.clochette-nails.fr` + son MX de return-path), et une
      reco **DMARC**.
- [ ] Les ajouter dans le DNS (chez l'hébergeur du domaine — Hostinger /
      registrar).

🔴 **Gotcha SPF (le plus important)** : il ne peut exister qu'**UN SEUL**
enregistrement SPF (`v=spf1 …`) par domaine. Si `clochette-nails.fr` en a déjà
un (la v1 PHP envoie des emails via SMTP) → **FUSIONNER** l'`include` de Resend
dans l'existant, **ne JAMAIS créer un 2ᵉ SPF** (deux SPF = SPF invalide = tout
casse, v1 comprise). *(Resend met souvent le SPF sur un sous-domaine d'envoi
dédié → moins de conflit, mais vérifie quand même.)*

🟡 **DMARC** : si aucun DMARC n'existe, commencer en **`p=none`** (surveillance
seule) pour ne pas perturber les emails actuels de la v1. On durcira
(`quarantine`/`reject`) plus tard, une fois la délivrabilité confirmée.

- [ ] Attendre que Resend passe le domaine en **« Verified »** (vert). La
      propagation DNS peut prendre de quelques minutes à quelques heures.

## Phase 3 — Clé API (maintenant ou jeudi)

- [ ] Resend → **API Keys → Create** : permission **« Sending access »**
      (moindre privilège — l'app ne fait qu'envoyer).
- [ ] La copier dans l'**env du VPS** : `RESEND_API_KEY="re_…"` (jamais commitée).

> Note : si un jour un appel renvoie **401 `restricted_api_key`**, c'est qu'une
> clé sending-only a été utilisée sur un endpoint non-envoi → créer une clé
> full-access. L'app actuelle n'envoie que → sending-only suffit.

## Phase 4 — Webhook newsletter (jeudi — préparable avant)

- [ ] Resend → **Webhooks → Add Endpoint** :
      URL = `https://clochette-nails.fr/api/webhooks/resend`
- [ ] Sélectionner les **8 events** gérés par le code (ou « tous les email
      events ») :
      `email.sent`, `email.delivered`, `email.delivery_delayed`,
      `email.bounced`, `email.complained`, `email.opened`, `email.clicked`,
      `email.failed`
- [ ] Copier le **« Signing Secret »** (Svix, commence par `whsec_`) →
      `RESEND_WEBHOOK_SECRET` (VPS). En prod **sans** ce secret, le webhook
      renvoie **503** (par design).
- [ ] Le endpoint peut être créé en avance : il affichera des échecs de
      livraison tant que le site n'est pas en ligne — sans gravité.

## Phase 5 — Variables d'env prod (VPS) — récap

| Variable | Valeur | Rôle |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | Authentifie l'envoi |
| `RESEND_FROM_EMAIL` | `Clochette Nails <contact@clochette-nails.fr>` | Expéditeur (domaine = vérifié) |
| `ADMIN_NOTIF_EMAIL` | `contact@clochette-nails.fr` | **Reçoit** les notifs admin (nouveau RDV, contact…) |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` | Vérif signature du webhook tracking |

## Phase 6 — Validation (jeudi, après domaine vérifié)

- [ ] Test technique sûr : envoyer vers `delivered@resend.dev` (simule une
      livraison sans risque réputation) → vérifier `email.delivered` dans les
      logs Resend.
- [ ] Test réel : déclencher une **vraie confirmation de RDV** vers une boîte
      que tu contrôles → l'email arrive **en boîte de réception (pas spam)**.
- [ ] Vérifier l'**authentification** : dans Gmail → « Afficher l'original » →
      **SPF: PASS, DKIM: PASS, DMARC: PASS**.
- [ ] Vérifier que le **webhook** reçoit bien `email.delivered` (Resend →
      Webhooks → onglet du endpoint).

---

## ⚠️ Points de vigilance (hors périmètre « compte Resend » strict)

- **Boîte de réception `contact@clochette-nails.fr`** : ✅ la boîte **existe**
  (Hostinger). Décision 2026-06-16 : on garde **`@clochette-nails.fr` partout**
  (From + affichage + notifs) → **aucun changement de code**. Chloé lit/répond
  depuis **`clochette.nails79@gmail.com`** via une **redirection**
  `contact@clochette-nails.fr → Gmail` + Gmail « Envoyer en tant que »
  contact@clochette-nails.fr (pour répondre avec l'adresse pro). Resend ne fait
  qu'**envoyer** ; la réception passe par le MX Hostinger (intact — la vérif
  Resend n'ajoute que des DKIM/SPF, ne touche pas le MX).
- ⚠️ **Ne PAS mettre `gmail.com` en From** : non vérifiable dans Resend + DMARC
  `p=reject` de Gmail = rejet/spam. Le From reste `@clochette-nails.fr`.
- **Plan Resend & volume** : le plan gratuit = **100 emails/jour, 3 000/mois**.
  Largement suffisant pour le **transactionnel** du salon. Mais une **newsletter**
  à plusieurs centaines d'abonnées dépasse les 100/jour → prévoir le plan **Pro**
  (~20 $/mois, 50 000/mois) **ou** étaler l'envoi. À arbitrer selon la taille de
  la liste au 1er envoi.
- **Warm-up** : un domaine neuf doit monter en volume progressivement. À la
  volumétrie transactionnelle du salon, **non-sujet**. Pour le 1er gros envoi
  newsletter, rester sous ~150 le jour 1 si possible.

## Transfert de propriété vers studioG4 (plus tard)

Le compte est créé sous une adresse perso. Quand l'email **studioG4** sera prêt :
- L'ajouter comme **membre** de l'équipe Resend, puis transférer le rôle
  **propriétaire** (ou recréer le compte sous studioG4 si peu de données — mais
  le transfert évite de refaire la vérif domaine + les clés).
