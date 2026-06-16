# Runbook — Passage en production Stripe (Clochette Nails v2)

> Compte Stripe **LIVE** pour l'**EI Girard Chloé**. À suivre dans l'ordre, en
> cochant au fur et à mesure. Date cible de bascule : **jeudi 18/06/2026**.
> Complète `docs/AUDIT-PRE-DEPLOIEMENT.md` (§ jour J) et `TODO.md` (§ Déploiement).

## Architecture (pour comprendre les choix)

- **3 flux de paiement**, tous en **Checkout Session `mode: "payment"`** (paiement
  unique) : acompte RDV, carte cadeau, ebook.
- Redirection **100 % côté serveur** via `session.url` (pas de `@stripe/stripe-js`,
  pas de clé publishable côté client).
- Discriminés au webhook par `session.metadata.type`.
- Webhook `/api/webhooks/stripe` : déduplication via table `StripeEvent`.
- SDK `stripe` v22, `apiVersion` épinglée `2026-04-22.dahlia` (dans `src/lib/stripe.ts`).
- **Pas de Stripe Tax**, **pas d'`invoice_creation`** : les factures sont
  générées par l'app (PDF légaux), Stripe n'en émet aucune.

---

## Phase 1 — Création & activation du compte (cette semaine)

- [ ] **Type d'entreprise** : Particulier / Entreprise individuelle — nom légal
      **EI Girard Chloé**, avec SIREN/SIRET
- [ ] **Secteur** : salon de beauté / onglerie (code MCC 7230 « Barber and Beauty Shops »)
- [ ] **Email du compte** = adresse **studioG4 définitive** (c'est le login owner
      + les notifs KYC + les notifs de virement → adresse pérenne, pas perso)
- [ ] **KYC** : pièce d'identité + justificatif d'adresse (l'activation peut
      prendre 1–2 jours → à lancer tôt)
- [ ] **Compte bancaire de versement** : IBAN au nom de l'EI
- [ ] **Descripteur de relevé** (statement descriptor) : **`CLOCHETTE NAILS`**
      (≤ 22 caractères, reconnaissable sur le relevé bancaire de la cliente →
      réduit les litiges). Le code n'en définit pas par session → c'est le
      réglage compte qui s'applique.
- [ ] **Coordonnées publiques** : nom commercial, email + téléphone de support
- [ ] **Intégration** : « Formulaire de paiement préconfiguré » = Stripe Checkout
      ✅ *(déjà sélectionné)*
- [ ] **E-mails clients OFF** — Paramètres → E-mails aux clients
      (`dashboard.stripe.com/settings/emails`) :
      « Paiements réussis » **OFF** + « Remboursements » **OFF**
      *(l'app envoie déjà confirmation + facture PDF → éviter le doublon)*
- [ ] **Pas de Stripe Tax** : micro = franchise en base, TVA non applicable
      (art. 293 B du CGI) — cohérent avec les factures de l'app. Ne rien activer.
- [ ] **Moyens de paiement** : garder **Carte** (Apple/Google Pay s'ajoutent
      automatiquement via Checkout). **Désactiver les BNPL** (Klarna/Alma…) :
      payer un acompte ou une carte cadeau en plusieurs fois n'a pas de sens.
- [ ] *(optionnel, premium)* **Branding de la page Checkout** : logo + couleur
      violet de la marque — Paramètres → Branding

---

## Phase 2 — Clés & webhook LIVE (jeudi — préparable avant)

> ⚠️ **TOUT en MODE LIVE** (toggle en haut du dashboard). Vérifier le bandeau
> « Live » avant chaque action de cette phase.

- [ ] Récupérer la **clé secrète LIVE** : `sk_live_…`
      (Développeurs → Clés API, en mode Live)
- [ ] Renseigner dans **l'env du VPS** (jamais commité) :
      ```
      STRIPE_SECRET_KEY="sk_live_…"
      STRIPE_WEBHOOK_SECRET="whsec_…"   # rempli à l'étape webhook ci-dessous
      ```
- [ ] **Créer le endpoint webhook** (en mode Live) :
      Développeurs → Webhooks → Ajouter un endpoint
      URL = `https://clochette-nails.fr/api/webhooks/stripe`
- [ ] **Cocher EXACTEMENT ces 3 events** (le code ignore tout le reste) :
      - `checkout.session.completed` *(confirme booking / ebook / carte cadeau)*
      - `charge.updated` *(récupère les frais Stripe réels pour les Finances)*
      - `payment_intent.payment_failed`
- [ ] Copier le **« signing secret »** `whsec_…` du endpoint → `STRIPE_WEBHOOK_SECRET`
      (VPS). ⚠️ Il est **différent** du secret de `stripe listen` utilisé en dev.

🔴 **Piège n°1 (silencieux)** : créer le webhook en mode **TEST** → on met un
`whsec_` de test en prod → **toutes les signatures échouent** → les paiements
réussissent mais les RDV ne se confirment jamais, les cartes cadeau ne
s'activent pas, aucun email ne part. Toujours vérifier le bandeau **Live**.

> **Note clé publishable** : le code actuel **ne l'utilise pas** (redirection
> serveur via `session.url`). `STRIPE_PUBLISHABLE_KEY` figure dans `.env.example`
> mais n'est référencée nulle part → **non requise** pour que les paiements
> marchent. On peut la renseigner (`pk_live_…`) pour le futur, mais ce n'est pas
> bloquant.

---

## Phase 3 — Validation avant ouverture publique (jeudi, après bascule DNS)

- [ ] **1 vraie transaction LIVE** de bout en bout (carte cadeau 10 € ou acompte
      réel, vraie carte)
- [ ] Webhook livré en **200** (Développeurs → Webhooks → onglet du endpoint →
      « Tentatives »)
- [ ] Le statut bascule en base (gift card `ACTIVE` / booking `CONFIRMED`)
- [ ] Email cliente **+ facture PDF** reçus
- [ ] **Remboursement** depuis le dashboard → vérifier le chemin d'avoir
      (l'app génère l'avoir + email)
- [ ] Vérifier la balance / le virement à venir (Solde)

---

## Phase 4 — Post-lancement

- [ ] Surveiller les premiers paiements réels (dashboard → Paiements)
- [ ] **Radar** (anti-fraude) actif par défaut — rien à configurer
- [ ] Connaître le flux **litige/chargeback** : email Stripe → répondre avec
      les preuves (confirmation, facture, photos RDV) depuis le dashboard

---

## Récap — variables d'env prod (VPS)

| Variable | Valeur | Requis ? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` | **OUI** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (endpoint **LIVE**) | **OUI** |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | Non (inutilisée par le code actuel) |
