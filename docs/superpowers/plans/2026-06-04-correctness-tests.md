# Correctness Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Couvrir par Vitest les 4 invariants money/concurrence (redemption gift-card, rejeu webhook Stripe, dates Paris/DST, cap+debounce ebook) sur du code déjà en place.

**Architecture :** Suite Vitest dédiée dans `test/`, en série (single fork), réutilisant `e2e/db.ts` (base `clochette_test` + `truncateAll`). Tests purs sans DB pour `paris-day` ; tests d'intégration DB pour gift-card / ebook ; test de route signée offline pour le webhook. Aucune modif du code app ni du schéma Prisma.

**Tech Stack :** Vitest, Prisma 7 (`@prisma/adapter-pg`), Stripe SDK (`generateTestHeaderString`, crypto offline), `vi.stubEnv` + import dynamique pour les constantes env-at-module-load.

---

## File structure

| Fichier | Rôle |
|---|---|
| `vitest.config.ts` (create) | Config Vitest : alias `@/`, env node, série single-fork, include `test/**` |
| `package.json` (modify) | Scripts `test` / `test:watch` + devDep `vitest` |
| `test/paris-day.test.ts` (create) | Tests purs DST/bornes Paris (aucune DB) |
| `test/gift-card-redeem.test.ts` (create) | DB : idempotence + concurrence optimistic lock |
| `test/ebook-download.test.ts` (create) | DB : cap 5 + debounce 30 s + gardes |
| `test/stripe-webhook.test.ts` (create) | DB + route `POST` signée : rejeu idempotent |
| `TODO.md` (modify) | Cocher « tests de correctness livrés » |

**Réutilisation :** `import { db, truncateAll } from "../e2e/db"` (même base de test, schéma déjà à jour — pas de `db push`). Les suites Vitest et Playwright partagent `clochette_test` mais ne tournent jamais en même temps.

---

## Task 0 : Scaffolding Vitest

**Files :**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1 : Installer Vitest (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm add -D vitest
```
Attendu : `vitest` ajouté à `devDependencies`, install OK.

- [ ] **Step 2 : Créer `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Alias @/ → src/ (le tsconfig mappe "@/*": ["./src/*"]). On n'utilise PAS
// vite-tsconfig-paths pour éviter une dépendance de plus.
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcPath}/` }],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Série stricte : les tests DB partagent clochette_test + truncateAll.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 3 : Ajouter les scripts dans `package.json`**

Dans `"scripts"`, après la ligne `"test:e2e:ui": "playwright test --ui",` ajouter :
```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 4 : Vérifier que le runner démarre (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test
```
Attendu : Vitest démarre et affiche `No test files found, exiting with code 0` (ou code 1 selon version avec « No test files found » — l'important est que Vitest se lance sans erreur de config/alias). On ajoute les tests aux tasks suivantes.

- [ ] **Step 5 : Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "test: scaffolding Vitest (config + scripts)"
```

---

## Task 1 : `paris-day` (tests purs, sans DB)

**Files :**
- Create: `test/paris-day.test.ts`

- [ ] **Step 1 : Écrire le test**

```ts
import { describe, expect, it } from "vitest";
import {
  startOfDayParisAsUtc,
  isoDateParis,
  mondayIsoForTodayParis,
} from "@/lib/paris-day";

describe("paris-day — correction DST (le bug que ces helpers évitent)", () => {
  it("été (UTC+2) : 22:30Z est déjà le lendemain à Paris", () => {
    // 2025-07-15T22:30Z = 2025-07-16 00:30 à Paris → le jour Paris est le 16.
    const d = new Date("2025-07-15T22:30:00.000Z");
    expect(startOfDayParisAsUtc(d).toISOString()).toBe("2025-07-16T00:00:00.000Z");
    expect(isoDateParis(d)).toBe("2025-07-16");
  });

  it("hiver (UTC+1) : 23:30Z est déjà le lendemain à Paris", () => {
    // 2025-01-15T23:30Z = 2025-01-16 00:30 à Paris → le jour Paris est le 16.
    const d = new Date("2025-01-15T23:30:00.000Z");
    expect(startOfDayParisAsUtc(d).toISOString()).toBe("2025-01-16T00:00:00.000Z");
    expect(isoDateParis(d)).toBe("2025-01-16");
  });

  it("même instant UTC, même jour Paris en milieu de journée", () => {
    const d = new Date("2025-07-15T10:00:00.000Z"); // 12:00 Paris
    expect(isoDateParis(d)).toBe("2025-07-15");
  });
});

describe("paris-day — mondayIsoForTodayParis", () => {
  it("renvoie toujours un lundi (UTC day === 1)", () => {
    const iso = mondayIsoForTodayParis();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = iso.split("-").map(Number);
    expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1);
  });
});
```

- [ ] **Step 2 : Lancer (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test test/paris-day.test.ts
```
Attendu : **PASS** (les helpers sont déjà corrects). Si ÉCHEC → vrai bug de timezone à corriger dans `src/lib/paris-day.ts`.

- [ ] **Step 3 : Commit**

```bash
git add test/paris-day.test.ts
git commit -m "test(paris-day): bornes DST + mondayIso"
```

---

## Task 2 : `gift-card-redeem` (DB : idempotence + concurrence)

**Files :**
- Create: `test/gift-card-redeem.test.ts`

Champs requis `GiftCard` (cf. `prisma/schema.prisma`) : `code`, `codeHash`, `prefix`, `initialAmountCents`, `remainingAmountCents`, `buyerEmail`, `buyerName`, `deliveryMode`, `expiresAt`, `amount`. `version` a un `@default(0)`. `codeHash` n'est pas un vrai bcrypt ici (on appelle la fonction par id, pas par code) → une chaîne unique suffit.

- [ ] **Step 1 : Écrire le test**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import {
  applyGiftCardRedemption,
  GiftCardRedemptionError,
  type RedemptionInput,
} from "@/lib/gift-card-redeem";

async function makeActiveGiftCard(amountCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.giftCard.create({
    data: {
      code: `TEST-${rand}`,
      codeHash: `hash-${rand}`,
      prefix: rand.slice(-4),
      status: "ACTIVE",
      initialAmountCents: amountCents,
      remainingAmountCents: amountCents,
      buyerEmail: "buyer@test.local",
      buyerName: "Test Buyer",
      deliveryMode: "EMAIL_TO_BUYER",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      amount: amountCents,
      paymentStatus: "PAID",
      creationMode: "PUBLIC",
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("applyGiftCardRedemption — idempotence (rejeu webhook)", () => {
  it("2× mêmes (giftCardId, bookingId, type) → débite une seule fois", async () => {
    const card = await makeActiveGiftCard(5000);
    const input: RedemptionInput = {
      giftCardId: card.id,
      amountCents: 2000,
      bookingId: "booking-1",
      redeemedByEmail: "client@test.local",
      type: "BOOKING_DEPOSIT",
    };
    await applyGiftCardRedemption(input);
    await applyGiftCardRedemption(input); // rejeu

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(3000);
    expect(await db.giftCardRedemption.count({ where: { giftCardId: card.id } })).toBe(1);
  });
});

describe("applyGiftCardRedemption — concurrence (optimistic lock version)", () => {
  it("deux redemptions simultanées dépassant le solde → une seule réussit", async () => {
    const card = await makeActiveGiftCard(5000);
    const mk = (bookingId: string) =>
      applyGiftCardRedemption({
        giftCardId: card.id,
        amountCents: 3000,
        bookingId,
        redeemedByEmail: "client@test.local",
        type: "BOOKING_DEPOSIT",
      });

    const results = await Promise.allSettled([mk("booking-A"), mk("booking-B")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(2000);
    expect(await db.giftCardRedemption.count({ where: { giftCardId: card.id } })).toBe(1);
  });
});

describe("applyGiftCardRedemption — gardes", () => {
  it("solde insuffisant → throw INSUFFICIENT, solde inchangé", async () => {
    const card = await makeActiveGiftCard(1000);
    await expect(
      applyGiftCardRedemption({
        giftCardId: card.id,
        amountCents: 2000,
        bookingId: "booking-x",
        redeemedByEmail: "client@test.local",
        type: "BOOKING_DEPOSIT",
      }),
    ).rejects.toBeInstanceOf(GiftCardRedemptionError);

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(1000);
    expect(await db.giftCardRedemption.count()).toBe(0);
  });

  it("redemption du solde total → statut FULLY_USED", async () => {
    const card = await makeActiveGiftCard(2000);
    await applyGiftCardRedemption({
      giftCardId: card.id,
      amountCents: 2000,
      bookingId: "booking-full",
      redeemedByEmail: "client@test.local",
      type: "BOOKING_DEPOSIT",
    });
    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(0);
    expect(after.status).toBe("FULLY_USED");
  });
});
```

- [ ] **Step 2 : Lancer (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test test/gift-card-redeem.test.ts
```
Attendu : **PASS** (4 tests). Si le test de concurrence échoue (2 fulfilled ou solde ≠ 2000) → l'optimistic lock laisse passer un sur-débit = vrai bug à corriger dans `src/lib/gift-card-redeem.ts`.

- [ ] **Step 3 : Commit**

```bash
git add test/gift-card-redeem.test.ts
git commit -m "test(gift-card): idempotence rejeu + concurrence optimistic lock"
```

---

## Task 3 : `ebook-download` (DB : cap + debounce)

**Files :**
- Create: `test/ebook-download.test.ts`

Champs requis `Ebook` : `slug`, `title`, `shortDesc`, `description`, `priceCents` (+ `pdfUrl` requis sinon `resolveDownloadToken` renvoie `NO_PDF`). `EbookPurchase` : `ebookId`, `clientEmail`, `amount`, `downloadToken` (doit matcher `/^[0-9a-f]{64}$/i` → utiliser `generateDownloadToken()`), `tokenExpiresAt`. `downloadCount` `@default(0)`, `lastDownloadAt` nullable.

- [ ] **Step 1 : Écrire le test**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, truncateAll } from "../e2e/db";
import {
  resolveDownloadToken,
  generateDownloadToken,
  MAX_DOWNLOADS_PER_TOKEN,
} from "@/lib/ebook-download-token";

async function makePurchase(opts?: {
  tokenExpiresAt?: Date;
  paymentStatus?: "PAID" | "PENDING";
}) {
  const ebook = await db.ebook.create({
    data: {
      slug: `ebook-${Math.random().toString(36).slice(2, 10)}`,
      title: "Test Ebook",
      shortDesc: "desc",
      description: "desc",
      pdfUrl: "/uploads/ebooks/test.pdf",
      priceCents: 990,
      status: "PUBLISHED",
    },
  });
  const token = generateDownloadToken();
  const purchase = await db.ebookPurchase.create({
    data: {
      ebookId: ebook.id,
      clientEmail: "client@test.local",
      amount: 990,
      paymentStatus: opts?.paymentStatus ?? "PAID",
      downloadToken: token,
      tokenExpiresAt:
        opts?.tokenExpiresAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  return { token, purchaseId: purchase.id };
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("resolveDownloadToken — cap de téléchargements", () => {
  it(`autorise ${MAX_DOWNLOADS_PER_TOKEN} DL puis EXHAUSTED`, async () => {
    const { token, purchaseId } = await makePurchase();
    for (let i = 0; i < MAX_DOWNLOADS_PER_TOKEN; i++) {
      // Repousse lastDownloadAt dans le passé pour franchir le debounce 30 s.
      await db.ebookPurchase.update({
        where: { id: purchaseId },
        data: { lastDownloadAt: new Date(Date.now() - 60_000) },
      });
      const r = await resolveDownloadToken(token);
      expect(r.ok).toBe(true);
    }
    const exhausted = await resolveDownloadToken(token);
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.reason).toBe("EXHAUSTED");

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(MAX_DOWNLOADS_PER_TOKEN);
  });
});

describe("resolveDownloadToken — debounce 30 s (double-fetch navigateur)", () => {
  it("deux appels rapprochés ne comptent que pour un téléchargement", async () => {
    const { token, purchaseId } = await makePurchase();
    const r1 = await resolveDownloadToken(token);
    const r2 = await resolveDownloadToken(token);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(1);
  });
});

describe("resolveDownloadToken — gardes", () => {
  it("token expiré → EXPIRED sans incrément", async () => {
    const { token, purchaseId } = await makePurchase({
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    const r = await resolveDownloadToken(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");

    const after = await db.ebookPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.downloadCount).toBe(0);
  });

  it("paiement non confirmé → NOT_PAID", async () => {
    const { token } = await makePurchase({ paymentStatus: "PENDING" });
    const r = await resolveDownloadToken(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_PAID");
  });
});
```

- [ ] **Step 2 : Lancer (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test test/ebook-download.test.ts
```
Attendu : **PASS** (4 tests). Si le debounce compte 2 au lieu de 1, ou si le cap laisse passer un 6ᵉ → vrai bug dans `src/lib/ebook-download-token.ts`.

- [ ] **Step 3 : Commit**

```bash
git add test/ebook-download.test.ts
git commit -m "test(ebook): cap téléchargements + debounce 30s + gardes"
```

---

## Task 4 : `stripe-webhook` (DB + route signée offline)

**Files :**
- Create: `test/stripe-webhook.test.ts`

**Gotcha critique :** `src/lib/stripe.ts` lit `STRIPE_SECRET_KEY` à l'import (ligne 14) et `src/app/api/webhooks/stripe/route.ts` lit `STRIPE_WEBHOOK_SECRET` à l'import. `e2e/db.ts` charge `.env.test` (qui met `STRIPE_SECRET_KEY=""`). Donc : poser les env via `vi.stubEnv` **avant** un `import()` **dynamique** de la route + de `@/lib/stripe` (ne PAS les importer statiquement). La signature est générée par `stripe.webhooks.generateTestHeaderString` (crypto **locale**, zéro réseau).

- [ ] **Step 1 : Écrire le test**

```ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type Stripe from "stripe";
import { db, truncateAll } from "../e2e/db";

const WEBHOOK_SECRET = "whsec_test_dummy";

// Chargés dynamiquement APRÈS stubEnv (constantes env-at-module-load).
let POST: (req: Request) => Promise<Response>;
let stripe: Stripe;

beforeAll(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  ({ POST } = (await import("@/app/api/webhooks/stripe/route")) as {
    POST: (req: Request) => Promise<Response>;
  });
  const mod = await import("@/lib/stripe");
  stripe = mod.stripe as Stripe; // non-null car STRIPE_SECRET_KEY stubbée
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

beforeEach(truncateAll);

async function makeAwaitingBooking() {
  const service = await db.service.create({
    data: {
      slug: `svc-${Math.random().toString(36).slice(2, 10)}`,
      title: "Soin",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  return db.booking.create({
    data: {
      date: new Date(),
      startTime: "10:00",
      endTime: "10:30",
      serviceId: service.id,
      clientFirstName: "Test",
      clientLastName: "Client",
      clientEmail: "client@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: 750,
      status: "AWAITING_DEPOSIT",
    },
  });
}

function signedRequest(eventId: string, bookingId: string): Request {
  const event = {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${eventId}`,
        object: "checkout.session",
        metadata: { type: "booking", bookingId },
        payment_intent: `pi_test_${eventId}`,
        amount_total: 750,
        customer_details: { email: "client@test.local" },
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
}

describe("Webhook Stripe — idempotence sur rejeu", () => {
  it("le même event.id rejoué ne confirme la booking qu'une fois", async () => {
    const booking = await makeAwaitingBooking();
    const eventId = "evt_test_replay";

    const res1 = await POST(signedRequest(eventId, booking.id));
    expect(res1.status).toBe(200);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await db.stripeEvent.count({ where: { id: eventId } })).toBe(1);

    const res2 = await POST(signedRequest(eventId, booking.id));
    expect(res2.status).toBe(200);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await db.stripeEvent.count({ where: { id: eventId } })).toBe(1);
  });

  it("signature invalide → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ id: "evt_x" }),
        headers: {
          "stripe-signature": "t=1,v1=deadbeef",
          "content-type": "application/json",
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2 : Lancer (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test test/stripe-webhook.test.ts
```
Attendu : **PASS** (2 tests). Si le 2e POST repasse la booking ou crée un 2ᵉ `StripeEvent` → la dédup d'idempotence est cassée = vrai bug dans la route webhook.

> Si erreur `stripe = null` / `WEBHOOK_SECRET manquant` : c'est que les modules ont été importés avant le `stubEnv` → vérifier qu'aucun `import` statique de `@/lib/stripe` ou de la route n'est présent (uniquement les `import()` dynamiques du `beforeAll`).

- [ ] **Step 3 : Commit**

```bash
git add test/stripe-webhook.test.ts
git commit -m "test(webhook): rejeu Stripe idempotent (route signée offline)"
```

---

## Task 5 : Run complet + doc

**Files :**
- Modify: `TODO.md`

- [ ] **Step 1 : Lancer toute la suite (commande UTILISATEUR)**

```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test
```
Attendu : **tous les fichiers PASS** (paris-day, gift-card, ebook, webhook). Run déterministe (série + `truncateAll`).

- [ ] **Step 2 : Cocher dans `TODO.md`**

Sous la section `## 🎨 Qualité & design (avant mise en ligne)`, ajouter après la ligne « Lint & types = gate » :
```markdown
- [x] **Tests de correctness** (Vitest) — ✅ 4 axes money/concurrence : redemption gift-card (idempotence + concurrence optimistic lock), rejeu webhook Stripe (route signée offline), bornes dates Paris/DST, cap+debounce ebook. Base `clochette_test`, série. Lancer : `pnpm test`.
```

- [ ] **Step 3 : Commit**

```bash
git add TODO.md
git commit -m "docs(todo): suite de correctness tests livrée"
```

---

## Self-review (rempli)

**1. Couverture du spec :**
- Axe gift-card (idempotence + concurrence) → Task 2 ✓
- Axe webhook rejoué (route signée) → Task 4 ✓
- Axe dates Paris/DST → Task 1 ✓
- Axe cap+debounce ebook → Task 3 ✓
- Runner Vitest + isolation série + réutilisation `e2e/db.ts` → Task 0 ✓
- Hors-scope respecté (pas de composants, pas de mock réseau, pas d'emails) ✓

**2. Placeholders :** aucun — code complet par step.

**3. Cohérence des types/noms :** `applyGiftCardRedemption` / `RedemptionInput` / `GiftCardRedemptionError` (gift-card-redeem.ts), `resolveDownloadToken` / `generateDownloadToken` / `MAX_DOWNLOADS_PER_TOKEN` (ebook-download-token.ts), `db` / `truncateAll` (e2e/db.ts), `POST` (route). Champs `create()` alignés sur `prisma/schema.prisma` et `e2e/fixtures.ts`. `reason` ∈ `NOT_FOUND|EXPIRED|NOT_PAID|NO_PDF|EXHAUSTED`. Statuts `GiftCardStatus`/`PaymentStatus`/`BookingStatus` valides.

**Note exécution DB :** aucun garde-fou anti-IA Prisma sur ce chemin (requêtes + `TRUNCATE` SQL brut, pas de `db push`), base déjà créée. L'exécution peut être lancée par l'utilisateur (commandes ci-dessus) ou par l'agent en tâche de fond avec sandbox réseau désactivée (socket Postgres local).
