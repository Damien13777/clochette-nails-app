# Spec — Suite de tests E2E (Clochette Nails v2)

**Date :** 2026-06-03
**Statut :** validé (design), à transformer en plan d'implémentation
**Auteur :** Damien + Claude

---

## 1. Contexte & objectif

La première tentative de suite E2E (Playwright) avait échoué non pas sur
l'**écriture** des tests mais sur leur **exécution** : garde-fou anti-IA de
Prisma 7 sur `db push --force-reset`, rôle DB sans `CREATEDB`, ordre
`webServer` avant `globalSetup`, sandbox. Tout avait été annulé et le repo
remis au dernier commit stable.

On réattaque **différemment**, avec un objectif double :

- **Valider maintenant** que les flux critiques marchent avant déploiement.
- **Garder** une suite commitée, rejouable avant chaque déploiement / après
  chaque changement.

**Principe directeur de l'exécution :** séparer le **destructif** (création du
schéma, **une seule fois**, par l'humain → aucun garde-fou) du **rejouable**
(reset des données par du SQL applicatif → aucun garde-fou). Plus jamais de
commande Prisma destructive lancée par l'agent.

## 2. Périmètre couvert

Quatre groupes de flux (tous retenus) :

1. **Réservation** (le cœur du site).
2. **Formulaires publics** : contact, achat carte cadeau, achat ebook.
3. **Admin** : connexion + une action sensible.
4. **Smoke public + mode maintenance 503**.

## 3. Faits du code qui pilotent les assertions

Vérifié dans le code (au 2026-06-03) :

| Flux | Comportement sans Stripe (env test) | Assertion E2E |
|------|--------------------------------------|---------------|
| Réservation | `stripe` null → **fallback dev** auto-confirme → `/reservation/succes?token=…`, Booking `CONFIRMED` (`src/lib/actions/booking.ts:445`) | Happy path complet |
| Contact | crée `ContactMessage`, aucun Stripe | Happy path complet |
| Ebook | carte cadeau couvrant 100% → `/ebooks/succes?p=…`, `EbookPurchase` `PAID` sans Stripe (`ebook-purchase.ts:221`) ; sinon `STRIPE_UNAVAILABLE` | Happy path **via carte cadeau seedée** |
| Carte cadeau (achat) | `STRIPE_UNAVAILABLE` **avant** toute écriture DB (`gift-card-public.ts:78`) | **Dégradation gracieuse** uniquement (cf. §7) |
| reCAPTCHA | `verifyRecaptcha` **skip** si pas de `RECAPTCHA_SECRET_KEY` | Aucun token requis |
| Admin login | route `/admin/connexion`, champs `email` / `password`, succès → `/admin` (`login-form.tsx`) | Login + action |
| Maintenance | toggle `maintenanceMode` en DB, proxy reflète en **≤ 10 s** (cache TTL), `/admin` + assets passent (`src/proxy.ts:32`) | 503 + noindex via polling |

Seeds existants (`prisma/seed.ts`) : admin `chloe@clochette-nails.fr` /
`admin123`, `PlatformSettings` (depositPercent 30, bookingMinAdvanceHours 72),
horaires, mois réservables, services + options publiés. **Ne crée ni ebook ni
carte cadeau** → les fixtures E2E devront les ajouter.

## 4. Approche d'exécution & base de données

**Approche retenue : base de test dédiée `clochette_test`.**

```
[1 SEULE FOIS — humain]
  createdb -O clochette_dev_user clochette_test
  DATABASE_URL=<test> pnpm db:push        # humain → pas de garde-fou Prisma

[CHAQUE RUN — pnpm test:e2e]
  globalSetup : TRUNCATE … RESTART IDENTITY CASCADE + reseed
                (SQL applicatif via pg/Prisma → AUCUN garde-fou, rejouable ∞)
  webServer   : next dev -p 3100, Stripe/Resend/reCAPTCHA OFF,
                DATABASE_URL=clochette_test (schéma préexiste → boot OK)
  tests       → aucun teardown (reset au run suivant)
```

Points clés :

- La base de test est **possédée par `clochette_dev_user`** (`-O`) → l'app y a
  tous les droits au runtime sans superuser ; `TRUNCATE` fonctionne.
- `clochette_dev` n'est **jamais** touchée → `pnpm dev` (:3000) et `db:studio`
  peuvent rester ouverts pendant les tests (:3100).
- Le schéma préexistant règle le bug « `webServer` démarre avant
  `globalSetup` » : le serveur boote sur un schéma déjà présent ; `globalSetup`
  ne fait que vider + reseed (rapide) avant le premier test.
- `next dev` (pas `next build/start`) pour la v1 : zéro étape de build, plus
  tolérant. `webServer.timeout` généreux pour absorber la 1ʳᵉ compilation.

**Alternatives écartées :** tests contre `clochette_dev` (pollution, non
déterministe), Postgres éphémère Docker (ajoute Docker à une stack VPS/PM2 sans
conteneur — over-engineering pour un dev solo).

## 5. Arborescence

```
playwright.config.ts            # config (webServer :3100, globalSetup, projet chromium)
.env.test                       # GITIGNORED : DATABASE_URL test + clés vides
e2e/
  global-setup.ts               # truncate + reseed via fixtures
  fixtures.ts                   # données déterministes (admin, settings, ebook, gift card…)
  helpers/
    auth.ts                     # loginAsAdmin(page)
    maintenance.ts              # setMaintenance(bool) + waitForMode(...)
  reservation.spec.ts
  formulaires.spec.ts           # contact + ebook + carte cadeau (dégradation)
  admin.spec.ts
  smoke-maintenance.spec.ts
```

Scripts `package.json` :
- `test:e2e:init` — affiche/enchaîne les commandes one-shot (createdb + db:push).
- `test:e2e` — `playwright test`.
- `test:e2e:ui` — `playwright test --ui` (debug local, optionnel).

## 6. Fixtures seedées (déterministes)

Reseed complet à chaque run, dans cet ordre (FK-safe) :

- **Admin** : `chloe@clochette-nails.fr` / `admin123` (rôle ADMIN, actif).
- **PlatformSettings** : tous les flags **ON** (`bookingsEnabled`,
  `giftCardsEnabled`, `ebooksEnabled`), `maintenanceMode=false`,
  depositPercent 30.
- **Horaires** + **mois réservables** (courant + suivant) pour garantir un
  créneau futur disponible compatible `bookingMinAdvanceHours=72`.
- **Services + options** publiés (réutilise la logique du seed existant).
- **1 ebook publié** avec `pdfUrl` + `priceCents > 0`.
- **1 carte cadeau `ACTIVE`** avec solde ≥ prix de l'ebook (sert au happy path
  ebook) + date d'expiration future.

## 7. Scénarios & assertions

**reservation.spec.ts**
- Happy path : choisir une prestation publiée → un créneau futur dispo → infos
  client → submit → `await expect(page).toHaveURL(/\/reservation\/succes/)` +
  vérif DB : un `Booking` `CONFIRMED` existe pour cet email.
- Validation : submit avec un champ requis manquant → message d'erreur visible
  (pas de navigation succès).

**formulaires.spec.ts**
- Contact happy : remplir + submit → message succès + `ContactMessage` en DB.
- Contact erreur : email invalide → erreur de validation visible.
- Ebook happy : page ebook → saisir le code carte cadeau seedé (couvre 100%) →
  submit → `/ebooks/succes` + `EbookPurchase` `PAID` en DB.
- Carte cadeau (dégradation) : remplir un achat valide → submit → message
  « paiement indisponible » affiché proprement, aucune exception non gérée.
  (Le happy path Stripe reste couvert manuellement — cf. §10.)

**admin.spec.ts**
- Login : `/admin/connexion` → creds admin → redirection `/admin` (assert URL +
  un élément du dashboard).
- Action sensible : ouvrir une réservation seedée (ou créée par le test résa) →
  valider/refuser → assert changement de statut (UI + DB).

**smoke-maintenance.spec.ts**
- Smoke : `/`, `/prestations`, `/mentions-legales`, `/confidentialite`, `/cgv`
  répondent 200.
- Maintenance : `setMaintenance(true)` → poll de `/` jusqu'à **503** (≤ ~11 s,
  via `expect.poll`/`toPass`) + header `X-Robots-Tag: noindex` ; `/admin/connexion`
  reste **200** ; puis `setMaintenance(false)` → poll `/` jusqu'à **200**.
  Spec exécutée **en série** et en dernier pour éviter d'impacter les autres.

## 8. Secrets & isolation

- `.env.test` **gitignored** : `DATABASE_URL` → `clochette_test`,
  `STRIPE_SECRET_KEY` / `RESEND_API_KEY` / `RECAPTCHA_SECRET_KEY` **vides**.
- Aucun secret commité ; aucun appel réseau réel (Stripe/Google/Resend) →
  tests rapides et non-flaky.
- `playwright.config.ts` : `reuseExistingServer: false`, port dédié 3100,
  `fullyParallel` désactivé pour les specs qui touchent l'état partagé
  (maintenance), `workers: 1` en CI/local pour éviter les courses sur la base.

## 9. Répartition MOI / TOI (zéro blocage)

- **MOI (Claude)** : j'écris 100% des fichiers + une doc runbook ; je fournis
  les commandes **exactes en copier-coller**.
- **TOI** : tu lances `test:e2e:init` (une fois) puis `pnpm test:e2e` ; tu colles
  la sortie, j'analyse et je corrige les specs.
- **Règle d'or** : à la moindre friction d'exécution de mon côté (sandbox,
  garde-fou, perms), je te **handoff** immédiatement sans m'acharner.

## 10. Hors-scope (YAGNI v1)

- Happy path Stripe réel (carte cadeau / paiement booking complet via webhook
  `checkout.session.completed`) → validé manuellement ; add-on possible plus
  tard (clés Stripe test + 2ᵉ webServer, ou fallback dev dans les actions).
- Tests visuels / régression de pixels.
- CI (GitHub Actions) → la suite est conçue CI-ready, branchement ultérieur.
- Couverture exhaustive des cas d'erreur (un cas de validation par flux suffit).

## 11. Risques & mitigations

| Risque | Mitigation |
|--------|-----------|
| 1ʳᵉ compilation `next dev` lente → timeout navigation | `webServer.timeout` + `navigationTimeout` généreux |
| Cache maintenance 10 s → test flaky | polling `expect.poll`/`toPass` jusqu'au basculement, spec en série |
| Créneau dispo introuvable (règle 72 h + horaires) | fixtures calculent un jour ouvré futur déterministe |
| Course sur la base si parallélisme | `workers: 1`, specs à état partagé en série |
| Agent bloqué à l'exécution | handoff humain (cf. §9) |
