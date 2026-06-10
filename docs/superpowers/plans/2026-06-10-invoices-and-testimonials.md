# Factures PDF + Avis clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Factures PDF légales (micro-entreprise B2C) pour toutes les ventes (bookings, cartes cadeau, ebooks) avec numérotation séquentielle, avoirs, liste admin et envoi email ; + CRUD admin des avis clientes affichés sur la landing.

**Architecture:** Service central `src/lib/invoice/` (numérotation transactionnelle InvoiceCounter, rendu @react-pdf/renderer, fichiers immuables sous `private/uploads/invoices/`), branché en fail-soft sur `markBookingCompleted`, le webhook Stripe et `createGiftCardAdmin`. Avis : table `Testimonial` + sous-page `/admin/parametres/avis`, landing en lecture DB.

**Tech Stack:** Next 16 App Router, Prisma 7 + Postgres, @react-pdf/renderer (nouvelle dep), Resend (attachments), Sharp, Vitest (base `clochette_test`).

**Spec:** `docs/superpowers/specs/2026-06-10-invoices-and-testimonials-design.md`
**Branche:** `feat/invoices-and-testimonials` (déjà créée)

**Conventions impératives :**
- Cwd shell retombe sur le repo v1 PHP → TOUJOURS `git -C /Users/damiengcls/Documents/clochette-nails-v2` et chemins absolus.
- `pnpm` se lance depuis `/Users/damiengcls/Documents/clochette-nails-v2`.
- Pattern actions : `ActionResult = { ok: true; … } | { ok: false; error: string }`, `requireAdmin()` de `@/lib/auth-guards`, audit via `prisma.auditLog.create`.
- Pas de commentaires inline ; un header-comment par fichier.
- `prisma db push` est lancé PAR DAMIEN (garde anti-IA Prisma 7) — le plan marque ces étapes **[HUMAIN]**.
- Tests : `pnpm test` (Vitest, `.env.test` → `clochette_test`). Si la commande bloque à 0% CPU → relancer avec `dangerouslyDisableSandbox: true` (gotcha sandbox réseau connu).

## Fichiers (vue d'ensemble)

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` | + Testimonial, Invoice, InvoiceCounter, enums, champs PlatformSettings |
| `prisma/seed.ts` | + 3 avis, googleLine, champs facturation |
| `scripts/rasterize-invoice-logo.ts` | one-shot SVG→PNG du lockup (Sharp) |
| `src/lib/actions/testimonials-admin.ts` | CRUD avis |
| `src/app/admin/(protected)/parametres/avis/page.tsx` + `testimonials-manager.tsx` | UI admin avis |
| `src/components/landing/testimonials-section.tsx` | lecture DB |
| `src/lib/outbound-events.ts` | helper centralisé emitOutboundEvent |
| `src/lib/email/send.ts` | + attachments |
| `src/lib/invoice/types.ts` | types partagés |
| `src/lib/invoice/invoice-files.ts` | rootDir + read/write PDF |
| `src/lib/invoice/invoice-pdf.tsx` | template react-pdf |
| `src/lib/invoice/create-invoice.ts` | createInvoice + builders + createCreditNote |
| `src/lib/invoice/invoice-email.ts` | template email + sendInvoiceEmail |
| `src/lib/actions/invoice-admin.ts` | resend / avoir / générer (fallback) |
| `src/app/admin/(protected)/finances/factures/page.tsx` + `invoices-table.tsx` | liste factures |
| `src/app/api/v1/admin/invoices/[id]/download/route.ts` | téléchargement |
| `src/components/admin/invoice-block.tsx` (+ `invoice-block-actions.tsx`) | bloc contextuel fiches |
| `test/invoice-numbering.test.ts`, `test/invoice-create.test.ts`, `test/invoice-credit-note.test.ts` | Vitest |
| Modifs : `booking-admin.ts`, `booking-actions.tsx`, webhook stripe, `gift-card-admin.ts`, `gift-card-create-form.tsx`, `ebook-sales-admin.ts`, `settings-admin.ts`, `settings-form.tsx`, `parametres/page.tsx`, `finances/page.tsx`, pages détail booking/GC/vente ebook, `MANAGEMENT_API.md`, `TODO.md` | intégrations |

---

# PHASE A — AVIS CLIENTES

### Task 1: Schéma Testimonial + seed

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`

- [ ] **Step 1.1 : Ajouter le modèle Testimonial**

Dans `prisma/schema.prisma`, juste AVANT le bloc `model PlatformSettings {` (ligne ~742), insérer :

```prisma
// ════════════════════════════════════════════════════════════
// TESTIMONIALS — avis clientes affichés sur la landing
// ════════════════════════════════════════════════════════════

model Testimonial {
  id          String   @id @default(cuid())
  quote       String   @db.Text
  rating      Int      @default(5) // 1..5, validé côté action
  authorName  String // "Marie L." — l'initiale d'avatar est dérivée
  authorLabel String? // "Cliente fidèle · 2024"
  sortOrder   Int      @default(0)
  published   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([published, sortOrder])
  @@map("testimonials")
}
```

- [ ] **Step 1.2 : Ajouter testimonialsGoogleLine sur PlatformSettings**

Dans `model PlatformSettings`, après le bloc `// Fiscalité` (`vatEnabled` / `vatRate`), ajouter :

```prisma
  // Avis clientes (landing)
  /// Ligne agrégat externe affichée sous le titre de la section avis,
  /// ex : "4,9 / 5 · 87 avis Google". Vide/null = masquée.
  testimonialsGoogleLine String?
```

- [ ] **Step 1.3 [HUMAIN] : db push sur la base dev**

Demander à Damien d'exécuter :
```bash
cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm db:push
```
Attendu : `Your database is now in sync with your Prisma schema.` (le client est régénéré automatiquement).

- [ ] **Step 1.4 : Seed des 3 avis actuels + googleLine**

Dans `prisma/seed.ts`, dans `main()` après le bloc PlatformSettings existant (`const existing = await prisma.platformSettings.findFirst(); …` lignes ~49-54), ajouter :

```ts
  // Avis clientes : reprise des 3 avis hardcodés v1 + ligne Google (idempotent)
  const settingsRow = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, testimonialsGoogleLine: true },
  });
  if (settingsRow.testimonialsGoogleLine === null) {
    await prisma.platformSettings.update({
      where: { id: settingsRow.id },
      data: { testimonialsGoogleLine: "4,9 / 5 · 87 avis Google" },
    });
  }
  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({
      data: [
        {
          quote:
            "Une parenthèse hors du temps. Chloé prend soin de chaque détail, du diagnostic à la finition. Le rendu tient impeccablement 4 semaines.",
          rating: 5,
          authorName: "Marie L.",
          authorLabel: "Cliente fidèle · 2024",
          sortOrder: 0,
        },
        {
          quote:
            "Salon propre, ambiance calme, et un sens du détail qui change tout. J'ai trouvé MA prothésiste.",
          rating: 5,
          authorName: "Sophie D.",
          authorLabel: "Première visite · 2024",
          sortOrder: 1,
        },
        {
          quote:
            "Manucure russe excellente, conseils précieux pour entretenir mes ongles entre les rendez-vous. Je recommande sans réserve.",
          rating: 5,
          authorName: "Julie M.",
          authorLabel: "Cliente fidèle · 2024",
          sortOrder: 2,
        },
      ],
    });
  }
```

- [ ] **Step 1.5 : Exécuter le seed et vérifier**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm db:seed`
Attendu : sortie du seed sans erreur. Vérifier : `pnpm exec tsx -e "import { PrismaClient } from '@prisma/client'; import { PrismaPg } from '@prisma/adapter-pg'; const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }); p.testimonial.count().then(c => { console.log('testimonials:', c); return p.$disconnect(); });"` → `testimonials: 3` (lancer avec `dotenv -e .env.local --` si DATABASE_URL absent du shell).

- [ ] **Step 1.6 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add prisma/
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(avis): modèle Testimonial + testimonialsGoogleLine + seed reprise des 3 avis"
```

---

### Task 2: Server actions testimonials-admin

**Files:**
- Create: `src/lib/actions/testimonials-admin.ts`

- [ ] **Step 2.1 : Créer le fichier d'actions complet**

```ts
"use server";

/**
 * Server Actions — CRUD des avis clientes affichés sur la landing.
 *
 * Toutes les actions : auth ADMIN, audit, revalidate landing + page admin.
 * reorderTestimonial échange les sortOrder de l'avis et de son voisin.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const testimonialSchema = z.object({
  quote: z.string().trim().min(10, "Citation trop courte (10 chars min)").max(600, "Citation trop longue (600 chars max)"),
  rating: z.coerce.number().int().min(1, "Note entre 1 et 5").max(5, "Note entre 1 et 5"),
  authorName: z.string().trim().min(2, "Nom requis (2 chars min)").max(80, "Nom trop long"),
  authorLabel: z
    .string()
    .trim()
    .max(80, "Label trop long")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type TestimonialInput = {
  quote: string;
  rating: number;
  authorName: string;
  authorLabel: string;
};

function revalidateAvis() {
  revalidatePath("/");
  revalidatePath("/admin/parametres/avis");
}

async function audit(adminId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { adminId, action, metadata: metadata as object },
  });
}

export async function createTestimonial(input: TestimonialInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }

  const max = await prisma.testimonial.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.testimonial.create({
    data: { ...parsed.data, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  await audit(admin.id, "testimonial.created", { testimonialId: created.id, authorName: parsed.data.authorName });
  revalidateAvis();
  return { ok: true, message: "Avis ajouté." };
}

export async function updateTestimonial(id: string, input: TestimonialInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }

  const existing = await prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.update({ where: { id }, data: parsed.data });
  await audit(admin.id, "testimonial.updated", { testimonialId: id });
  revalidateAvis();
  return { ok: true, message: "Avis mis à jour." };
}

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.testimonial.findUnique({ where: { id }, select: { authorName: true } });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.delete({ where: { id } });
  await audit(admin.id, "testimonial.deleted", { testimonialId: id, authorName: existing.authorName });
  revalidateAvis();
  return { ok: true, message: "Avis supprimé." };
}

export async function toggleTestimonialPublished(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.testimonial.findUnique({ where: { id }, select: { published: true } });
  if (!existing) return { ok: false, error: "Avis introuvable." };

  await prisma.testimonial.update({ where: { id }, data: { published: !existing.published } });
  await audit(admin.id, "testimonial.toggled", { testimonialId: id, published: !existing.published });
  revalidateAvis();
  return { ok: true, message: existing.published ? "Avis dépublié." : "Avis publié." };
}

export async function reorderTestimonial(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const current = await prisma.testimonial.findUnique({ where: { id }, select: { id: true, sortOrder: true } });
  if (!current) return { ok: false, error: "Avis introuvable." };

  const neighbor = await prisma.testimonial.findFirst({
    where: direction === "up" ? { sortOrder: { lt: current.sortOrder } } : { sortOrder: { gt: current.sortOrder } },
    orderBy: direction === "up" ? { sortOrder: "desc" } : { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbor) return { ok: true };

  await prisma.$transaction([
    prisma.testimonial.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.testimonial.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  revalidateAvis();
  return { ok: true };
}

export async function updateTestimonialsGoogleLine(value: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const trimmed = value.trim();
  if (trimmed.length > 120) return { ok: false, error: "Texte trop long (120 chars max)." };

  const settings = await prisma.platformSettings.findFirstOrThrow({ select: { id: true } });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { testimonialsGoogleLine: trimmed === "" ? null : trimmed, updatedById: admin.id },
  });
  await audit(admin.id, "testimonial.google_line_updated", { value: trimmed || null });
  revalidateAvis();
  return { ok: true, message: "Ligne Google mise à jour." };
}
```

- [ ] **Step 2.2 : Vérifier types + lint**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm exec tsc --noEmit && pnpm lint`
Attendu : 0 erreur.

- [ ] **Step 2.3 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/actions/testimonials-admin.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(avis): server actions CRUD + reorder + ligne Google"
```

---

### Task 3: UI admin /admin/parametres/avis + carte lien

**Files:**
- Create: `src/app/admin/(protected)/parametres/avis/page.tsx`
- Create: `src/app/admin/(protected)/parametres/avis/testimonials-manager.tsx`
- Modify: `src/app/admin/(protected)/parametres/page.tsx` (carte lien en bas)

- [ ] **Step 3.1 : Page serveur**

`src/app/admin/(protected)/parametres/avis/page.tsx` :

```tsx
/**
 * Page /admin/parametres/avis — gestion des avis clientes de la landing.
 *
 * Liste CRUD (modale ajout/édition, flèches d'ordre, publier/dépublier,
 * suppression) + édition de la ligne agrégat Google.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TestimonialsManager } from "./testimonials-manager";

export const metadata: Metadata = { title: "Avis clientes · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const [testimonials, settings] = await Promise.all([
    prisma.testimonial.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        quote: true,
        rating: true,
        authorName: true,
        authorLabel: true,
        published: true,
      },
    }),
    prisma.platformSettings.findFirstOrThrow({
      select: { testimonialsGoogleLine: true },
    }),
  ]);

  return (
    <div className="max-w-3xl px-5 lg:px-8 py-10">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Link href="/admin/parametres" className="hover:text-[var(--color-violet-700)] transition-colors">
            Configuration
          </Link>{" "}
          / Avis
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Avis clientes
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Les avis publiés apparaissent dans la section « Elles parlent du salon »
          de la page d&apos;accueil, dans l&apos;ordre ci-dessous.
        </p>
      </header>

      <TestimonialsManager
        initial={testimonials}
        googleLine={settings.testimonialsGoogleLine ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 3.2 : Composant client TestimonialsManager**

`src/app/admin/(protected)/parametres/avis/testimonials-manager.tsx` — composant client complet : liste + modale + ligne Google. Code :

```tsx
"use client";

/**
 * TestimonialsManager — liste CRUD des avis (client component).
 *
 * Modale bespoke (même pattern overlay que les dialogs booking-actions),
 * réordonnancement par flèches, toggle publier, suppression avec confirm().
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  toggleTestimonialPublished,
  reorderTestimonial,
  updateTestimonialsGoogleLine,
  type TestimonialInput,
} from "@/lib/actions/testimonials-admin";

type Item = {
  id: string;
  quote: string;
  rating: number;
  authorName: string;
  authorLabel: string | null;
  published: boolean;
};

export function TestimonialsManager({
  initial,
  googleLine,
}: {
  initial: Item[];
  googleLine: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [googleValue, setGoogleValue] = useState(googleLine);

  function run(action: () => Promise<{ ok: boolean } & Record<string, unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok && typeof result.error === "string") {
        setFeedback(`⚠ ${result.error}`);
      } else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
        <h2
          className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ligne Google (sous le titre de la section)
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={googleValue}
            onChange={(e) => setGoogleValue(e.target.value)}
            placeholder="4,9 / 5 · 87 avis Google (vide = masquée)"
            className="flex-1 px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
            style={{ fontFamily: "var(--font-ui)" }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => updateTestimonialsGoogleLine(googleValue))}
            className="px-4 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Enregistrer
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
          {initial.length} avis · {initial.filter((t) => t.published).length} publié(s)
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          + Ajouter un avis
        </button>
      </div>

      {feedback && (
        <p role="alert" className="text-sm text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {feedback}
        </p>
      )}

      <ul className="space-y-3">
        {initial.map((t, idx) => (
          <li
            key={t.id}
            className={`bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-4 flex gap-4 ${t.published ? "" : "opacity-60"}`}
          >
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                aria-label="Monter"
                disabled={pending || idx === 0}
                onClick={() => run(() => reorderTestimonial(t.id, "up"))}
                className="w-8 h-8 grid place-items-center rounded border border-[var(--color-line)] text-[var(--color-ink-700)] hover:border-[var(--color-violet-600)] disabled:opacity-30 transition-colors"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Descendre"
                disabled={pending || idx === initial.length - 1}
                onClick={() => run(() => reorderTestimonial(t.id, "down"))}
                className="w-8 h-8 grid place-items-center rounded border border-[var(--color-line)] text-[var(--color-ink-700)] hover:border-[var(--color-violet-600)] disabled:opacity-30 transition-colors"
              >
                ↓
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm italic text-[var(--color-ink-900)] line-clamp-2" style={{ fontFamily: "var(--font-ui)" }}>
                « {t.quote} »
              </p>
              <p className="mt-2 text-xs text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
                {"★".repeat(t.rating)}
                {"☆".repeat(5 - t.rating)} · {t.authorName}
                {t.authorLabel ? ` · ${t.authorLabel}` : ""}
                {t.published ? "" : " · (dépublié)"}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0 text-xs" style={{ fontFamily: "var(--font-ui)" }}>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(t)}
                className="px-3 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
              >
                Éditer
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => toggleTestimonialPublished(t.id))}
                className="px-3 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
              >
                {t.published ? "Dépublier" : "Publier"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Supprimer l'avis de ${t.authorName} ?`)) {
                    run(() => deleteTestimonial(t.id));
                  }
                }}
                className="px-3 py-1.5 rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>

      {initial.length === 0 && (
        <p className="text-sm text-[var(--color-ink-500)] text-center py-8" style={{ fontFamily: "var(--font-ui)" }}>
          Aucun avis. La section sera masquée sur la landing.
        </p>
      )}

      {editing !== null && (
        <TestimonialDialog
          item={editing === "new" ? null : editing}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            run(() =>
              editing === "new" ? createTestimonial(input) : updateTestimonial(editing.id, input),
            )
          }
        />
      )}
    </div>
  );
}

function TestimonialDialog({
  item,
  pending,
  onCancel,
  onSubmit,
}: {
  item: Item | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: TestimonialInput) => void;
}) {
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [rating, setRating] = useState(item?.rating ?? 5);
  const [authorName, setAuthorName] = useState(item?.authorName ?? "");
  const [authorLabel, setAuthorLabel] = useState(item?.authorLabel ?? "");

  const canSubmit = quote.trim().length >= 10 && authorName.trim().length >= 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Éditer l'avis" : "Ajouter un avis"}
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            {item ? "Éditer l'avis" : "Ajouter un avis"}
          </h3>

          <div className="space-y-1.5">
            <label htmlFor="t-quote" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
              Citation
            </label>
            <textarea
              id="t-quote"
              rows={4}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors resize-y"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="t-name" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
                Nom affiché
              </label>
              <input
                id="t-name"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Marie L."
                className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                style={{ fontFamily: "var(--font-ui)" }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="t-rating" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
                Note
              </label>
              <select
                id="t-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n}/5)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="t-label" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
              Label (optionnel)
            </label>
            <input
              id="t-label"
              type="text"
              value={authorLabel}
              onChange={(e) => setAuthorLabel(e.target.value)}
              placeholder="Cliente fidèle · 2024"
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-4 h-10 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() =>
                onSubmit({ quote, rating, authorName, authorLabel })
              }
              disabled={pending || !canSubmit}
              className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pending ? "…" : item ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.3 : Carte lien sur la page Paramètres**

Dans `src/app/admin/(protected)/parametres/page.tsx` : ajouter `import Link from "next/link";` en tête, puis insérer APRÈS la balise fermante `/>` de `<SettingsForm … />` (juste avant le `</div>` final) :

```tsx
      <Link
        href="/admin/parametres/avis"
        className="mt-6 flex items-center justify-between bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 hover:border-[var(--color-violet-600)] transition-colors group"
      >
        <div>
          <h2
            className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Avis clientes
          </h2>
          <p
            className="mt-2 text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Gérer les avis affichés sur la page d&apos;accueil (ajout, ordre, publication).
          </p>
        </div>
        <span
          aria-hidden="true"
          className="text-[var(--color-ink-500)] group-hover:text-[var(--color-violet-700)] transition-colors"
        >
          →
        </span>
      </Link>
```

- [ ] **Step 3.4 : Gates + commit**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm exec tsc --noEmit && pnpm lint`
Attendu : 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add "src/app/admin/(protected)/parametres/"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(avis): page admin /admin/parametres/avis + carte lien Paramètres"
```

---

### Task 4: Landing en lecture DB

**Files:**
- Modify: `src/components/landing/testimonials-section.tsx`

- [ ] **Step 4.1 : Réécrire la section en async Server Component**

Remplacer ENTIÈREMENT le contenu du fichier. Le JSX de rendu (header, étoiles, cards) est conservé à l'identique ; seuls changent : la source de données (DB au lieu de `TESTIMONIALS`), la ligne Google (settings), l'initiale dérivée (`t.authorName.charAt(0).toUpperCase()`), `t.authorLabel` à la place de `t.status`, `t.authorName` à la place de `t.name`, et `return null` si 0 avis publié. Nouveau header de fichier + data :

```tsx
/**
 * TestimonialsSection — Server Component (async).
 *
 * Avis lus en DB (table Testimonial, gérée sur /admin/parametres/avis).
 * Section masquée si aucun avis publié. Ligne Google depuis PlatformSettings.
 * Mobile : snap-x horizontal scroll (CSS only). Desktop : grid 3 cols.
 */

import { prisma } from "@/lib/prisma";

export async function TestimonialsSection() {
  const [testimonials, settings] = await Promise.all([
    prisma.testimonial.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        quote: true,
        rating: true,
        authorName: true,
        authorLabel: true,
      },
    }),
    prisma.platformSettings.findFirst({
      select: { testimonialsGoogleLine: true },
    }),
  ]);

  if (testimonials.length === 0) return null;
  const googleLine = settings?.testimonialsGoogleLine ?? null;
  // … JSX existant conservé, avec les adaptations listées ci-dessus :
  //  - bloc "4,9 / 5 · 87 avis Google" → rendu conditionnel {googleLine && (…{googleLine}…)}
  //  - TESTIMONIALS.map → testimonials.map
  //  - t.name → t.authorName ; t.status → t.authorLabel (rendu conditionnel si null)
  //  - t.initial → t.authorName.charAt(0).toUpperCase()
  //  - aria-label étoiles et structure inchangés
}
```

Le bloc note/Google existant (lignes 58-77 de l'ancien fichier) devient :

```tsx
        {googleLine && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--color-ink-500)]">
            <div className="flex gap-0.5" aria-hidden="true">
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="var(--color-gold-500)" stroke="var(--color-gold-600)" strokeWidth="0.5">
                  <path d="M12 2 L14.5 9 L22 9.3 L16 14 L18 21.5 L12 17.5 L6 21.5 L8 14 L2 9.3 L9.5 9 Z" />
                </svg>
              ))}
            </div>
            <span style={{ fontFamily: "var(--font-ui)" }}>{googleLine}</span>
          </div>
        )}
```

Et le footer de card (ancien `t.initial` / `t.name` / `t.status`) devient :

```tsx
            <div className="mt-auto pt-5 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full bg-[var(--color-violet-100)] grid place-items-center text-[var(--color-violet-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t.authorName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm" style={{ fontFamily: "var(--font-ui)" }}>
                  {t.authorName}
                </div>
                {t.authorLabel && (
                  <div className="text-xs text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
                    {t.authorLabel}
                  </div>
                )}
              </div>
            </div>
```

- [ ] **Step 4.2 : Vérification visuelle (dev server de Damien)**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur. Puis demander à Damien de vérifier sur `http://localhost:3000/#avis` (3 avis identiques à avant) et sur `/admin/parametres/avis` (ajout/édition/ordre/dépublication se reflètent sur la landing après refresh).

- [ ] **Step 4.3 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/components/landing/testimonials-section.tsx
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(avis): landing testimonials en lecture DB (section masquée si vide)"
```

---

# PHASE B — FACTURES

### Task 5: Schéma Invoice + InvoiceCounter + champs settings

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 5.1 : Enums + modèles**

Dans `prisma/schema.prisma`, après le bloc d'enums GiftCard (après `enum GiftCardRedemptionType { … }`, ligne ~166), ajouter :

```prisma
enum InvoiceDocType {
  INVOICE // Facture
  CREDIT_NOTE // Avoir
}

enum InvoiceSourceType {
  BOOKING
  GIFT_CARD
  EBOOK
}

enum InvoiceStatus {
  ISSUED
  CANCELLED // jamais supprimée (séquence fiscale) — marquée annulée
}
```

Puis, juste AVANT `model SiteMedia {` (fin du schéma), ajouter :

```prisma
// ════════════════════════════════════════════════════════════
// INVOICES — factures et avoirs (toutes ventes)
// ════════════════════════════════════════════════════════════

model Invoice {
  id         String            @id @default(cuid())
  number     String            @unique // "FAC-2026-0001" / "AV-2026-0001"
  docType    InvoiceDocType    @default(INVOICE)
  sourceType InvoiceSourceType
  status     InvoiceStatus     @default(ISSUED)

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

  // Snapshot immuable (la facture doit rester identique 10 ans)
  sellerSnapshot Json // cf. SellerSnapshot dans lib/invoice/types.ts
  customerName   String
  customerEmail  String
  lines          Json // InvoiceLine[]
  payments       Json // InvoicePayment[]
  totalCents     Int // TTC, toujours positif (docType distingue facture/avoir)
  serviceDate    DateTime? @db.Date // date de la prestation (bookings), null sinon

  issuedAt    DateTime  @default(now())
  pdfPath     String // relatif au rootDir invoices : "2026/FAC-2026-0001.pdf"
  sentAt      DateTime?
  sentTo      String?
  createdById String? // admin User.id si action manuelle, null si webhook
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

- [ ] **Step 5.2 : Relations inverses + champs PlatformSettings**

Ajouter `invoices Invoice[]` dans `model Booking` (après `giftCardRedemptions GiftCardRedemption[]`), dans `model GiftCard` (après `redemptions GiftCardRedemption[]`) et dans `model EbookPurchase` (après `giftCardRedemption GiftCardRedemption?`).

Dans `model PlatformSettings`, après le bloc `// Fiscalité`, ajouter :

```prisma
  // Facturation (factures PDF)
  /// Nom commercial en tête de facture. null → fallback businessName.
  invoiceHeaderName String?
  /// Exploitant(e) avec mention EI, ou raison sociale + forme juridique.
  /// Texte libre — aucune forme juridique imposée (produit duplicable).
  invoiceLegalOwner String?
  /// Mention franchise TVA — éditable (passage CIBS sept. 2026 sans redéploiement).
  invoiceVatMention String  @default("TVA non applicable, art. 293 B du CGI")
  /// Mentions bas de facture : immatriculation RM/RNE, assurance RC pro, médiateur…
  invoiceLegalFooter String? @db.Text
  /// Logo PNG en tête de facture (/uploads/invoice-logo/… ou /brand/…). null = sans logo.
  invoiceLogoUrl String?
```

- [ ] **Step 5.3 [HUMAIN] : db push**

Demander à Damien : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm db:push`
Attendu : sync OK, client régénéré.

- [ ] **Step 5.4 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add prisma/schema.prisma
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): schéma Invoice + InvoiceCounter + champs facturation settings"
```

---

### Task 6: Logo PNG + seed facturation + dépendance react-pdf

**Files:**
- Create: `scripts/rasterize-invoice-logo.ts`
- Create (généré): `public/brand/lockup-horizontal-couleur.png`
- Modify: `prisma/seed.ts`, `package.json` (dep), `next.config.ts`

- [ ] **Step 6.1 : Installer @react-pdf/renderer**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm add @react-pdf/renderer`
Attendu : ajout en `dependencies`, postinstall prisma generate OK. Si l'install bloque (sandbox réseau) → relancer avec `dangerouslyDisableSandbox: true`.

- [ ] **Step 6.2 : Exclure react-pdf du bundling serveur**

Dans `next.config.ts`, ajouter dans l'objet de config :

```ts
  serverExternalPackages: ["@react-pdf/renderer"],
```

(Si la clé existe déjà, ajouter l'entrée au tableau.)

- [ ] **Step 6.3 : Script de rasterisation (one-shot)**

`scripts/rasterize-invoice-logo.ts` :

```ts
/**
 * One-shot : rasterise le lockup SVG CN manucure en PNG pour le template
 * de facture (@react-pdf/renderer ne lit ni SVG ni WebP).
 * Usage : pnpm exec tsx scripts/rasterize-invoice-logo.ts
 */

import path from "node:path";
import sharp from "sharp";

const src = path.join(process.cwd(), "public/brand/lockup-horizontal-couleur.svg");
const dest = path.join(process.cwd(), "public/brand/lockup-horizontal-couleur.png");

sharp(src, { density: 300 })
  .resize({ width: 1200, withoutEnlargement: false })
  .png()
  .toFile(dest)
  .then((info) => console.log(`OK → ${dest} (${info.width}×${info.height})`));
```

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm exec tsx scripts/rasterize-invoice-logo.ts`
Attendu : `OK → …/public/brand/lockup-horizontal-couleur.png (1200×H)`.

- [ ] **Step 6.4 : Seed des champs facturation**

Dans `prisma/seed.ts`, à la suite du bloc avis (Task 1), ajouter :

```ts
  // Facturation : valeurs Clochette (éditables ensuite dans Paramètres)
  const invoiceDefaults = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceHeaderName: true, invoiceLegalOwner: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: invoiceDefaults.id },
    data: {
      invoiceHeaderName: invoiceDefaults.invoiceHeaderName ?? "CN manucure by Clochette Nails",
      invoiceLegalOwner: invoiceDefaults.invoiceLegalOwner ?? "EI Gomes Chloé",
      invoiceLogoUrl: invoiceDefaults.invoiceLogoUrl ?? "/brand/lockup-horizontal-couleur.png",
    },
  });
```

Run : `pnpm db:seed` → sans erreur.

- [ ] **Step 6.5 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add scripts/ public/brand/lockup-horizontal-couleur.png prisma/seed.ts package.json pnpm-lock.yaml next.config.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): @react-pdf/renderer + logo PNG rasterisé + seed facturation"
```

---

### Task 7: sendEmail attachments + outbound-events centralisé

**Files:**
- Modify: `src/lib/email/send.ts`
- Create: `src/lib/outbound-events.ts`

- [ ] **Step 7.1 : Étendre EmailMessage**

Dans `src/lib/email/send.ts`, ajouter au type `EmailMessage` (après `tag?: string;`) :

```ts
  /** Pièces jointes (PDF factures…). Ignorées en mode mock (loggées). */
  attachments?: { filename: string; content: Buffer }[];
```

Dans le bloc mock (`if (!resend) { console.log( … ) }`), ajouter à la template string, après la ligne `Tag` :

```ts
        `  Attach  : ${msg.attachments?.map((a) => a.filename).join(", ") ?? "(none)"}\n` +
```

Dans `resend.emails.send({ … })`, après le spread `...(msg.tag ? … : {})`, ajouter :

```ts
      ...(msg.attachments && msg.attachments.length > 0
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          }
        : {}),
```

- [ ] **Step 7.2 : Helper outbound centralisé**

`src/lib/outbound-events.ts` (même contrat que le helper local du webhook — les emit existants ne sont PAS migrés, hors scope) :

```ts
/**
 * Émission d'events business vers la queue OutboundEvent (future intégration
 * ERP Chloé — cf. MANAGEMENT_API.md). Sans MANAGEMENT_API_URL configurée,
 * log console uniquement (dev). Fail-soft : ne jette jamais.
 */

import { prisma } from "@/lib/prisma";

export async function emitOutboundEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const targetUrl = process.env.MANAGEMENT_API_URL;
    if (!targetUrl) {
      console.log(`[outbound] ${type}`, payload);
      return;
    }
    await prisma.outboundEvent.create({
      data: {
        type,
        payload: payload as object,
        targetUrl,
        targetService: "management",
      },
    });
  } catch (err) {
    console.error(`[outbound] emit ${type} échec:`, err);
  }
}
```

- [ ] **Step 7.3 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/email/send.ts src/lib/outbound-events.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(infra): pièces jointes sendEmail + helper outbound-events centralisé"
```

---

### Task 8: Types invoice + invoice-files

**Files:**
- Create: `src/lib/invoice/types.ts`
- Create: `src/lib/invoice/invoice-files.ts`

- [ ] **Step 8.1 : types.ts**

```ts
/**
 * Types partagés du module facturation. Les shapes JSON (sellerSnapshot,
 * lines, payments) stockées dans Invoice sont définies ici — toute évolution
 * doit rester rétro-compatible (les factures émises sont immuables).
 */

export type InvoiceLine = {
  label: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type InvoicePayment = {
  label: string;
  amountCents: number;
};

export type SellerSnapshot = {
  headerName: string;
  legalOwner: string | null;
  address: string | null;
  siret: string | null;
  contactEmail: string;
  contactPhone: string | null;
  vatMention: string;
  legalFooter: string | null;
  logoUrl: string | null;
  vatEnabled: boolean;
  vatRate: number;
};

export type InvoicePdfData = {
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  issuedAt: Date;
  serviceDate: Date | null;
  seller: SellerSnapshot;
  logoPng: Buffer | null;
  customerName: string;
  customerEmail: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  totalCents: number;
  parentNumber: string | null;
};
```

- [ ] **Step 8.2 : invoice-files.ts**

```ts
/**
 * Stockage des PDFs de facture — fichiers immuables, JAMAIS sous public/.
 * Racine : INVOICES_DIR (tests) ou private/uploads/invoices/ (défaut).
 * Chemins relatifs en DB ("2026/FAC-2026-0001.pdf") → portables si la racine bouge.
 */

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export function invoicesRootDir(): string {
  return (
    process.env.INVOICES_DIR ??
    path.join(process.cwd(), "private", "uploads", "invoices")
  );
}

export async function writeInvoicePdf(relPath: string, pdf: Buffer): Promise<void> {
  const abs = path.join(invoicesRootDir(), relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
}

export async function readInvoicePdf(relPath: string): Promise<Buffer> {
  return readFile(path.join(invoicesRootDir(), relPath));
}
```

- [ ] **Step 8.3 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/invoice/
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): types + stockage fichiers invoice"
```

---

### Task 9: Template PDF react-pdf

**Files:**
- Create: `src/lib/invoice/invoice-pdf.tsx`

- [ ] **Step 9.1 : Écrire le template**

Polices : Helvetica/Helvetica-Bold intégrées (zéro fichier à embarquer — les fonts Google du DS sont des variable fonts non supportées par react-pdf ; itération typo possible plus tard au moment de la validation visuelle).

```tsx
/**
 * Template PDF facture/avoir — @react-pdf/renderer, A4.
 * Conformité : numéro, dates, vendeur (EI + SIRET), cliente, décompte
 * détaillé, total TTC, mention TVA (ou colonnes HT/TVA/TTC si vatEnabled,
 * dérivées du vatRate snapshoté), mentions légales libres en pied.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { InvoicePdfData } from "./types";

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const LINE = "#d9d4cc";
const ACCENT = "#6d5a8f";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 9, fontFamily: "Helvetica", color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  logo: { height: 42, objectFit: "contain", alignSelf: "flex-start", marginBottom: 10 },
  headerName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sellerLine: { fontSize: 8, color: MUTED, lineHeight: 1.5 },
  docBox: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 4 },
  docMeta: { fontSize: 9, color: MUTED, lineHeight: 1.6, textAlign: "right" },
  customerBox: {
    alignSelf: "flex-end",
    minWidth: 200,
    border: `1pt solid ${LINE}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 24,
  },
  customerLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  table: { marginBottom: 16 },
  thRow: { flexDirection: "row", borderBottom: `1pt solid ${INK}`, paddingBottom: 5, marginBottom: 2 },
  tdRow: { flexDirection: "row", borderBottom: `0.5pt solid ${LINE}`, paddingVertical: 6 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: MUTED },
  colLabel: { flex: 5 },
  colQty: { flex: 1, textAlign: "right" },
  colNum: { flex: 2, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalBox: { backgroundColor: "#f4f1ea", borderRadius: 4, padding: 12, minWidth: 200 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalLabel: { fontSize: 8, color: MUTED },
  totalValue: { fontSize: 8 },
  totalMain: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  payTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: MUTED, marginTop: 20, marginBottom: 6 },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: `0.5pt solid ${LINE}`, maxWidth: 280 },
  vatMention: { fontSize: 8, color: MUTED, marginTop: 18, fontFamily: "Helvetica-Oblique" },
  creditRef: { fontSize: 9, color: ACCENT, marginBottom: 14 },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 48,
    right: 48,
    borderTop: `0.5pt solid ${LINE}`,
    paddingTop: 8,
  },
  footerText: { fontSize: 6.5, color: MUTED, lineHeight: 1.5, textAlign: "center" },
});

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function dateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const isCreditNote = data.docType === "CREDIT_NOTE";
  const vat = data.seller.vatEnabled;
  const rate = data.seller.vatRate;
  const ht = (ttc: number) => Math.round(ttc / (1 + rate / 100));
  const totalHt = ht(data.totalCents);

  const doc = (
    <Document title={data.number} author={data.seller.headerName}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={{ maxWidth: 280 }}>
            {data.logoPng ? <Image src={data.logoPng} style={s.logo} /> : null}
            <Text style={s.headerName}>{data.seller.headerName}</Text>
            {data.seller.legalOwner ? <Text style={s.sellerLine}>{data.seller.legalOwner}</Text> : null}
            {data.seller.address
              ? data.seller.address.split("\n").map((l, i) => (
                  <Text key={i} style={s.sellerLine}>{l}</Text>
                ))
              : null}
            {data.seller.siret ? <Text style={s.sellerLine}>SIRET : {data.seller.siret}</Text> : null}
            <Text style={s.sellerLine}>
              {data.seller.contactEmail}
              {data.seller.contactPhone ? ` · ${data.seller.contactPhone}` : ""}
            </Text>
          </View>
          <View style={s.docBox}>
            <Text style={s.docTitle}>{isCreditNote ? "AVOIR" : "FACTURE"}</Text>
            <Text style={s.docMeta}>N° {data.number}</Text>
            <Text style={s.docMeta}>Émise le {dateFr(data.issuedAt)}</Text>
            {data.serviceDate ? <Text style={s.docMeta}>Prestation du {dateFr(data.serviceDate)}</Text> : null}
          </View>
        </View>

        <View style={s.customerBox}>
          <Text style={s.customerLabel}>{isCreditNote ? "Avoir établi pour" : "Facturé à"}</Text>
          <Text>{data.customerName}</Text>
          <Text style={s.sellerLine}>{data.customerEmail}</Text>
        </View>

        {isCreditNote && data.parentNumber ? (
          <Text style={s.creditRef}>
            Annule (partiellement ou totalement) la facture {data.parentNumber}.
          </Text>
        ) : null}

        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, s.colLabel]}>Désignation</Text>
            <Text style={[s.th, s.colQty]}>Qté</Text>
            {vat ? <Text style={[s.th, s.colNum]}>PU HT</Text> : <Text style={[s.th, s.colNum]}>PU TTC</Text>}
            {vat ? <Text style={[s.th, s.colNum]}>TVA</Text> : null}
            <Text style={[s.th, s.colNum]}>Total TTC</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={s.tdRow}>
              <Text style={s.colLabel}>{l.label}</Text>
              <Text style={s.colQty}>{l.quantity}</Text>
              <Text style={s.colNum}>{euros(vat ? ht(l.unitCents) : l.unitCents)}</Text>
              {vat ? <Text style={s.colNum}>{rate.toLocaleString("fr-FR")} %</Text> : null}
              <Text style={s.colNum}>{euros(l.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalRow}>
          <View style={s.totalBox}>
            {vat ? (
              <>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>Total HT</Text>
                  <Text style={s.totalValue}>{euros(totalHt)}</Text>
                </View>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>TVA ({rate.toLocaleString("fr-FR")} %)</Text>
                  <Text style={s.totalValue}>{euros(data.totalCents - totalHt)}</Text>
                </View>
              </>
            ) : null}
            <View style={s.totalLine}>
              <Text style={s.totalMain}>{isCreditNote ? "Total remboursé" : "Total TTC"}</Text>
              <Text style={s.totalMain}>{euros(data.totalCents)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.payTitle}>{isCreditNote ? "Remboursement" : "Règlements"}</Text>
        {data.payments.map((p, i) => (
          <View key={i} style={s.payRow}>
            <Text>{p.label}</Text>
            <Text>{euros(p.amountCents)}</Text>
          </View>
        ))}

        {!vat ? <Text style={s.vatMention}>{data.seller.vatMention}</Text> : null}

        <View style={s.footer} fixed>
          {data.seller.legalFooter
            ? data.seller.legalFooter.split("\n").map((l, i) => (
                <Text key={i} style={s.footerText}>{l}</Text>
              ))
            : null}
        </View>
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}
```

- [ ] **Step 9.2 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur (le rendu réel est testé en Task 10 via `%PDF`).

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/invoice/invoice-pdf.tsx
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): template PDF react-pdf (facture + avoir, franchise et TVA)"
```

---

### Task 10: createInvoice + numérotation (TDD)

**Files:**
- Test: `test/invoice-numbering.test.ts`
- Create: `src/lib/invoice/create-invoice.ts` (partie cœur)

- [ ] **Step 10.1 : Écrire le test de numérotation (échoue d'abord)**

`test/invoice-numbering.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, truncateAll } from "../e2e/db";
import { createInvoice } from "@/lib/invoice/create-invoice";

async function makeSettings() {
  await db.platformSettings.create({
    data: {
      invoiceHeaderName: "CN manucure by Clochette Nails",
      invoiceLegalOwner: "EI Gomes Chloé",
      businessSiret: "12345678901234",
      businessAddress: "1 rue des Tests\n79320 Moncoutant-sur-Sèvre",
    },
  });
}

function minimalInput(docType: "INVOICE" | "CREDIT_NOTE" = "INVOICE") {
  return {
    docType,
    sourceType: "BOOKING" as const,
    customerName: "Cliente Test",
    customerEmail: "cliente@test.local",
    lines: [{ label: "Prestation test", quantity: 1, unitCents: 5000, totalCents: 5000 }],
    payments: [{ label: "Espèces", amountCents: 5000 }],
    totalCents: 5000,
  };
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(async () => {
  await truncateAll();
  await makeSettings();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("numérotation des factures", () => {
  it("20 créations concurrentes → 20 numéros uniques et continus", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createInvoice(minimalInput())),
    );
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(20);
    const year = new Date().getFullYear();
    const expected = Array.from(
      { length: 20 },
      (_, i) => `FAC-${year}-${String(i + 1).padStart(4, "0")}`,
    ).sort();
    expect(numbers).toEqual(expected);
  });

  it("séries FAC et AV indépendantes", async () => {
    const fac = await createInvoice(minimalInput("INVOICE"));
    const fac2 = await createInvoice(minimalInput("INVOICE"));
    const parent = await db.invoice.findUniqueOrThrow({ where: { id: fac.id }, select: { id: true } });
    const av = await createInvoice({
      ...minimalInput("CREDIT_NOTE"),
      parentInvoiceId: parent.id,
      parentNumber: fac.number,
    });
    const year = new Date().getFullYear();
    expect(fac.number).toBe(`FAC-${year}-0001`);
    expect(fac2.number).toBe(`FAC-${year}-0002`);
    expect(av.number).toBe(`AV-${year}-0001`);
  });

  it("le PDF est écrit et commence par %PDF", async () => {
    const inv = await createInvoice(minimalInput());
    const { readInvoicePdf } = await import("@/lib/invoice/invoice-files");
    const row = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { pdfPath: true, sellerSnapshot: true } });
    const buf = await readInvoicePdf(row.pdfPath);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect((row.sellerSnapshot as { headerName: string }).headerName).toBe("CN manucure by Clochette Nails");
  });
});
```

- [ ] **Step 10.2 : Vérifier l'échec**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm test -- invoice-numbering`
Attendu : FAIL (module `@/lib/invoice/create-invoice` introuvable).

- [ ] **Step 10.3 : Implémenter le cœur createInvoice**

`src/lib/invoice/create-invoice.ts` (les builders par source arrivent en Task 11 — ce step crée le fichier avec le cœur seulement) :

```ts
/**
 * Cœur du module facturation : allocation de numéro séquentiel sans trou
 * (InvoiceCounter, upsert atomique ON CONFLICT) + rendu PDF + écriture
 * fichier + row Invoice, le tout dans UNE transaction : tout échec rollback
 * le compteur (pas de trou). Builders par source de vente + avoirs.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { renderInvoicePdf } from "./invoice-pdf";
import { writeInvoicePdf } from "./invoice-files";
import type { InvoiceLine, InvoicePayment, SellerSnapshot } from "./types";

export class InvoiceError extends Error {}

export type CreateInvoiceInput = {
  docType: "INVOICE" | "CREDIT_NOTE";
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  bookingId?: string | null;
  giftCardId?: string | null;
  ebookPurchaseId?: string | null;
  parentInvoiceId?: string | null;
  parentNumber?: string | null;
  customerName: string;
  customerEmail: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  totalCents: number;
  serviceDate?: Date | null;
  createdById?: string | null;
};

export type CreatedInvoice = { id: string; number: string; pdfPath: string };

const SERIES_PREFIX: Record<CreateInvoiceInput["docType"], string> = {
  INVOICE: "FAC",
  CREDIT_NOTE: "AV",
};

async function loadSellerSnapshot(): Promise<SellerSnapshot> {
  const s = await prisma.platformSettings.findFirstOrThrow({
    select: {
      businessName: true,
      businessSiret: true,
      businessAddress: true,
      contactEmail: true,
      contactPhone: true,
      vatEnabled: true,
      vatRate: true,
      invoiceHeaderName: true,
      invoiceLegalOwner: true,
      invoiceVatMention: true,
      invoiceLegalFooter: true,
      invoiceLogoUrl: true,
    },
  });
  return {
    headerName: s.invoiceHeaderName ?? s.businessName,
    legalOwner: s.invoiceLegalOwner,
    address: s.businessAddress,
    siret: s.businessSiret,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    vatMention: s.invoiceVatMention,
    legalFooter: s.invoiceLegalFooter,
    logoUrl: s.invoiceLogoUrl,
    vatEnabled: s.vatEnabled,
    vatRate: s.vatRate,
  };
}

async function loadLogoPng(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl || !logoUrl.endsWith(".png")) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", logoUrl.replace(/^\//, "")));
  } catch {
    return null;
  }
}

function parisYear(): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(new Date());
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    throw new InvoiceError("Montant total invalide.");
  }
  const seller = await loadSellerSnapshot();
  const logoPng = await loadLogoPng(seller.logoUrl);
  const year = parisYear();
  const series = `${SERIES_PREFIX[input.docType]}-${year}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const counter = await tx.invoiceCounter.upsert({
            where: { series },
            create: { series, lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
          });
          const number = `${series}-${String(counter.lastNumber).padStart(4, "0")}`;
          const issuedAt = new Date();
          const pdfPath = `${year}/${number}.pdf`;

          const pdf = await renderInvoicePdf({
            number,
            docType: input.docType,
            issuedAt,
            serviceDate: input.serviceDate ?? null,
            seller,
            logoPng,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            lines: input.lines,
            payments: input.payments,
            totalCents: input.totalCents,
            parentNumber: input.parentNumber ?? null,
          });
          await writeInvoicePdf(pdfPath, pdf);

          const row = await tx.invoice.create({
            data: {
              number,
              docType: input.docType,
              sourceType: input.sourceType,
              bookingId: input.bookingId ?? null,
              giftCardId: input.giftCardId ?? null,
              ebookPurchaseId: input.ebookPurchaseId ?? null,
              parentInvoiceId: input.parentInvoiceId ?? null,
              sellerSnapshot: seller as object,
              customerName: input.customerName,
              customerEmail: input.customerEmail,
              lines: input.lines as object,
              payments: input.payments as object,
              totalCents: input.totalCents,
              serviceDate: input.serviceDate ?? null,
              issuedAt,
              pdfPath,
              createdById: input.createdById ?? null,
            },
            select: { id: true },
          });
          return { id: row.id, number, pdfPath };
        },
        { timeout: 15000 },
      );

      await emitOutboundEvent("invoice.issued", {
        invoiceId: created.id,
        number: created.number,
        docType: input.docType,
        sourceType: input.sourceType,
        totalCents: input.totalCents,
        customerEmail: input.customerEmail,
        issuedAt: new Date().toISOString(),
      });
      return created;
    } catch (err) {
      const isUniqueClash =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueClash || attempt === 1) throw err;
    }
  }
  throw new InvoiceError("Allocation du numéro de facture impossible.");
}
```

- [ ] **Step 10.4 : Vérifier que les tests passent**

Run : `pnpm test -- invoice-numbering`
Attendu : 3 tests PASS. (Si blocage sandbox → `dangerouslyDisableSandbox: true`.)

- [ ] **Step 10.5 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add test/invoice-numbering.test.ts src/lib/invoice/create-invoice.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): createInvoice transactionnel + numérotation séquentielle testée sous concurrence"
```

---

### Task 11: Builders par source (TDD)

**Files:**
- Test: `test/invoice-create.test.ts`
- Modify: `src/lib/invoice/create-invoice.ts` (ajout builders à la fin du fichier)

- [ ] **Step 11.1 : Test booking complet (échoue d'abord)**

`test/invoice-create.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import {
  createInvoiceForBooking,
  createInvoiceForGiftCard,
  createInvoiceForEbookPurchase,
  InvoiceError,
} from "@/lib/invoice/create-invoice";
import type { InvoiceLine, InvoicePayment } from "@/lib/invoice/types";

async function makeSettings() {
  await db.platformSettings.create({
    data: { invoiceHeaderName: "CN manucure", invoiceLegalOwner: "EI Gomes Chloé" },
  });
}

async function makeCompletedBooking() {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Pose gel",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 60,
      priceCents: 6000,
      status: "PUBLISHED",
    },
  });
  const option = await db.serviceOption.create({
    data: {
      slug: `opt-${rand}`,
      title: "Nail art",
      addedDurationMinutes: 15,
      addedPriceCents: 1500,
      applicableCategories: ["SOIN_MAINS"],
      status: "PUBLISHED",
    },
  });
  const giftCard = await db.giftCard.create({
    data: {
      code: `TEST-${rand}`,
      codeHash: `h-${rand}`,
      prefix: rand.slice(-4),
      status: "PARTIALLY_USED",
      initialAmountCents: 3000,
      remainingAmountCents: 1000,
      buyerEmail: "b@test.local",
      buyerName: "B",
      deliveryMode: "EMAIL_TO_BUYER",
      expiresAt: new Date(Date.now() + 365 * 86400000),
      amount: 3000,
      paymentStatus: "PAID",
      creationMode: "PUBLIC",
    },
  });
  const booking = await db.booking.create({
    data: {
      date: new Date("2026-06-01"),
      startTime: "10:00",
      endTime: "11:15",
      serviceId: service.id,
      clientFirstName: "Marie",
      clientLastName: "Durand",
      clientEmail: "marie@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 75,
      totalPriceCents: 7500,
      depositCents: 2250,
      status: "COMPLETED",
      paymentMethod: "stripe",
      paidAt: new Date(),
      completedAt: new Date(),
      revenueCents: 3250,
      completionPaymentMethod: "cash",
      options: { create: [{ serviceOptionId: option.id }] },
    },
  });
  await db.giftCardRedemption.create({
    data: {
      giftCardId: giftCard.id,
      type: "BOOKING_SERVICE",
      bookingId: booking.id,
      amountUsedCents: 2000,
      redeemedByEmail: "marie@test.local",
    },
  });
  return { booking, giftCard };
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(async () => {
  await truncateAll();
  await makeSettings();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createInvoiceForBooking", () => {
  it("lignes prestation+option, paiements acompte/cash/GC, total = encaissé", async () => {
    const { booking, giftCard } = await makeCompletedBooking();
    const inv = await createInvoiceForBooking(booking.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { lines: true, payments: true, totalCents: true, customerName: true, serviceDate: true, sourceType: true },
    });

    expect(row.totalCents).toBe(2250 + 3250 + 2000); // acompte stripe + cash + GC
    expect(row.customerName).toBe("Marie Durand");
    expect(row.sourceType).toBe("BOOKING");

    const lines = row.lines as InvoiceLine[];
    expect(lines.map((l) => l.label)).toEqual(["Pose gel", "Nail art"]);
    expect(lines.reduce((s, l) => s + l.totalCents, 0)).toBe(7500); // = total → pas de ligne ajustement

    const payments = row.payments as InvoicePayment[];
    expect(payments).toEqual([
      { label: "Acompte payé en ligne (carte bancaire)", amountCents: 2250 },
      { label: "Espèces", amountCents: 3250 },
      { label: `Carte cadeau ••${giftCard.prefix}`, amountCents: 2000 },
    ]);
  });

  it("geste commercial → ligne d'ajustement négative", async () => {
    const { booking } = await makeCompletedBooking();
    await db.booking.update({ where: { id: booking.id }, data: { revenueCents: 2250 } }); // 1000 de remise
    const inv = await createInvoiceForBooking(booking.id);
    const row = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { lines: true, totalCents: true } });
    const lines = row.lines as InvoiceLine[];
    expect(row.totalCents).toBe(2250 + 2250 + 2000);
    expect(lines.at(-1)).toEqual({ label: "Remise / ajustement", quantity: 1, unitCents: -1000, totalCents: -1000 });
  });

  it("refuse un booking non COMPLETED et une double facture", async () => {
    const { booking } = await makeCompletedBooking();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    await expect(createInvoiceForBooking(booking.id)).rejects.toThrow(InvoiceError);
    await db.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });
    await createInvoiceForBooking(booking.id);
    await expect(createInvoiceForBooking(booking.id)).rejects.toThrow(/déjà émise/);
  });
});

describe("createInvoiceForGiftCard", () => {
  it("ADMIN_SALE → facture acheteuse, paiement physique ; ADMIN_GIFT refusée", async () => {
    const rand = randomUUID().slice(0, 8);
    const base = {
      codeHash: `h-${rand}`,
      prefix: "ABCD",
      status: "ACTIVE" as const,
      initialAmountCents: 5000,
      remainingAmountCents: 5000,
      buyerEmail: "acheteuse@test.local",
      buyerName: "Acheteuse Test",
      deliveryMode: "EMAIL_TO_RECIPIENT" as const,
      expiresAt: new Date(Date.now() + 365 * 86400000),
      amount: 5000,
      paymentStatus: "PAID" as const,
    };
    const sale = await db.giftCard.create({
      data: { ...base, code: `S-${rand}`, creationMode: "ADMIN_SALE", paymentMethod: "card_terminal" },
    });
    const gift = await db.giftCard.create({
      data: { ...base, code: `G-${rand}`, codeHash: `h2-${rand}`, creationMode: "ADMIN_GIFT" },
    });

    const inv = await createInvoiceForGiftCard(sale.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { totalCents: true, customerName: true, payments: true, sourceType: true },
    });
    expect(row.totalCents).toBe(5000);
    expect(row.customerName).toBe("Acheteuse Test");
    expect(row.sourceType).toBe("GIFT_CARD");
    expect((row.payments as InvoicePayment[])[0].label).toBe("TPE / Carte bancaire");

    await expect(createInvoiceForGiftCard(gift.id)).rejects.toThrow(/offerte/i);
  });
});

describe("createInvoiceForEbookPurchase", () => {
  it("ligne titre ebook, split GC + CB, total = prix payé", async () => {
    const rand = randomUUID().slice(0, 8);
    const ebook = await db.ebook.create({
      data: { slug: `eb-${rand}`, title: "Guide nail art", shortDesc: "d", description: "d", priceCents: 1900, status: "PUBLISHED" },
    });
    const card = await db.giftCard.create({
      data: {
        code: `E-${rand}`, codeHash: `h3-${rand}`, prefix: "WXYZ", status: "PARTIALLY_USED",
        initialAmountCents: 1000, remainingAmountCents: 500, buyerEmail: "b@test.local", buyerName: "B",
        deliveryMode: "EMAIL_TO_BUYER", expiresAt: new Date(Date.now() + 365 * 86400000),
        amount: 1000, paymentStatus: "PAID", creationMode: "PUBLIC",
      },
    });
    const purchase = await db.ebookPurchase.create({
      data: {
        ebookId: ebook.id, clientEmail: "lectrice@test.local", clientName: "Lectrice Test",
        paymentStatus: "PAID", amount: 1900, paidAt: new Date(),
        downloadToken: `tok-${rand}`, tokenExpiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await db.giftCardRedemption.create({
      data: { giftCardId: card.id, type: "EBOOK", ebookPurchaseId: purchase.id, amountUsedCents: 500, redeemedByEmail: "lectrice@test.local" },
    });

    const inv = await createInvoiceForEbookPurchase(purchase.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { lines: true, payments: true, totalCents: true },
    });
    expect(row.totalCents).toBe(1900);
    expect((row.lines as InvoiceLine[])[0].label).toBe("Ebook — Guide nail art");
    expect(row.payments as InvoicePayment[]).toEqual([
      { label: "Carte cadeau ••WXYZ", amountCents: 500 },
      { label: "Paiement en ligne (carte bancaire)", amountCents: 1400 },
    ]);
  });
});
```

- [ ] **Step 11.2 : Vérifier l'échec**

Run : `pnpm test -- invoice-create` → FAIL (`createInvoiceForBooking` non exporté).

- [ ] **Step 11.3 : Implémenter les builders**

À la FIN de `src/lib/invoice/create-invoice.ts`, ajouter :

```ts
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  card_terminal: "TPE / Carte bancaire",
  transfer: "Virement",
  check: "Chèque",
};

function methodLabel(method: string | null): string {
  return (method && PAYMENT_METHOD_LABELS[method]) || "Paiement";
}

type BuilderOpts = { createdById?: string | null };

export async function createInvoiceForBooking(
  bookingId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      date: true,
      clientFirstName: true,
      clientLastName: true,
      clientEmail: true,
      depositCents: true,
      revenueCents: true,
      completionPaymentMethod: true,
      paymentMethod: true,
      paidAt: true,
      service: { select: { title: true, priceCents: true } },
      options: { select: { serviceOption: { select: { title: true, addedPriceCents: true } } } },
      giftCardRedemptions: {
        where: { reversedAt: null },
        select: { type: true, amountUsedCents: true, giftCard: { select: { prefix: true } } },
      },
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!booking) throw new InvoiceError("Réservation introuvable.");
  if (booking.status !== "COMPLETED") {
    throw new InvoiceError("Le RDV doit être marqué honoré avant facturation.");
  }
  if (booking.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${booking.invoices[0].number}).`);
  }

  const depositGc = booking.giftCardRedemptions.filter((r) => r.type === "BOOKING_DEPOSIT");
  const serviceGc = booking.giftCardRedemptions.filter((r) => r.type === "BOOKING_SERVICE");
  const depositGcCents = depositGc.reduce((s, r) => s + r.amountUsedCents, 0);
  const stripeDepositCents =
    booking.paymentMethod === "stripe" && booking.paidAt
      ? Math.max(0, booking.depositCents - depositGcCents)
      : 0;

  const payments: InvoicePayment[] = [];
  if (stripeDepositCents > 0) {
    payments.push({ label: "Acompte payé en ligne (carte bancaire)", amountCents: stripeDepositCents });
  }
  for (const r of depositGc) {
    payments.push({ label: `Carte cadeau ••${r.giftCard.prefix} (acompte)`, amountCents: r.amountUsedCents });
  }
  if ((booking.revenueCents ?? 0) > 0) {
    payments.push({ label: methodLabel(booking.completionPaymentMethod), amountCents: booking.revenueCents! });
  }
  for (const r of serviceGc) {
    payments.push({ label: `Carte cadeau ••${r.giftCard.prefix}`, amountCents: r.amountUsedCents });
  }
  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0);

  const lines: InvoiceLine[] = [
    {
      label: booking.service.title,
      quantity: 1,
      unitCents: booking.service.priceCents,
      totalCents: booking.service.priceCents,
    },
    ...booking.options.map((o) => ({
      label: o.serviceOption.title,
      quantity: 1,
      unitCents: o.serviceOption.addedPriceCents,
      totalCents: o.serviceOption.addedPriceCents,
    })),
  ];
  const catalogTotal = lines.reduce((s, l) => s + l.totalCents, 0);
  const diff = totalCents - catalogTotal;
  if (diff !== 0) {
    lines.push({
      label: diff < 0 ? "Remise / ajustement" : "Supplément / ajustement",
      quantity: 1,
      unitCents: diff,
      totalCents: diff,
    });
  }

  return createInvoice({
    docType: "INVOICE",
    sourceType: "BOOKING",
    bookingId: booking.id,
    customerName: `${booking.clientFirstName} ${booking.clientLastName}`,
    customerEmail: booking.clientEmail,
    lines,
    payments,
    totalCents,
    serviceDate: booking.date,
    createdById: opts.createdById ?? null,
  });
}

export async function createInvoiceForGiftCard(
  giftCardId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const card = await prisma.giftCard.findUnique({
    where: { id: giftCardId },
    select: {
      id: true,
      prefix: true,
      creationMode: true,
      paymentMethod: true,
      paymentStatus: true,
      initialAmountCents: true,
      buyerName: true,
      buyerEmail: true,
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!card) throw new InvoiceError("Carte cadeau introuvable.");
  if (card.creationMode === "ADMIN_GIFT") {
    throw new InvoiceError("Carte offerte (geste commercial) : aucune vente à facturer.");
  }
  if (card.paymentStatus !== "PAID") throw new InvoiceError("Carte non payée.");
  if (card.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${card.invoices[0].number}).`);
  }

  const payLabel =
    card.creationMode === "PUBLIC"
      ? "Paiement en ligne (carte bancaire)"
      : methodLabel(card.paymentMethod);

  return createInvoice({
    docType: "INVOICE",
    sourceType: "GIFT_CARD",
    giftCardId: card.id,
    customerName: card.buyerName,
    customerEmail: card.buyerEmail,
    lines: [
      {
        label: `Carte cadeau ••${card.prefix}`,
        quantity: 1,
        unitCents: card.initialAmountCents,
        totalCents: card.initialAmountCents,
      },
    ],
    payments: [{ label: payLabel, amountCents: card.initialAmountCents }],
    totalCents: card.initialAmountCents,
    serviceDate: null,
    createdById: opts.createdById ?? null,
  });
}

export async function createInvoiceForEbookPurchase(
  purchaseId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      paymentStatus: true,
      amount: true,
      clientName: true,
      clientEmail: true,
      ebook: { select: { title: true } },
      giftCardRedemption: {
        select: { amountUsedCents: true, reversedAt: true, giftCard: { select: { prefix: true } } },
      },
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!purchase) throw new InvoiceError("Achat introuvable.");
  if (purchase.paymentStatus !== "PAID") throw new InvoiceError("Achat non payé.");
  if (purchase.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${purchase.invoices[0].number}).`);
  }

  const gc = purchase.giftCardRedemption;
  const gcCents = gc && !gc.reversedAt ? gc.amountUsedCents : 0;
  const stripeCents = Math.max(0, purchase.amount - gcCents);

  const payments: InvoicePayment[] = [];
  if (gcCents > 0 && gc) {
    payments.push({ label: `Carte cadeau ••${gc.giftCard.prefix}`, amountCents: gcCents });
  }
  if (stripeCents > 0) {
    payments.push({ label: "Paiement en ligne (carte bancaire)", amountCents: stripeCents });
  }

  return createInvoice({
    docType: "INVOICE",
    sourceType: "EBOOK",
    ebookPurchaseId: purchase.id,
    customerName: purchase.clientName ?? purchase.clientEmail,
    customerEmail: purchase.clientEmail,
    lines: [
      {
        label: `Ebook — ${purchase.ebook.title}`,
        quantity: 1,
        unitCents: purchase.amount,
        totalCents: purchase.amount,
      },
    ],
    payments,
    totalCents: purchase.amount,
    serviceDate: null,
    createdById: opts.createdById ?? null,
  });
}
```

- [ ] **Step 11.4 : Vérifier que les tests passent**

Run : `pnpm test -- invoice-create` → PASS (6 tests).

- [ ] **Step 11.5 : Commit**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add test/invoice-create.test.ts src/lib/invoice/create-invoice.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): builders booking / carte cadeau / ebook avec tests"
```

---

### Task 12: createCreditNote (TDD)

**Files:**
- Test: `test/invoice-credit-note.test.ts`
- Modify: `src/lib/invoice/create-invoice.ts` (ajout en fin de fichier)

- [ ] **Step 12.1 : Test (échoue d'abord)**

`test/invoice-credit-note.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, truncateAll } from "../e2e/db";
import { createInvoice, createCreditNote, InvoiceError } from "@/lib/invoice/create-invoice";

async function makeIssuedInvoice() {
  await db.platformSettings.create({ data: {} });
  return createInvoice({
    docType: "INVOICE",
    sourceType: "GIFT_CARD",
    customerName: "Cliente Test",
    customerEmail: "c@test.local",
    lines: [{ label: "Carte cadeau ••TEST", quantity: 1, unitCents: 5000, totalCents: 5000 }],
    payments: [{ label: "Espèces", amountCents: 5000 }],
    totalCents: 5000,
  });
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("createCreditNote", () => {
  it("avoir lié, série AV, montants/snapshots copiés", async () => {
    const parent = await makeIssuedInvoice();
    const cn = await createCreditNote({ parentInvoiceId: parent.id, amountCents: 2000, reason: "Geste commercial" });
    expect(cn.number).toMatch(/^AV-\d{4}-0001$/);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: cn.id },
      select: { docType: true, parentInvoiceId: true, totalCents: true, customerEmail: true, sourceType: true },
    });
    expect(row.docType).toBe("CREDIT_NOTE");
    expect(row.parentInvoiceId).toBe(parent.id);
    expect(row.totalCents).toBe(2000);
    expect(row.customerEmail).toBe("c@test.local");
    expect(row.sourceType).toBe("GIFT_CARD");
  });

  it("plafond = total − avoirs déjà émis", async () => {
    const parent = await makeIssuedInvoice();
    await createCreditNote({ parentInvoiceId: parent.id, amountCents: 4000 });
    await expect(
      createCreditNote({ parentInvoiceId: parent.id, amountCents: 1500 }),
    ).rejects.toThrow(InvoiceError);
    await createCreditNote({ parentInvoiceId: parent.id, amountCents: 1000 });
  });

  it("refuse un avoir sur un avoir", async () => {
    const parent = await makeIssuedInvoice();
    const cn = await createCreditNote({ parentInvoiceId: parent.id, amountCents: 1000 });
    await expect(
      createCreditNote({ parentInvoiceId: cn.id, amountCents: 500 }),
    ).rejects.toThrow(/facture/i);
  });
});
```

- [ ] **Step 12.2 : Vérifier l'échec puis implémenter**

Run : `pnpm test -- invoice-credit-note` → FAIL. Puis ajouter à la fin de `create-invoice.ts` :

```ts
export async function createCreditNote(input: {
  parentInvoiceId: string;
  amountCents: number;
  reason?: string | null;
  createdById?: string | null;
}): Promise<CreatedInvoice> {
  const parent = await prisma.invoice.findUnique({
    where: { id: input.parentInvoiceId },
    select: {
      id: true,
      number: true,
      docType: true,
      status: true,
      sourceType: true,
      bookingId: true,
      giftCardId: true,
      ebookPurchaseId: true,
      customerName: true,
      customerEmail: true,
      totalCents: true,
      creditNotes: { where: { status: "ISSUED" }, select: { totalCents: true } },
    },
  });
  if (!parent) throw new InvoiceError("Facture introuvable.");
  if (parent.docType !== "INVOICE") {
    throw new InvoiceError("Un avoir ne peut référencer qu'une facture.");
  }
  if (parent.status !== "ISSUED") throw new InvoiceError("Facture annulée.");

  const alreadyCredited = parent.creditNotes.reduce((s, c) => s + c.totalCents, 0);
  const cap = parent.totalCents - alreadyCredited;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > cap) {
    throw new InvoiceError(`Montant d'avoir invalide (maximum ${(cap / 100).toFixed(2)} €).`);
  }

  const label = input.reason?.trim() || `Avoir sur facture ${parent.number}`;
  return createInvoice({
    docType: "CREDIT_NOTE",
    sourceType: parent.sourceType,
    bookingId: parent.bookingId,
    giftCardId: parent.giftCardId,
    ebookPurchaseId: parent.ebookPurchaseId,
    parentInvoiceId: parent.id,
    parentNumber: parent.number,
    customerName: parent.customerName,
    customerEmail: parent.customerEmail,
    lines: [{ label, quantity: 1, unitCents: input.amountCents, totalCents: input.amountCents }],
    payments: [{ label: "Remboursement", amountCents: input.amountCents }],
    totalCents: input.amountCents,
    serviceDate: null,
    createdById: input.createdById ?? null,
  });
}
```

- [ ] **Step 12.3 : Vérifier PASS + suite complète + commit**

Run : `pnpm test` → TOUS les tests verts (14 existants + 12 nouveaux).

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add test/invoice-credit-note.test.ts src/lib/invoice/create-invoice.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): avoirs (createCreditNote) avec plafond testé"
```

---

### Task 13: Email facture (template + sendInvoiceEmail)

**Files:**
- Create: `src/lib/invoice/invoice-email.ts`

- [ ] **Step 13.1 : Écrire le module**

```ts
/**
 * Email "Votre facture" — PDF en pièce jointe. Sert l'envoi opt-in
 * (booking, GC admin) et le renvoi depuis la liste admin (factures ET avoirs).
 * Marque sentAt/sentTo en cas de succès.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { COLORS, emailLayout, escapeHtml } from "@/lib/email/templates/layout";
import { readInvoicePdf } from "./invoice-files";

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function buildInvoiceEmail(input: {
  firstName: string;
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  totalCents: number;
}) {
  const isCreditNote = input.docType === "CREDIT_NOTE";
  const docLabel = isCreditNote ? "avoir" : "facture";
  const subject = isCreditNote
    ? `Votre avoir ${input.number}`
    : `Votre facture ${input.number}`;

  const text = [
    `Bonjour ${input.firstName},`,
    ``,
    `Vous trouverez en pièce jointe votre ${docLabel} ${input.number}` +
      ` d'un montant de ${euros(input.totalCents)}.`,
    ``,
    `Conservez ce document pour vos archives.`,
    ``,
    `À très vite,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.firstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Vous trouverez en pièce jointe votre ${docLabel}
      <strong>${escapeHtml(input.number)}</strong> d'un montant de
      <strong>${euros(input.totalCents)}</strong>.
    </p>
    <p style="margin: 0; font-size: 13px; color: ${COLORS.ink500};">
      Conservez ce document pour vos archives.
    </p>
  `;

  return {
    subject,
    text,
    html: emailLayout({
      title: isCreditNote ? "Votre avoir" : "Votre facture",
      subtitle: input.number,
      contentHtml,
      preheader: `${isCreditNote ? "Avoir" : "Facture"} ${input.number} — ${euros(input.totalCents)}`,
    }),
  };
}

export async function sendInvoiceEmail(invoiceId: string): Promise<SendResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      docType: true,
      totalCents: true,
      customerName: true,
      customerEmail: true,
      pdfPath: true,
      status: true,
    },
  });
  if (!invoice) return { ok: false, error: "Facture introuvable." };
  if (invoice.status !== "ISSUED") return { ok: false, error: "Facture annulée." };

  let pdf: Buffer;
  try {
    pdf = await readInvoicePdf(invoice.pdfPath);
  } catch {
    return { ok: false, error: "Fichier PDF introuvable sur le serveur." };
  }

  const mail = buildInvoiceEmail({
    firstName: invoice.customerName.split(" ")[0] || invoice.customerName,
    number: invoice.number,
    docType: invoice.docType,
    totalCents: invoice.totalCents,
  });

  const result = await sendEmail({
    to: invoice.customerEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "invoice",
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
  });

  if (result.ok) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date(), sentTo: invoice.customerEmail },
    });
  }
  return result;
}

export async function markInvoiceSent(invoiceId: string, sentTo: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { sentAt: new Date(), sentTo },
  });
}
```

- [ ] **Step 13.2 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/invoice/invoice-email.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): email Votre facture avec PDF en pièce jointe"
```

---

### Task 14: Intégration booking (action + modale + warning)

**Files:**
- Modify: `src/lib/actions/booking-admin.ts`
- Modify: `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx`

- [ ] **Step 14.1 : Étendre MarkCompletedInput + génération fail-soft**

Dans `booking-admin.ts` :

1. Ajouter aux imports :
```ts
import { createInvoiceForBooking, InvoiceError } from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";
```

2. Dans `export type MarkCompletedInput`, ajouter après `giftCard?: { … };` :
```ts
  /** Envoyer la facture PDF à la cliente par email (opt-in, décoché par défaut). */
  sendInvoiceByEmail?: boolean;
```

3. Dans `markBookingCompleted`, REMPLACER le bloc final :
```ts
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Réservation marquée comme honorée." };
```
par :
```ts
  let invoiceNote = "";
  try {
    const invoice = await createInvoiceForBooking(bookingId, { createdById: admin.id });
    if (input.sendInvoiceByEmail) {
      const sent = await sendInvoiceEmail(invoice.id);
      invoiceNote = sent.ok
        ? ` Facture ${invoice.number} envoyée à la cliente.`
        : ` Facture ${invoice.number} générée, mais l'email a échoué (renvoi possible depuis la fiche).`;
    } else {
      invoiceNote = ` Facture ${invoice.number} générée.`;
    }
  } catch (err) {
    const detail = err instanceof InvoiceError ? ` (${err.message})` : "";
    console.error("[invoice] génération booking échouée:", err);
    invoiceNote = ` ⚠️ Facture non générée${detail} — bouton « Générer la facture » disponible sur la fiche.`;
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: `Réservation marquée comme honorée.${invoiceNote}` };
```

4. Dans `updateBookingRevenue`, juste avant le `return { ok: true, message: "Montant perçu mis à jour." };` final, ajouter :
```ts
  const existingInvoice = await prisma.invoice.findFirst({
    where: { bookingId, docType: "INVOICE", status: "ISSUED" },
    select: { number: true },
  });
  if (existingInvoice) {
    return {
      ok: true,
      message: `Montant mis à jour. ⚠️ La facture ${existingInvoice.number} a déjà été émise avec l'ancien montant — crée un avoir depuis Finances → Factures si nécessaire.`,
    };
  }
```

- [ ] **Step 14.2 : Case à cocher dans MarkCompletedDialog**

Dans `booking-actions.tsx`, fonction `MarkCompletedDialog` :

1. Ajouter l'état après `const [lookupPending, startLookup] = useTransition();` :
```tsx
  const [sendInvoice, setSendInvoice] = useState(false);
```

2. Dans `handleSubmit()`, ajouter au payload après `giftCard: …` :
```tsx
      sendInvoiceByEmail: sendInvoice,
```

3. Dans le JSX, APRÈS le bloc `{useGiftCard && ( … )}` (fermeture du panneau carte cadeau) et AVANT la zone montant/boutons qui suit, insérer la case (même pattern visuel que le toggle carte cadeau) :
```tsx
          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendInvoice}
              onChange={(e) => setSendInvoice(e.target.checked)}
              disabled={disabled}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
                sendInvoice
                  ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-paper)]"
              }`}
            >
              {sendInvoice && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <span
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Envoyer la facture par email à la cliente
            </span>
          </label>
```
(La facture est générée dans tous les cas ; la case ne pilote que l'envoi.)

- [ ] **Step 14.3 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur. Vérif manuelle (dev Damien) : marquer un RDV honoré → message contient « Facture FAC-… générée » ; avec la case cochée → mail mock en console avec `Attach : FAC-….pdf`.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/actions/booking-admin.ts "src/app/admin/(protected)/bookings/[id]/booking-actions.tsx"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): génération au markCompleted + case envoi email + warning édition CA"
```

---

### Task 15: Intégration webhooks Stripe (GC en ligne + ebook)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 15.1 : Imports**

Ajouter aux imports du fichier :
```ts
import { createInvoiceForGiftCard, createInvoiceForEbookPurchase } from "@/lib/invoice/create-invoice";
import { readInvoicePdf } from "@/lib/invoice/invoice-files";
import { markInvoiceSent } from "@/lib/invoice/invoice-email";
```

- [ ] **Step 15.2 : GC en ligne — facture jointe au reçu acheteuse**

Dans `activateGiftCardFromSession`, AVANT le bloc `// Reçu acheteuse` (le `try {` qui construit `buildGiftCardPurchaseReceiptEmail`), insérer :

```ts
  // Facture (fail-soft : un échec ne bloque jamais l'activation ni les emails)
  let invoiceAttachment: { filename: string; content: Buffer } | null = null;
  let invoiceId: string | null = null;
  try {
    const invoice = await createInvoiceForGiftCard(card.id);
    invoiceId = invoice.id;
    invoiceAttachment = {
      filename: `${invoice.number}.pdf`,
      content: await readInvoicePdf(invoice.pdfPath),
    };
  } catch (err) {
    console.error("[stripe webhook] facture gift card échec:", err);
  }
```

Puis dans ce même bloc reçu, modifier l'appel `sendEmail({ … tag: "gift-card.public-receipt", })` en :

```ts
    const receiptResult = await sendEmail({
      to: card.buyerEmail,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      tag: "gift-card.public-receipt",
      ...(invoiceAttachment ? { attachments: [invoiceAttachment] } : {}),
    });
    if (receiptResult.ok && invoiceId && invoiceAttachment) {
      await markInvoiceSent(invoiceId, card.buyerEmail);
    }
```

- [ ] **Step 15.3 : Ebook — facture jointe au mail d'achat**

Dans `confirmEbookPurchaseFromSession`, AVANT le bloc `// Email cliente avec lien PDF`, insérer :

```ts
  // Facture (fail-soft)
  let invoiceAttachment: { filename: string; content: Buffer } | null = null;
  let invoiceId: string | null = null;
  try {
    const invoice = await createInvoiceForEbookPurchase(purchase.id);
    invoiceId = invoice.id;
    invoiceAttachment = {
      filename: `${invoice.number}.pdf`,
      content: await readInvoicePdf(invoice.pdfPath),
    };
  } catch (err) {
    console.error("[stripe webhook] facture ebook échec:", err);
  }
```

Puis dans l'appel `sendEmail({ … tag: "ebook.purchased", })`, ajouter avant la fermeture :
```ts
      ...(invoiceAttachment ? { attachments: [invoiceAttachment] } : {}),
```
et après le `} else {` (cas succès, là où il y a le `console.log("… email ebook envoyé …")`), ajouter :
```ts
      if (invoiceId && invoiceAttachment) {
        await markInvoiceSent(invoiceId, purchase.clientEmail);
      }
```

- [ ] **Step 15.4 : Gates + test webhook existant + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint && pnpm test -- stripe-webhook`
Attendu : 0 erreur, tests webhook existants toujours verts (la signature/idempotence n'est pas touchée). Note : le test route webhook tourne sans `PlatformSettings` ni montants réels → la génération facture y échoue silencieusement (fail-soft), c'est attendu.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/app/api/webhooks/stripe/route.ts
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): génération auto + PDF joint aux mails webhook (GC en ligne, ebooks)"
```

---

### Task 16: GC admin (vente salon) + avoirs auto sur refunds

**Files:**
- Modify: `src/lib/actions/gift-card-admin.ts`
- Modify: `src/app/admin/(protected)/cartes-cadeau/new/gift-card-create-form.tsx`
- Modify: `src/lib/actions/ebook-sales-admin.ts`

- [ ] **Step 16.1 : createGiftCardAdmin — facture ADMIN_SALE + envoi opt-in**

Dans `gift-card-admin.ts` :

1. Imports :
```ts
import { createInvoiceForGiftCard, createCreditNote, InvoiceError } from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";
```

2. Dans `CreateGiftCardAdminInput`, ajouter :
```ts
  /** ADMIN_SALE uniquement : envoyer la facture PDF à l'acheteuse (opt-in). */
  sendInvoiceByEmail?: boolean;
```

3. Dans `createGiftCardAdmin`, APRÈS le bloc `await audit(admin.id, created.id, "gift_card.created_admin", …)` et AVANT le bloc « Envoi email immédiat », insérer :
```ts
  // Facture pour les ventes en salon (fail-soft ; jamais pour ADMIN_GIFT)
  if (input.mode === "ADMIN_SALE") {
    try {
      const invoice = await createInvoiceForGiftCard(created.id, { createdById: admin.id });
      if (input.sendInvoiceByEmail && finalBuyerEmail) {
        await sendInvoiceEmail(invoice.id);
      }
    } catch (err) {
      console.error("[gift-card-admin] facture vente salon échec:", err);
    }
  }
```

- [ ] **Step 16.2 : Case dans le formulaire de création GC**

Dans `gift-card-create-form.tsx` :

1. État, après `const [giftMessage, setGiftMessage] = useState("");` :
```tsx
  const [sendInvoice, setSendInvoice] = useState(false);
```

2. Localiser l'endroit où l'input est construit pour l'appel `createGiftCardAdmin` (le payload qui contient `mode, paymentMethod, buyerName, buyerEmail…`) et y ajouter :
```tsx
        sendInvoiceByEmail: mode === "ADMIN_SALE" ? sendInvoice : false,
```

3. Dans le JSX de la section ADMIN_SALE (le bloc conditionnel `mode === "ADMIN_SALE"` qui contient acheteuse + mode de paiement), ajouter à la fin du bloc :
```tsx
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendInvoice}
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--color-violet-600)]"
                />
                <span className="text-sm text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-ui)" }}>
                  Envoyer la facture par email à l&apos;acheteuse
                  <span className="block text-xs text-[var(--color-ink-500)]">
                    La facture est générée et archivée dans tous les cas (Finances → Factures).
                  </span>
                </span>
              </label>
```
(Si ni email acheteuse ni « identique au bénéficiaire » ne fournissent d'email, l'action n'enverra simplement pas — la facture reste archivée.)

- [ ] **Step 16.3 : Avoir auto sur refund GC Stripe**

Dans `refundGiftCardStripe`, APRÈS le bloc `await audit(admin.id, id, "gift_card.refunded_stripe", …);` et AVANT `revalidatePath`, insérer :
```ts
  try {
    const parentInvoice = await prisma.invoice.findFirst({
      where: { giftCardId: id, docType: "INVOICE", status: "ISSUED" },
      select: { id: true },
    });
    if (parentInvoice) {
      const creditNote = await createCreditNote({
        parentInvoiceId: parentInvoice.id,
        amountCents: refund.amount,
        reason: "Remboursement carte cadeau",
        createdById: admin.id,
      });
      await audit(admin.id, id, "invoice.credit_note_created", {
        number: creditNote.number,
        amountCents: refund.amount,
      });
    }
  } catch (err) {
    if (!(err instanceof InvoiceError)) console.error("[gift-card-admin] avoir refund échec:", err);
    else console.warn("[gift-card-admin] avoir refund refusé:", err.message);
  }
```

- [ ] **Step 16.4 : Avoir auto sur refund ebook**

Dans `ebook-sales-admin.ts` :

1. Imports :
```ts
import { createCreditNote, InvoiceError } from "@/lib/invoice/create-invoice";
```

2. Dans `refundEbookPurchase`, APRÈS le bloc `await audit(admin.id, purchase.id, "ebook_purchase.refunded", …);` et AVANT le bloc `// 4) Email cliente`, insérer (utilise `totalRefunded` déjà calculé dans la fonction ; l'avoir sera joint au mail de remboursement, cf. spec §1.6) :
```ts
  let creditNoteAttachment: { filename: string; content: Buffer } | null = null;
  let creditNoteId: string | null = null;
  try {
    const parentInvoice = await prisma.invoice.findFirst({
      where: { ebookPurchaseId: purchase.id, docType: "INVOICE", status: "ISSUED" },
      select: { id: true },
    });
    if (parentInvoice && totalRefunded > 0) {
      const creditNote = await createCreditNote({
        parentInvoiceId: parentInvoice.id,
        amountCents: totalRefunded,
        reason: "Remboursement ebook",
        createdById: admin.id,
      });
      creditNoteId = creditNote.id;
      creditNoteAttachment = {
        filename: `${creditNote.number}.pdf`,
        content: await readInvoicePdf(creditNote.pdfPath),
      };
      await audit(admin.id, purchase.id, "invoice.credit_note_created", {
        number: creditNote.number,
        amountCents: totalRefunded,
      });
    }
  } catch (err) {
    if (!(err instanceof InvoiceError)) console.error("[ebook refund] avoir échec:", err);
    else console.warn("[ebook refund] avoir refusé:", err.message);
  }
```

3. Compléter les imports du fichier :
```ts
import { readInvoicePdf } from "@/lib/invoice/invoice-files";
import { markInvoiceSent } from "@/lib/invoice/invoice-email";
```
puis dans le bloc `// 4) Email cliente`, ajouter à l'appel `sendEmail({ … tag: "ebook.refunded", })` :
```ts
      ...(creditNoteAttachment ? { attachments: [creditNoteAttachment] } : {}),
```
et après l'envoi, si `r.ok && creditNoteId && creditNoteAttachment` :
```ts
    if (r.ok && creditNoteId && creditNoteAttachment) {
      await markInvoiceSent(creditNoteId, purchase.clientEmail);
    }
```
(Le refund GC Stripe n'envoie aucun email aujourd'hui → l'avoir GC reste archivé seulement, conforme au spec « sinon stocké seulement ».)

- [ ] **Step 16.5 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/actions/gift-card-admin.ts src/lib/actions/ebook-sales-admin.ts "src/app/admin/(protected)/cartes-cadeau/new/gift-card-create-form.tsx"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): vente GC salon + avoirs auto sur remboursements GC/ebook"
```

---

### Task 17: Actions admin factures + route download

**Files:**
- Create: `src/lib/actions/invoice-admin.ts`
- Create: `src/app/api/v1/admin/invoices/[id]/download/route.ts`

- [ ] **Step 17.1 : Actions admin**

`src/lib/actions/invoice-admin.ts` :

```ts
"use server";

/**
 * Server Actions admin — factures : renvoi email, avoir manuel, génération
 * fallback (RDV honoré / carte cadeau / achat ebook sans facture).
 * Jamais de suppression ni d'édition : les factures émises sont immuables.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  createCreditNote,
  createInvoiceForBooking,
  createInvoiceForEbookPurchase,
  createInvoiceForGiftCard,
  InvoiceError,
} from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function audit(adminId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { adminId, action, metadata: metadata as object } });
}

function errorMessage(err: unknown): string {
  return err instanceof InvoiceError ? err.message : "Erreur interne.";
}

export async function resendInvoiceEmail(invoiceId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { number: true, customerEmail: true },
  });
  if (!invoice) return { ok: false, error: "Facture introuvable." };

  const result = await sendInvoiceEmail(invoiceId);
  if (!result.ok) return { ok: false, error: `Envoi échoué : ${result.error}` };

  await audit(admin.id, "invoice.resent", { invoiceId, number: invoice.number, to: invoice.customerEmail });
  revalidatePath("/admin/finances/factures");
  return { ok: true, message: `Facture ${invoice.number} envoyée à ${invoice.customerEmail}.` };
}

export async function createCreditNoteAction(
  parentInvoiceId: string,
  amountEuros: number,
  reason: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
    return { ok: false, error: "Montant invalide." };
  }

  try {
    const creditNote = await createCreditNote({
      parentInvoiceId,
      amountCents: Math.round(amountEuros * 100),
      reason: reason.trim() || null,
      createdById: admin.id,
    });
    await audit(admin.id, "invoice.credit_note_created", {
      parentInvoiceId,
      number: creditNote.number,
      amountCents: Math.round(amountEuros * 100),
    });
    revalidatePath("/admin/finances/factures");
    return { ok: true, message: `Avoir ${creditNote.number} créé.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function generateInvoiceForSource(input: {
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  sourceId: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  try {
    const invoice =
      input.sourceType === "BOOKING"
        ? await createInvoiceForBooking(input.sourceId, { createdById: admin.id })
        : input.sourceType === "GIFT_CARD"
          ? await createInvoiceForGiftCard(input.sourceId, { createdById: admin.id })
          : await createInvoiceForEbookPurchase(input.sourceId, { createdById: admin.id });

    await audit(admin.id, "invoice.issued", {
      number: invoice.number,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Facture ${invoice.number} générée.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
```

- [ ] **Step 17.2 : Route de téléchargement**

`src/app/api/v1/admin/invoices/[id]/download/route.ts` :

```ts
/**
 * GET /api/v1/admin/invoices/[id]/download — stream du PDF facture/avoir.
 * Auth ADMIN obligatoire. Fichiers sous private/ (jamais servis statiquement).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { readInvoicePdf } from "@/lib/invoice/invoice-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true, pdfPath: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await readInvoicePdf(invoice.pdfPath);
  } catch {
    return NextResponse.json({ error: "Fichier PDF manquant" }, { status: 404 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Content-Length": pdf.byteLength.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 17.3 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/actions/invoice-admin.ts "src/app/api/v1/admin/invoices/"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): actions admin (renvoi, avoir, génération fallback) + route download"
```

---

### Task 18: Liste /admin/finances/factures + bouton Finances

**Files:**
- Create: `src/app/admin/(protected)/finances/factures/page.tsx`
- Create: `src/app/admin/(protected)/finances/factures/invoices-table.tsx`
- Modify: `src/app/admin/(protected)/finances/page.tsx`

- [ ] **Step 18.1 : Page serveur (filtres + pagination)**

`src/app/admin/(protected)/finances/factures/page.tsx` :

```tsx
/**
 * Page /admin/finances/factures — liste plate des factures et avoirs.
 *
 * Filtres querystring : ?q= (numéro/nom/email), ?source= (BOOKING|GIFT_CARD|EBOOK),
 * ?doc= (INVOICE|CREDIT_NOTE), ?page=. L'historique par cliente = recherche q.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InvoicesTable } from "./invoices-table";

export const metadata: Metadata = { title: "Factures · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const SOURCES = ["BOOKING", "GIFT_CARD", "EBOOK"] as const;
const DOCS = ["INVOICE", "CREDIT_NOTE"] as const;

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; doc?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const source = SOURCES.includes(sp.source as (typeof SOURCES)[number])
    ? (sp.source as (typeof SOURCES)[number])
    : undefined;
  const doc = DOCS.includes(sp.doc as (typeof DOCS)[number])
    ? (sp.doc as (typeof DOCS)[number])
    : undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.InvoiceWhereInput = {
    ...(source ? { sourceType: source } : {}),
    ...(doc ? { docType: doc } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [invoices, totalCount, sums] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        docType: true,
        sourceType: true,
        status: true,
        customerName: true,
        customerEmail: true,
        totalCents: true,
        issuedAt: true,
        sentAt: true,
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { totalCents: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const queryBase = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(source ? { source } : {}),
    ...(doc ? { doc } : {}),
  }).toString();

  return (
    <div className="max-w-[1100px] mx-auto px-5 lg:px-8 py-10 space-y-6">
      <header>
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Link href="/admin/finances" className="hover:text-[var(--color-violet-700)] transition-colors">
            Finances
          </Link>{" "}
          / Factures
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Factures
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
          {totalCount} document{totalCount > 1 ? "s" : ""} · total{" "}
          {(((sums._sum.totalCents ?? 0) as number) / 100).toFixed(2).replace(".", ",")} € sur la sélection.
        </p>
      </header>

      <form method="get" className="flex flex-wrap gap-2 items-center" style={{ fontFamily: "var(--font-ui)" }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="N° de facture, nom ou email…"
          className="flex-1 min-w-[220px] px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
        />
        <select
          name="source"
          defaultValue={source ?? ""}
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm"
        >
          <option value="">Toutes les ventes</option>
          <option value="BOOKING">Prestations</option>
          <option value="GIFT_CARD">Cartes cadeau</option>
          <option value="EBOOK">Ebooks</option>
        </select>
        <select
          name="doc"
          defaultValue={doc ?? ""}
          className="px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm"
        >
          <option value="">Factures + avoirs</option>
          <option value="INVOICE">Factures</option>
          <option value="CREDIT_NOTE">Avoirs</option>
        </select>
        <button
          type="submit"
          className="px-4 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Filtrer
        </button>
      </form>

      <InvoicesTable
        invoices={invoices.map((i) => ({ ...i, issuedAt: i.issuedAt.toISOString(), sentAt: i.sentAt?.toISOString() ?? null }))}
      />

      {totalPages > 1 && (
        <nav className="flex gap-2 justify-center text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          {page > 1 && (
            <Link href={`?${queryBase}&page=${page - 1}`} className="px-3 py-1.5 border border-[var(--color-line)] rounded hover:border-[var(--color-violet-600)] transition-colors">
              ← Précédent
            </Link>
          )}
          <span className="px-3 py-1.5 text-[var(--color-ink-500)]">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`?${queryBase}&page=${page + 1}`} className="px-3 py-1.5 border border-[var(--color-line)] rounded hover:border-[var(--color-violet-600)] transition-colors">
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 18.2 : Table client (actions + modale avoir)**

`src/app/admin/(protected)/finances/factures/invoices-table.tsx` :

```tsx
"use client";

/**
 * InvoicesTable — lignes factures/avoirs avec actions : télécharger (route
 * download), renvoyer par email (confirm), créer un avoir (modale montant+motif).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCreditNoteAction, resendInvoiceEmail } from "@/lib/actions/invoice-admin";

type Row = {
  id: string;
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  status: "ISSUED" | "CANCELLED";
  customerName: string;
  customerEmail: string;
  totalCents: number;
  issuedAt: string;
  sentAt: string | null;
};

const SOURCE_LABELS: Record<Row["sourceType"], string> = {
  BOOKING: "Prestation",
  GIFT_CARD: "Carte cadeau",
  EBOOK: "Ebook",
};

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function dateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function InvoicesTable({ invoices }: { invoices: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Row | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? (result.message ?? "OK") : `⚠ ${result.error}`);
      if (result.ok) {
        setCreditNoteFor(null);
        router.refresh();
      }
    });
  }

  if (invoices.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-500)] text-center py-12" style={{ fontFamily: "var(--font-ui)" }}>
        Aucune facture pour ces critères.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <p role="status" className="text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          {feedback}
        </p>
      )}

      <div className="overflow-x-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)]">
        <table className="w-full text-sm" style={{ fontFamily: "var(--font-ui)" }}>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] border-b border-[var(--color-line)]">
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vente</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Envoi</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--color-line)] last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  {inv.number}
                  {inv.docType === "CREDIT_NOTE" && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-violet-100)] text-[var(--color-violet-700)]">
                      Avoir
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{dateFr(inv.issuedAt)}</td>
                <td className="px-4 py-3">
                  <span className="block">{inv.customerName}</span>
                  <span className="block text-xs text-[var(--color-ink-500)]">{inv.customerEmail}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{SOURCE_LABELS[inv.sourceType]}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{euros(inv.totalCents)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--color-ink-500)]">
                  {inv.sentAt ? `Envoyée le ${dateFr(inv.sentAt)}` : "Non envoyée"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 justify-end text-xs">
                    <a
                      href={`/api/v1/admin/invoices/${inv.id}/download`}
                      className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors whitespace-nowrap"
                    >
                      PDF
                    </a>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Envoyer ${inv.number} à ${inv.customerEmail} ?`)) {
                          run(() => resendInvoiceEmail(inv.id));
                        }
                      }}
                      className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      Renvoyer
                    </button>
                    {inv.docType === "INVOICE" && inv.status === "ISSUED" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setCreditNoteFor(inv)}
                        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        Avoir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creditNoteFor && (
        <CreditNoteDialog
          invoice={creditNoteFor}
          pending={pending}
          onCancel={() => setCreditNoteFor(null)}
          onConfirm={(amountEuros, reason) =>
            run(() => createCreditNoteAction(creditNoteFor.id, amountEuros, reason))
          }
        />
      )}
    </div>
  );
}

function CreditNoteDialog({
  invoice,
  pending,
  onCancel,
  onConfirm,
}: {
  invoice: Row;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (amountEuros: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState((invoice.totalCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const parsed = Number.parseFloat(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= invoice.totalCents / 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Créer un avoir"
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-md w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Avoir sur {invoice.number}
          </h3>
          <p className="text-xs text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
            {invoice.customerName} · facture de {euros(invoice.totalCents)}. L&apos;avoir est
            archivé et numéroté (série AV) — il ne déclenche pas de remboursement bancaire.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="cn-amount" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
              Montant de l&apos;avoir (€)
            </label>
            <input
              id="cn-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={(invoice.totalCents / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cn-reason" className="block text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
              Motif (optionnel, visible sur l&apos;avoir)
            </label>
            <input
              id="cn-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Geste commercial, erreur de saisie…"
              className="w-full px-3 py-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-4 h-10 rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onConfirm(parsed, reason)}
              disabled={pending || !valid}
              className="px-5 h-10 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pending ? "…" : "Créer l'avoir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 18.3 : Bouton « Factures » sur la page Finances**

Dans `src/app/admin/(protected)/finances/page.tsx`, ajouter `import Link from "next/link";` si absent, puis dans le `<header className="space-y-2 anim-fade-up">`, REMPLACER le `<h1 …>Finances</h1>` par un wrapper flex avec le bouton :

```tsx
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1
            className="text-3xl md:text-4xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Finances
          </h1>
          <Link
            href="/admin/finances/factures"
            className="px-5 h-10 inline-flex items-center rounded-full border border-[var(--color-line)] text-xs uppercase tracking-[0.06em] hover:border-[var(--color-violet-600)] hover:text-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Factures →
          </Link>
        </div>
```

- [ ] **Step 18.4 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add "src/app/admin/(protected)/finances/"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): liste /admin/finances/factures (filtres, renvoi, avoir) + bouton Finances"
```

---

### Task 19: Blocs Facture contextuels (booking / GC / vente ebook)

**Files:**
- Create: `src/components/admin/invoice-block.tsx`
- Create: `src/components/admin/invoice-block-actions.tsx`
- Modify: `src/app/admin/(protected)/bookings/[id]/page.tsx`
- Modify: `src/app/admin/(protected)/cartes-cadeau/[id]/page.tsx`
- Modify: `src/app/admin/(protected)/ebooks/ventes/[id]/page.tsx`

- [ ] **Step 19.1 : Composant serveur InvoiceBlock**

`src/components/admin/invoice-block.tsx` — autonome : il fait sa propre requête, les pages n'ont qu'une ligne JSX à ajouter :

```tsx
/**
 * InvoiceBlock — Server Component autonome. Affiche la facture (et avoirs)
 * d'une vente : numéro, date, montant, statut envoi + actions client
 * (télécharger / renvoyer / générer en fallback si absente).
 * canGenerate : false quand la source n'est pas facturable (ex. ADMIN_GIFT,
 * booking non honoré) → le bloc est masqué s'il n'y a pas non plus de facture.
 */

import { prisma } from "@/lib/prisma";
import { InvoiceBlockActions } from "./invoice-block-actions";

type Source =
  | { sourceType: "BOOKING"; bookingId: string }
  | { sourceType: "GIFT_CARD"; giftCardId: string }
  | { sourceType: "EBOOK"; ebookPurchaseId: string };

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export async function InvoiceBlock({
  source,
  canGenerate,
}: {
  source: Source;
  canGenerate: boolean;
}) {
  const where =
    source.sourceType === "BOOKING"
      ? { bookingId: source.bookingId }
      : source.sourceType === "GIFT_CARD"
        ? { giftCardId: source.giftCardId }
        : { ebookPurchaseId: source.ebookPurchaseId };

  const documents = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: "asc" },
    select: {
      id: true,
      number: true,
      docType: true,
      status: true,
      totalCents: true,
      issuedAt: true,
      sentAt: true,
      sentTo: true,
    },
  });

  const sourceId =
    source.sourceType === "BOOKING"
      ? source.bookingId
      : source.sourceType === "GIFT_CARD"
        ? source.giftCardId
        : source.ebookPurchaseId;

  if (documents.length === 0 && !canGenerate) return null;

  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 space-y-3">
      <h2
        className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Facturation
      </h2>

      {documents.length === 0 ? (
        <InvoiceBlockActions
          mode="generate"
          sourceType={source.sourceType}
          sourceId={sourceId}
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <div>
                <span className="font-mono text-xs">{doc.number}</span>
                {doc.docType === "CREDIT_NOTE" && (
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-violet-100)] text-[var(--color-violet-700)]">
                    Avoir
                  </span>
                )}
                <span className="block text-xs text-[var(--color-ink-500)]">
                  {euros(doc.totalCents)} · émise le{" "}
                  {doc.issuedAt.toLocaleDateString("fr-FR")} ·{" "}
                  {doc.sentAt
                    ? `envoyée à ${doc.sentTo}`
                    : "non envoyée"}
                </span>
              </div>
              <InvoiceBlockActions mode="document" invoiceId={doc.id} invoiceNumber={doc.number} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 19.2 : Actions client du bloc**

`src/components/admin/invoice-block-actions.tsx` :

```tsx
"use client";

/**
 * Boutons client du bloc Facturation : télécharger / renvoyer (mode document)
 * ou générer en fallback (mode generate). Feedback inline, refresh après action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoiceForSource, resendInvoiceEmail } from "@/lib/actions/invoice-admin";

type Props =
  | { mode: "document"; invoiceId: string; invoiceNumber: string }
  | { mode: "generate"; sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK"; sourceId: string };

export function InvoiceBlockActions(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? (result.message ?? "OK") : `⚠ ${result.error}`);
      if (result.ok) router.refresh();
    });
  }

  if (props.mode === "generate") {
    return (
      <div className="space-y-2" style={{ fontFamily: "var(--font-ui)" }}>
        <p className="text-sm text-[var(--color-ink-500)]">Aucune facture émise pour cette vente.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generateInvoiceForSource({ sourceType: props.sourceType, sourceId: props.sourceId }))}
          className="px-4 h-9 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-600)] hover:text-white disabled:opacity-50 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "…" : "Générer la facture"}
        </button>
        {feedback && <p className="text-xs" role="status">{feedback}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ fontFamily: "var(--font-ui)" }}>
      <a
        href={`/api/v1/admin/invoices/${props.invoiceId}/download`}
        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] transition-colors"
      >
        PDF
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => resendInvoiceEmail(props.invoiceId))}
        className="px-2.5 py-1.5 rounded border border-[var(--color-line)] hover:border-[var(--color-violet-600)] disabled:opacity-50 transition-colors"
      >
        {pending ? "…" : "Renvoyer"}
      </button>
      {feedback && <span role="status">{feedback}</span>}
    </div>
  );
}
```

- [ ] **Step 19.3 : Intégrer dans les 3 pages détail**

Pour chacune, ajouter l'import `import { InvoiceBlock } from "@/components/admin/invoice-block";` puis insérer le bloc dans la colonne/zone d'infos (repérer la structure avec `grep -n "section\|className=\"space-y" <fichier>` et placer le bloc après le bloc paiement/infos principal) :

1. `bookings/[id]/page.tsx` — la page charge déjà `booking` avec son `status` :
```tsx
          <InvoiceBlock
            source={{ sourceType: "BOOKING", bookingId: booking.id }}
            canGenerate={booking.status === "COMPLETED"}
          />
```

2. `cartes-cadeau/[id]/page.tsx` — la page charge `card` (avec `creationMode`, `paymentStatus`) :
```tsx
          <InvoiceBlock
            source={{ sourceType: "GIFT_CARD", giftCardId: card.id }}
            canGenerate={card.creationMode !== "ADMIN_GIFT" && card.paymentStatus === "PAID"}
          />
```
(Si la variable locale s'appelle autrement que `card`, adapter ; si `creationMode`/`paymentStatus` ne sont pas dans le `select` de la page, les ajouter.)

3. `ebooks/ventes/[id]/page.tsx` — la page charge `purchase` (avec `paymentStatus`) :
```tsx
          <InvoiceBlock
            source={{ sourceType: "EBOOK", ebookPurchaseId: purchase.id }}
            canGenerate={purchase.paymentStatus === "PAID"}
          />
```

- [ ] **Step 19.4 : Gates + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/components/admin/invoice-block.tsx src/components/admin/invoice-block-actions.tsx "src/app/admin/(protected)/bookings/[id]/page.tsx" "src/app/admin/(protected)/cartes-cadeau/[id]/page.tsx" "src/app/admin/(protected)/ebooks/ventes/[id]/page.tsx"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): bloc Facturation sur fiches booking / carte cadeau / vente ebook"
```

---

### Task 20: Settings — section Facturation + upload logo

**Files:**
- Create: `src/lib/actions/invoice-logo.ts`
- Create: `src/lib/invoice-logo-files.ts`
- Modify: `src/lib/actions/settings-admin.ts`
- Modify: `src/app/admin/(protected)/parametres/settings-form.tsx`
- Modify: `src/app/admin/(protected)/parametres/page.tsx`

- [ ] **Step 20.1 : Traitement fichier logo (PNG via Sharp)**

`src/lib/invoice-logo-files.ts` (calqué sur `email-banner-files.ts`, mais sortie PNG — react-pdf ne lit pas le WebP) :

```ts
/**
 * Upload du logo de facture : converti en PNG (transparence préservée),
 * largeur max 1200 px, stocké dans /public/uploads/invoice-logo/{uuid}.png.
 * PNG obligatoire : @react-pdf/renderer ne supporte ni SVG ni WebP.
 */

import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "uploads", "invoice-logo");
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type Result =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function processInvoiceLogoUpload(file: File): Promise<Result> {
  if (!ACCEPTED.includes(file.type)) {
    return { ok: false, error: "Format accepté : PNG, JPEG, WebP ou SVG." };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "Fichier trop lourd (8 Mo max)." };
  }

  const input = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    png = await sharp(input, { density: 300 })
      .resize({ width: 1200, withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return { ok: false, error: "Image illisible ou corrompue." };
  }

  await mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}.png`;
  await writeFile(path.join(DIR, name), png);
  return { ok: true, url: `/uploads/invoice-logo/${name}` };
}

export async function deleteInvoiceLogoFile(url: string): Promise<void> {
  if (!url.startsWith("/uploads/invoice-logo/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 20.2 : Actions upload/remove**

`src/lib/actions/invoice-logo.ts` (même squelette que `email-banner.ts`) :

```ts
"use server";

/**
 * Server Actions — upload/suppression du logo de facture.
 * Met à jour PlatformSettings.invoiceLogoUrl. L'ancien fichier uploadé est
 * supprimé (les logos /brand/ commités ne le sont jamais).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { deleteInvoiceLogoFile, processInvoiceLogoUpload } from "@/lib/invoice-logo-files";

type Result =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

export async function uploadInvoiceLogo(formData: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };

  const processed = await processInvoiceLogoUpload(file);
  if (!processed.ok) return processed;

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { invoiceLogoUrl: processed.url, updatedById: admin.id },
  });
  if (settings.invoiceLogoUrl) await deleteInvoiceLogoFile(settings.invoiceLogoUrl);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.invoice_logo_uploaded",
      metadata: { url: processed.url } as object,
    },
  });
  revalidatePath("/admin/parametres");
  return { ok: true, url: processed.url };
}

export async function removeInvoiceLogo(): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: settings.id },
    data: { invoiceLogoUrl: null, updatedById: admin.id },
  });
  if (settings.invoiceLogoUrl) await deleteInvoiceLogoFile(settings.invoiceLogoUrl);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "platform.invoice_logo_removed",
      metadata: {} as object,
    },
  });
  revalidatePath("/admin/parametres");
  return { ok: true, url: null };
}
```

- [ ] **Step 20.3 : Étendre settings-admin.ts**

Dans le `settingsSchema` (zod), ajouter après le bloc « Emails transactionnels » :

```ts
    // Facturation
    invoiceHeaderName: z
      .string()
      .trim()
      .max(120, "Nom trop long (120 chars max)")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    invoiceLegalOwner: z
      .string()
      .trim()
      .max(200, "Texte trop long (200 chars max)")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    invoiceVatMention: z
      .string()
      .trim()
      .min(2, "Mention TVA requise")
      .max(300, "Mention trop longue"),
    invoiceLegalFooter: z
      .string()
      .trim()
      .max(2000, "Texte trop long (2000 chars max)")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
```

Dans `updatePlatformSettings` : ajouter au `raw` :
```ts
    invoiceHeaderName: formData.get("invoiceHeaderName") ?? "",
    invoiceLegalOwner: formData.get("invoiceLegalOwner") ?? "",
    invoiceVatMention: formData.get("invoiceVatMention"),
    invoiceLegalFooter: formData.get("invoiceLegalFooter") ?? "",
```
et au `data:` du `prisma.platformSettings.update` :
```ts
      invoiceHeaderName: data.invoiceHeaderName,
      invoiceLegalOwner: data.invoiceLegalOwner,
      invoiceVatMention: data.invoiceVatMention,
      invoiceLegalFooter: data.invoiceLegalFooter,
```

- [ ] **Step 20.4 : Section Facturation dans le formulaire**

Dans `parametres/page.tsx` : ajouter `invoiceHeaderName`, `invoiceLegalOwner`, `invoiceVatMention`, `invoiceLegalFooter`, `invoiceLogoUrl` au `select` Prisma ET au objet `initial` passé à `<SettingsForm>` (mêmes conventions `?? ""` que les champs existants, `invoiceLogoUrl` passé tel quel nullable).

Dans `settings-form.tsx` :
1. Ajouter au type `SettingsFormInitial` :
```ts
  invoiceHeaderName: string;
  invoiceLegalOwner: string;
  invoiceVatMention: string;
  invoiceLegalFooter: string;
  invoiceLogoUrl: string | null;
```
2. Insérer une nouvelle section entre « Emails (signature & bandeau) » et « Modules et maintenance », en réutilisant les composants locaux `Section`, `Field`, `FieldTextarea` (mêmes props que les usages existants de la section Identité — name/label/defaultValue/error) :
```tsx
      {/* Section — Facturation */}
      <Section title="Facturation (factures PDF)">
        <Field
          name="invoiceHeaderName"
          label="Nom commercial en tête de facture"
          defaultValue={initial.invoiceHeaderName}
          placeholder="CN manucure by Clochette Nails (vide = nom du salon)"
          error={fieldErrors.invoiceHeaderName}
        />
        <Field
          name="invoiceLegalOwner"
          label="Exploitant·e / raison sociale (forme juridique libre)"
          defaultValue={initial.invoiceLegalOwner}
          placeholder="EI Gomes Chloé"
          error={fieldErrors.invoiceLegalOwner}
        />
        <Field
          name="invoiceVatMention"
          label="Mention TVA"
          defaultValue={initial.invoiceVatMention}
          error={fieldErrors.invoiceVatMention}
        />
        <FieldTextarea
          name="invoiceLegalFooter"
          label="Mentions légales bas de facture (immatriculation, assurance RC pro, médiateur…)"
          defaultValue={initial.invoiceLegalFooter}
          rows={3}
          error={fieldErrors.invoiceLegalFooter}
        />
        <InvoiceLogoField currentUrl={initial.invoiceLogoUrl} />
      </Section>
```
(Adapter les props exactes de `Field`/`FieldTextarea` à leur signature locale — lignes 432+ et 517+ du fichier. Si `placeholder` n'existe pas dans `Field`, l'ajouter en prop optionnelle.)

3. Créer le composant `InvoiceLogoField` dans `parametres/invoice-logo-field.tsx` en COPIANT la structure de `email-banner-field.tsx` (préview de l'image courante, input file, bouton supprimer) branché sur `uploadInvoiceLogo`/`removeInvoiceLogo`, et l'importer dans `settings-form.tsx`.

- [ ] **Step 20.5 : Gates + vérif manuelle + commit**

Run : `pnpm exec tsc --noEmit && pnpm lint` → 0 erreur. Vérif (dev Damien) : la section Facturation s'affiche pré-remplie (seed), modifier la mention TVA et sauvegarder fonctionne, upload d'un logo remplace l'aperçu.

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add src/lib/actions/invoice-logo.ts src/lib/invoice-logo-files.ts src/lib/actions/settings-admin.ts "src/app/admin/(protected)/parametres/"
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "feat(factures): section Facturation des paramètres + upload logo PNG"
```

---

### Task 21: Docs, gates finaux, recette

**Files:**
- Modify: `MANAGEMENT_API.md`, `TODO.md`

- [ ] **Step 21.1 : MANAGEMENT_API.md**

Dans la section qui liste les events outbound (chercher `grep -n "booking.confirmed" MANAGEMENT_API.md`), ajouter à la liste :

```md
- `invoice.issued` — facture ou avoir émis(e). Payload : `{ invoiceId, number, docType: "INVOICE"|"CREDIT_NOTE", sourceType: "BOOKING"|"GIFT_CARD"|"EBOOK", totalCents, customerEmail, issuedAt }`. Émis par `src/lib/invoice/create-invoice.ts` via le helper centralisé `src/lib/outbound-events.ts`.
- `invoice.cancelled` — réservé (aucune annulation en v1 ; les corrections passent par les avoirs).
```

Et noter que `lib/outbound-events.ts` existe désormais (la migration des emit dupliqués reste à faire).

- [ ] **Step 21.2 : TODO.md**

Ajouter dans la section des features livrées :

```md
- Factures PDF légales (toutes ventes : RDV honorés, cartes cadeau, ebooks) — ✅ numérotation séquentielle, avoirs, liste Finances → Factures, envoi email opt-in/auto, settings Facturation paramétrables (duplicable)
- Avis clientes — ✅ CRUD /admin/parametres/avis + landing en DB
```

Et dans les notes de déploiement : `private/uploads/invoices/ à inclure dans la stratégie de backup fichiers (avec les PDFs ebooks)`.

- [ ] **Step 21.3 : Gates finaux**

Run : `cd /Users/damiengcls/Documents/clochette-nails-v2 && pnpm lint && pnpm exec tsc --noEmit && pnpm test`
Attendu : lint 0, types 0, **26 tests verts** (14 existants + 12 factures).

- [ ] **Step 21.4 : Recette manuelle avec Damien (dev server)**

Parcours à valider ensemble :
1. `/admin/parametres/avis` : ajouter/éditer/réordonner/dépublier → landing reflète.
2. Marquer un RDV honoré (case décochée) → message « Facture FAC-2026-XXXX générée », bloc Facturation sur la fiche, PDF téléchargeable et **visuellement validé** (logo, EI Gomes Chloé, mention TVA, lignes, règlements).
3. Même flow case cochée → mail mock en console avec pièce jointe.
4. Vente GC salon avec facture + email ; carte offerte → pas de facture.
5. `/admin/finances/factures` : filtres, recherche par nom, avoir partiel sur une facture → AV-2026-0001, plafond respecté.
6. Paramètres → Facturation : éditer la mention TVA, re-générer une facture → nouvelle mention présente, anciennes factures inchangées.

- [ ] **Step 21.5 : Commit final**

```bash
git -C /Users/damiengcls/Documents/clochette-nails-v2 add MANAGEMENT_API.md TODO.md
git -C /Users/damiengcls/Documents/clochette-nails-v2 commit -m "docs: events invoice.* + TODO factures/avis livrés + note backup invoices"
```

Le merge sur main (`--no-ff`) et la suppression de branche se font après validation explicite de Damien, comme d'habitude.

---

## Notes d'exécution

- **Police PDF** : Helvetica intégrée en v1 (les fonts Google du DS sont des variable fonts, non supportées par react-pdf). L'itération typo se fera lors de la validation visuelle avec Damien si souhaitée.
- **Annulation de facture** : l'enum `CANCELLED` existe en schéma mais AUCUNE action ne l'utilise en v1 (YAGNI) — les corrections passent par les avoirs. L'event `invoice.cancelled` est documenté comme réservé.
- **Webhook + PlatformSettings absent** : `loadSellerSnapshot` jette → fail-soft → pas de facture. En prod le seed garantit le singleton.
- **Si un anchor d'insertion UI a bougé** (fichiers non relus intégralement : pages détail, gift-card-create-form) : retrouver le point d'insertion avec les greps indiqués, ne jamais dupliquer un bloc existant.

