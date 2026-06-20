# Édition admin d'un RDV (coordonnées + prestation) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'admin de modifier les coordonnées et la prestation/options d'un RDV `AWAITING_DEPOSIT` ou `CONFIRMED` depuis un seul dialog « Modifier » sur la fiche RDV.

**Architecture:** Une server action `updateBookingDetails` (réutilise le calcul prix/durée + la requête d'overlap de `createBookingAdmin`, gère `force`/`notifyClient`), un dialog client `EditBookingDialog` (calqué sur `RescheduleDialog`), branchés via `BookingActions` + un fetch des prestations/options PUBLISHED dans `page.tsx`. Le créneau (date+heure) reste géré par « Déplacer » ; le changement de prestation conserve `date`+`startTime` et recalcule `endTime`.

**Tech Stack:** Next.js 16 (Server Actions + RSC), React 19, Prisma 7 + Postgres, Zod, Vitest (DB de test via `e2e/db`), Tailwind v4.

**Spec de référence :** `docs/superpowers/specs/2026-06-19-edit-booking-admin-design.md`

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `src/lib/actions/booking-admin.ts` | Server actions admin bookings | **Modifier** — ajoute `updateBookingDetails` + types en fin de fichier |
| `test/booking-update.test.ts` | Tests DB de l'action | **Créer** |
| `src/app/admin/(protected)/bookings/[id]/page.tsx` | Fiche RDV (RSC) | **Modifier** — fetch services+options PUBLISHED → props |
| `src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx` | Dialog client d'édition | **Créer** |
| `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx` | Panneau d'actions admin | **Modifier** — props + bouton « Modifier » + rendu du dialog |

**Ordre d'exécution :** Task 1 (action + tests) → Task 2 (page fetch) → Task 3 (dialog) → Task 4 (BookingActions) → Task 5 (vérif globale). Chaque task se termine par un commit sur la branche `feat/edit-booking` (déjà checkout). **Ne pas pousser** — Damien valide en local avant déploiement.

---

## Task 1 : Server action `updateBookingDetails` + tests

**Files:**
- Test: `test/booking-update.test.ts` (créer)
- Modify: `src/lib/actions/booking-admin.ts` (ajouter en fin de fichier, après `resendBookingPaymentLink`)

- [ ] **Step 1 : Écrire le test (qui échoue)**

Créer `test/booking-update.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

// requireAdmin lit la session NextAuth → on la mocke. L'AuditLog a une FK
// Restrict vers User, donc l'admin renvoyé doit exister réellement en base
// (créé par makeAdmin + injecté dans le mock à chaque test).
vi.mock("@/lib/auth-guards", () => ({
  requireAdmin: vi.fn(),
  requireAdminUserId: vi.fn(),
}));
// revalidatePath n'a pas de store de génération statique hors requête Next.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAdmin } from "@/lib/auth-guards";
import { updateBookingDetails } from "@/lib/actions/booking-admin";

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  const admin = await db.user.create({
    data: { email: `admin-${rand}@test.local`, role: "ADMIN" },
  });
  vi.mocked(requireAdmin).mockResolvedValue({ id: admin.id, email: admin.email });
  return admin;
}

async function makeService(durationMinutes: number, priceCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Prestation",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes,
      priceCents,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
}

async function makeOption(addedDurationMinutes: number, addedPriceCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.serviceOption.create({
    data: {
      slug: `opt-${rand}`,
      title: "Option",
      addedDurationMinutes,
      addedPriceCents,
      applicableCategories: ["SOIN_MAINS"],
      status: "PUBLISHED",
    },
  });
}

async function makeBooking(opts: {
  serviceId: string;
  startTime: string;
  endTime: string;
  status?: "AWAITING_DEPOSIT" | "CONFIRMED" | "COMPLETED";
  totalDurationMinutes?: number;
  totalPriceCents?: number;
  optionIds?: string[];
}) {
  return db.booking.create({
    data: {
      date: new Date("2026-09-01"),
      startTime: opts.startTime,
      endTime: opts.endTime,
      serviceId: opts.serviceId,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: "jean@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: opts.totalDurationMinutes ?? 30,
      totalPriceCents: opts.totalPriceCents ?? 2500,
      depositCents: 750,
      status: opts.status ?? "CONFIRMED",
      options: opts.optionIds
        ? { create: opts.optionIds.map((id) => ({ serviceOptionId: id })) }
        : undefined,
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("updateBookingDetails", () => {
  it("met à jour les coordonnées sans changer la prestation", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jeanne",
        lastName: "Durand",
        email: "jeanne@test.local",
        phone: "0611223344",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.clientFirstName).toBe("Jeanne");
    expect(updated.clientLastName).toBe("Durand");
    expect(updated.clientEmail).toBe("jeanne@test.local");
    expect(updated.totalDurationMinutes).toBe(30);
    expect(updated.endTime).toBe("10:30");
  });

  it("recalcule durée/prix/endTime au changement de prestation", async () => {
    await makeAdmin();
    const serviceA = await makeService(30, 2500);
    const serviceB = await makeService(60, 5000);
    const booking = await makeBooking({
      serviceId: serviceA.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: serviceB.id,
      optionIds: [],
    });

    expect(res.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.serviceId).toBe(serviceB.id);
    expect(updated.totalDurationMinutes).toBe(60);
    expect(updated.totalPriceCents).toBe(5000);
    expect(updated.endTime).toBe("11:00");
    // Pas de settings en base de test → fallback acompte 30 %.
    expect(updated.depositCents).toBe(1500);
  });

  it("remplace les options (delete + recreate)", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const opt1 = await makeOption(15, 1000);
    const opt2 = await makeOption(20, 2000);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:45",
      totalDurationMinutes: 45,
      totalPriceCents: 3500,
      optionIds: [opt1.id],
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: service.id,
      optionIds: [opt2.id],
    });

    expect(res.ok).toBe(true);
    const links = await db.bookingOption.findMany({ where: { bookingId: booking.id } });
    expect(links.map((l) => l.serviceOptionId)).toEqual([opt2.id]);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.totalDurationMinutes).toBe(50); // 30 + 20
    expect(updated.totalPriceCents).toBe(4500); // 2500 + 2000
  });

  it("refuse l'édition d'un RDV honoré (COMPLETED)", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
      status: "COMPLETED",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("STATUS_NOT_EDITABLE");
  });

  it("avertit en cas de chevauchement, applique si force=true", async () => {
    await makeAdmin();
    const short = await makeService(30, 2500);
    const long = await makeService(60, 5000);
    // B1 10:00-10:30, B2 10:30-11:00 (adjacents, pas de chevauchement)
    const b1 = await makeBooking({ serviceId: short.id, startTime: "10:00", endTime: "10:30" });
    await makeBooking({ serviceId: short.id, startTime: "10:30", endTime: "11:00" });

    // Passer B1 sur la prestation longue → 10:00-11:00 chevauche B2.
    const warned = await updateBookingDetails(b1.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: long.id,
      optionIds: [],
    });
    expect(warned.ok).toBe(false);
    if (!warned.ok) expect(warned.code).toBe("OVERLAP");

    const forced = await updateBookingDetails(b1.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "0600000000",
        message: null,
      },
      serviceId: long.id,
      optionIds: [],
      force: true,
    });
    expect(forced.ok).toBe(true);
    const updated = await db.booking.findUniqueOrThrow({ where: { id: b1.id } });
    expect(updated.totalDurationMinutes).toBe(60);
    expect(updated.endTime).toBe("11:00");
  });

  it("rejette un téléphone invalide via fieldErrors", async () => {
    await makeAdmin();
    const service = await makeService(30, 2500);
    const booking = await makeBooking({
      serviceId: service.id,
      startTime: "10:00",
      endTime: "10:30",
    });

    const res = await updateBookingDetails(booking.id, {
      client: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@test.local",
        phone: "12",
        message: null,
      },
      serviceId: service.id,
      optionIds: [],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION_ERROR");
      expect(res.fieldErrors?.["client.phone"]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm exec vitest run test/booking-update.test.ts`
(sandbox : ajouter `dangerouslyDisableSandbox: true` si l'accès DB est bloqué.)
Expected: FAIL — `updateBookingDetails` n'est pas exporté (`does not provide an export named 'updateBookingDetails'`).

- [ ] **Step 3 : Implémenter l'action**

Ajouter à la fin de `src/lib/actions/booking-admin.ts` :

```ts
// ─── Édition admin d'un RDV (coordonnées + prestation/options) ──────
// Modifie un booking AWAITING_DEPOSIT ou CONFIRMED : corrige les coordonnées
// et/ou change la prestation + options. Le créneau (date + startTime) est
// conservé ; endTime est recalculé selon la nouvelle durée. Le chevauchement
// renvoie le code "OVERLAP" tant que force !== true.

const updateBookingDetailsSchema = z.object({
  client: z.object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.string().trim().toLowerCase().email().max(150),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}$/, "Téléphone FR invalide"),
    message: z.string().trim().max(2000).optional().nullable(),
  }),
  serviceId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).default([]),
  force: z.boolean().optional(),
  notifyClient: z.boolean().optional(),
});

export type UpdateBookingDetailsInput = z.input<typeof updateBookingDetailsSchema>;

export type UpdateBookingDetailsResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
    };

export async function updateBookingDetails(
  bookingId: string,
  input: UpdateBookingDetailsInput,
): Promise<UpdateBookingDetailsResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = updateBookingDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Vérifiez les champs marqués.",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }
  const data = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      date: true,
      startTime: true,
      clientActionToken: true,
      paymentMethod: true,
    },
  });
  if (!booking) return { ok: false, error: "Réservation introuvable." };
  if (booking.status !== "AWAITING_DEPOSIT" && booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Modification impossible : seules les réservations en attente d'acompte ou confirmées sont éditables (statut actuel : ${booking.status}).`,
      code: "STATUS_NOT_EDITABLE",
    };
  }

  const [service, options, settings] = await Promise.all([
    prisma.service.findFirst({
      where: { id: data.serviceId, status: "PUBLISHED" },
      select: { id: true, title: true, durationMinutes: true, priceCents: true },
    }),
    data.optionIds.length > 0
      ? prisma.serviceOption.findMany({
          where: { id: { in: data.optionIds }, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            addedDurationMinutes: true,
            addedPriceCents: true,
          },
        })
      : Promise.resolve(
          [] as {
            id: string;
            title: string;
            addedDurationMinutes: number;
            addedPriceCents: number;
          }[],
        ),
    prisma.platformSettings.findFirst(),
  ]);

  if (!service) {
    return {
      ok: false,
      error: "Prestation introuvable ou non publiée.",
      code: "SERVICE_NOT_FOUND",
    };
  }
  if (options.length !== data.optionIds.length) {
    return {
      ok: false,
      error: "Une ou plusieurs options sont introuvables ou non publiées.",
      code: "OPTION_NOT_FOUND",
    };
  }

  const totalDurationMinutes =
    service.durationMinutes +
    options.reduce((sum, o) => sum + o.addedDurationMinutes, 0);
  const totalPriceCents =
    service.priceCents + options.reduce((sum, o) => sum + o.addedPriceCents, 0);
  const depositCents = computeDepositCents(totalPriceCents, settings);
  const endTime = addMinutesToTime(booking.startTime, totalDurationMinutes);

  // Overlap : exclut le booking lui-même. Bornes strictes → les créneaux qui se
  // touchent (endTime === startTime voisin) ne comptent pas comme chevauchement.
  const conflict = await prisma.booking.findFirst({
    where: {
      date: booking.date,
      id: { not: bookingId },
      status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: booking.startTime } }],
    },
    select: {
      startTime: true,
      endTime: true,
      clientFirstName: true,
      clientLastName: true,
    },
  });
  if (conflict && !data.force) {
    return {
      ok: false,
      code: "OVERLAP",
      error: `La nouvelle durée chevauche le RDV de ${conflict.clientFirstName} ${conflict.clientLastName} (${conflict.startTime}–${conflict.endTime}). Appliquer quand même ?`,
    };
  }

  await prisma.$transaction([
    prisma.bookingOption.deleteMany({ where: { bookingId } }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        clientFirstName: data.client.firstName,
        clientLastName: data.client.lastName,
        clientEmail: data.client.email,
        clientPhone: data.client.phone,
        clientMessage: data.client.message?.trim() || null,
        serviceId: service.id,
        totalDurationMinutes,
        totalPriceCents,
        depositCents,
        endTime,
        options: {
          create: data.optionIds.map((id) => ({ serviceOptionId: id })),
        },
      },
    }),
  ]);

  await audit(admin.id, bookingId, "booking.updated", {
    serviceId: service.id,
    optionIds: data.optionIds,
    totalPriceCents,
    depositCents,
    endTime,
    forced: Boolean(conflict && data.force),
  });

  if (data.notifyClient) {
    const mail = buildBookingConfirmationEmail({
      clientFirstName: data.client.firstName,
      clientEmail: data.client.email,
      serviceTitle: service.title,
      optionsTitles: options.map((o) => o.title),
      date: booking.date,
      startTime: booking.startTime,
      endTime,
      totalDurationMinutes,
      depositCents,
      giftCardAmountCents: 0,
      clientActionToken: booking.clientActionToken ?? undefined,
      paymentMethod: booking.paymentMethod ?? undefined,
    });
    const sent = await sendEmail({
      to: data.client.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.updated",
    });
    if (!sent.ok) {
      console.error("[updateBookingDetails] email cliente échoué:", sent.error);
    }
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message:
      conflict && data.force
        ? "Réservation modifiée (chevauchement forcé)."
        : "Réservation modifiée.",
  };
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm exec vitest run test/booking-update.test.ts`
Expected: PASS — 6 tests verts.
(Si la base de test n'est pas prête, suivre la recette E2E/Vitest habituelle — base `clochette_test` + `pnpm db:push` dessus. Cf. mémoire `project_e2e_suite_delivered`.)

- [ ] **Step 5 : Lint + commit**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm lint`
Expected: pas d'erreur sur les fichiers touchés.

```bash
cd /Users/damiengcls/dev/clochette-nails-v2
git add src/lib/actions/booking-admin.ts test/booking-update.test.ts
git commit -m "feat(bookings): updateBookingDetails action + tests"
```

---

## Task 2 : Fetch des prestations/options PUBLISHED dans la fiche RDV

**Files:**
- Modify: `src/app/admin/(protected)/bookings/[id]/page.tsx`

Cette task ne porte pas de test unitaire (data wiring RSC) — vérifiée par `tsc` + le rendu de la page (Task 5 + validation locale).

- [ ] **Step 1 : Ajouter le fetch des options éditables**

Dans `page.tsx`, repérer le guard d'absence de booking (`if (!booking) notFound();` ou équivalent, juste après le `findUnique`). **Après ce guard** (donc `booking` non-null), ajouter :

```ts
  // Catalogue éditable (changement de prestation depuis le dialog Modifier).
  // Chargé seulement pour les statuts éditables — sinon listes vides.
  const isEditable =
    booking.status === "AWAITING_DEPOSIT" || booking.status === "CONFIRMED";
  const [editableServices, editableOptions] = isEditable
    ? await Promise.all([
        prisma.service.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            title: true,
            category: true,
            durationMinutes: true,
            priceCents: true,
          },
        }),
        prisma.serviceOption.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            title: true,
            applicableCategories: true,
            addedDurationMinutes: true,
            addedPriceCents: true,
          },
        }),
      ])
    : [[], []];
```

- [ ] **Step 2 : Passer les nouvelles props à `<BookingActions>`**

Dans le JSX, compléter l'appel `<BookingActions ... />` (vers la ligne 524) avec, en plus des props existantes :

```tsx
              editableServices={editableServices}
              editableOptions={editableOptions}
              currentServiceId={booking.serviceId}
              currentOptionIds={booking.options.map((o) => o.serviceOptionId)}
              clientFirstName={booking.clientFirstName}
              clientLastName={booking.clientLastName}
              clientEmail={booking.clientEmail}
              clientPhone={booking.clientPhone}
              clientMessage={booking.clientMessage ?? ""}
```

- [ ] **Step 3 : Vérifier le typage**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm exec tsc --noEmit`
Expected: erreurs UNIQUEMENT sur `BookingActions` (props inconnues) — normal, résolu en Task 4. Aucune erreur dans `page.tsx` lui-même (le fetch + les `.map` doivent typer correctement).

- [ ] **Step 4 : Commit**

```bash
cd /Users/damiengcls/dev/clochette-nails-v2
git add "src/app/admin/(protected)/bookings/[id]/page.tsx"
git commit -m "feat(bookings): fetch services/options éditables sur la fiche RDV"
```

---

## Task 3 : Composant `EditBookingDialog`

**Files:**
- Create: `src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx`

- [ ] **Step 1 : Créer le dialog**

Créer `src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx` :

```tsx
"use client";

/**
 * Modale d'édition admin d'un RDV (statuts AWAITING_DEPOSIT / CONFIRMED).
 *
 * Permet de corriger les coordonnées et de changer la prestation + options.
 * Le créneau (date/heure) n'est pas modifiable ici (→ « Déplacer »). La durée
 * et le montant estimé sont recalculés en live. Soumission → updateBookingDetails ;
 * si le serveur renvoie le code "OVERLAP", on affiche un avertissement + un bouton
 * « Appliquer quand même » (rappel avec force=true).
 */

import { useMemo, useState, useTransition } from "react";
import {
  updateBookingDetails,
  type UpdateBookingDetailsResult,
} from "@/lib/actions/booking-admin";
import { formatCents, formatDuration } from "@/lib/booking-display";

export type EditableService = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
};

export type EditableOption = {
  id: string;
  title: string;
  applicableCategories: string[];
  addedDurationMinutes: number;
  addedPriceCents: number;
};

type Props = {
  bookingId: string;
  current: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    message: string;
    serviceId: string;
    optionIds: string[];
  };
  services: EditableService[];
  options: EditableOption[];
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

export function EditBookingDialog({
  bookingId,
  current,
  services,
  options,
  onCancel,
  onSuccess,
}: Props) {
  const [firstName, setFirstName] = useState(current.firstName);
  const [lastName, setLastName] = useState(current.lastName);
  const [email, setEmail] = useState(current.email);
  const [phone, setPhone] = useState(current.phone);
  const [message, setMessage] = useState(current.message);
  const [serviceId, setServiceId] = useState(current.serviceId);
  const [optionIds, setOptionIds] = useState<string[]>(current.optionIds);
  const [notifyClient, setNotifyClient] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [overlap, setOverlap] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Options applicables à la catégorie de la prestation sélectionnée.
  const applicableOptions = useMemo(() => {
    if (!selectedService) return [];
    return options.filter((o) =>
      o.applicableCategories.includes(selectedService.category),
    );
  }, [options, selectedService]);

  const selectedOptions = useMemo(
    () => options.filter((o) => optionIds.includes(o.id)),
    [options, optionIds],
  );

  const totalDuration =
    (selectedService?.durationMinutes ?? 0) +
    selectedOptions.reduce((s, o) => s + o.addedDurationMinutes, 0);
  const totalPriceCents =
    (selectedService?.priceCents ?? 0) +
    selectedOptions.reduce((s, o) => s + o.addedPriceCents, 0);

  function handleServiceChange(id: string) {
    setServiceId(id);
    // Purge les options qui ne s'appliquent plus à la nouvelle catégorie.
    const next = services.find((s) => s.id === id);
    if (next) {
      setOptionIds((prev) =>
        prev.filter((oid) => {
          const opt = options.find((o) => o.id === oid);
          return opt?.applicableCategories.includes(next.category);
        }),
      );
    }
  }

  function toggleOption(id: string) {
    setOptionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(force: boolean) {
    setError(null);
    setFieldErrors({});
    if (!force) setOverlap(null);
    startTransition(async () => {
      const res: UpdateBookingDetailsResult = await updateBookingDetails(bookingId, {
        client: {
          firstName,
          lastName,
          email,
          phone,
          message: message.trim() || null,
        },
        serviceId,
        optionIds,
        force,
        notifyClient,
      });
      if (res.ok) {
        onSuccess(res.message);
        return;
      }
      if (res.code === "OVERLAP") {
        setOverlap(res.error);
        return;
      }
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      setError(res.error);
    });
  }

  const canSubmit =
    !isPending &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    serviceId.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modifier la réservation"
      className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-full grid place-items-center px-4 py-6">
        <div
          className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] max-w-lg w-full p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <h3 className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
              Modifier la réservation
            </h3>
            <p
              className="text-xs text-[var(--color-ink-500)] mt-1"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Corrige les coordonnées et la prestation. Le créneau (date/heure)
              se change via « Déplacer ».
            </p>
          </div>

          {/* Coordonnées */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              required
              value={firstName}
              onChange={setFirstName}
              error={fieldErrors["client.firstName"]}
              disabled={isPending}
            />
            <Field
              label="Nom"
              required
              value={lastName}
              onChange={setLastName}
              error={fieldErrors["client.lastName"]}
              disabled={isPending}
            />
            <Field
              label="Email"
              type="email"
              required
              value={email}
              onChange={setEmail}
              error={fieldErrors["client.email"]}
              disabled={isPending}
            />
            <Field
              label="Téléphone"
              type="tel"
              required
              value={phone}
              onChange={setPhone}
              error={fieldErrors["client.phone"]}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-message"
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Message{" "}
              <span className="text-[var(--color-ink-500)] normal-case tracking-normal">
                (optionnel)
              </span>
            </label>
            <textarea
              id="edit-message"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isPending}
              className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y"
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>

          {/* Prestation */}
          <div className="space-y-1.5">
            <label
              htmlFor="edit-service"
              className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prestation <span className="text-[var(--color-danger)]">*</span>
            </label>
            <select
              id="edit-service"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              disabled={isPending}
              className="w-full px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} — {formatCents(s.priceCents)} · {formatDuration(s.durationMinutes)}
                </option>
              ))}
            </select>
          </div>

          {/* Options applicables */}
          {applicableOptions.length > 0 && (
            <div className="space-y-2">
              <p
                className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Options
              </p>
              <div className="space-y-1.5">
                {applicableOptions.map((o) => {
                  const checked = optionIds.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] cursor-pointer hover:bg-[var(--color-bone)] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOption(o.id)}
                          disabled={isPending}
                          className="accent-[var(--color-violet-600)]"
                        />
                        <span
                          className="text-sm"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {o.title}
                        </span>
                      </span>
                      <span
                        className="text-xs text-[var(--color-ink-500)] shrink-0"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        +{o.addedDurationMinutes} min · +{formatCents(o.addedPriceCents)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Récap recalculé */}
          <div
            className="flex justify-between items-baseline p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] border border-[var(--color-violet-100)] text-sm"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <span className="text-[var(--color-ink-700)]">
              {formatDuration(totalDuration)}
            </span>
            <span
              className="text-[var(--color-violet-700)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {totalPriceCents > 0 ? formatCents(totalPriceCents) : "Sur devis"}
            </span>
          </div>

          {/* Informer la cliente */}
          <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 accent-[var(--color-violet-600)]"
            />
            <span
              className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Informer la cliente par email (récap à jour)
            </span>
          </label>

          {overlap && (
            <div
              role="alert"
              className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30 space-y-2"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              <p>⚠ {overlap}</p>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-warning)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Appliquer quand même
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] disabled:opacity-50 transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  const id = `edit-field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
        style={{ fontFamily: "var(--font-ui)" }}
      />
      {error && (
        <p className="text-[11px] text-[var(--color-danger)]" style={{ fontFamily: "var(--font-ui)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier le typage du composant**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm exec tsc --noEmit`
Expected: aucune erreur dans `edit-booking-dialog.tsx` (les seules erreurs restantes sont dans `booking-actions.tsx`/`page.tsx` tant que Task 4 n'est pas faite).

- [ ] **Step 3 : Commit**

```bash
cd /Users/damiengcls/dev/clochette-nails-v2
git add "src/app/admin/(protected)/bookings/[id]/edit-booking-dialog.tsx"
git commit -m "feat(bookings): EditBookingDialog (coordonnées + prestation)"
```

---

## Task 4 : Bouton « Modifier » + rendu du dialog dans `BookingActions`

**Files:**
- Modify: `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx`

- [ ] **Step 1 : Importer le dialog et ses types**

Sous l'import existant `import { RescheduleDialog } from "./reschedule-dialog";` (ligne 23), ajouter :

```ts
import {
  EditBookingDialog,
  type EditableService,
  type EditableOption,
} from "./edit-booking-dialog";
```

- [ ] **Step 2 : Étendre les props de `BookingActions`**

Dans le type `Props` (ligne 25-41), ajouter ces champs :

```ts
  /** Coordonnées + prestation actuelles (préremplissage du dialog Modifier). */
  editableServices: EditableService[];
  editableOptions: EditableOption[];
  currentServiceId: string;
  currentOptionIds: string[];
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  clientMessage: string;
```

Et les déstructurer dans la signature du composant (après `revenueCents,`) :

```ts
  editableServices,
  editableOptions,
  currentServiceId,
  currentOptionIds,
  clientFirstName,
  clientLastName,
  clientEmail,
  clientPhone,
  clientMessage,
```

- [ ] **Step 3 : Ajouter l'état d'ouverture du dialog**

Sous `const [showReschedule, setShowReschedule] = useState(false);` (ligne 65), ajouter :

```ts
  const [showEdit, setShowEdit] = useState(false);
```

- [ ] **Step 4 : Ajouter le bouton « Modifier » dans les deux blocs de statut**

Dans le bloc `status === "AWAITING_DEPOSIT"`, juste après le bouton « Renvoyer le lien de paiement » (avant « Annuler la réservation »), insérer :

```tsx
          <ActionButton
            label="Modifier la réservation"
            description="Corriger les coordonnées ou la prestation"
            variant="secondary"
            disabled={isPending}
            onClick={() => setShowEdit(true)}
          />
```

Dans le bloc `status === "CONFIRMED"`, juste après le bouton « Déplacer le RDV », insérer le **même** bloc `ActionButton` (label « Modifier la réservation », description « Corriger les coordonnées ou la prestation », variant `secondary`, `onClick={() => setShowEdit(true)}`).

- [ ] **Step 5 : Rendre le dialog**

Juste après le bloc `{/* Modale Déplacement */}` (le `{showReschedule && (...)}`, vers la ligne 257), ajouter :

```tsx
      {/* Modale Modification (coordonnées + prestation) */}
      {showEdit && (
        <EditBookingDialog
          bookingId={bookingId}
          current={{
            firstName: clientFirstName,
            lastName: clientLastName,
            email: clientEmail,
            phone: clientPhone,
            message: clientMessage,
            serviceId: currentServiceId,
            optionIds: currentOptionIds,
          }}
          services={editableServices}
          options={editableOptions}
          onCancel={() => setShowEdit(false)}
          onSuccess={(message) => {
            setShowEdit(false);
            setFeedback({ kind: "success", text: message });
            router.refresh();
          }}
        />
      )}
```

- [ ] **Step 6 : Vérifier typage + lint**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm exec tsc --noEmit && pnpm lint`
Expected: 0 erreur (page.tsx ↔ BookingActions ↔ EditBookingDialog désormais cohérents de bout en bout).

- [ ] **Step 7 : Commit**

```bash
cd /Users/damiengcls/dev/clochette-nails-v2
git add "src/app/admin/(protected)/bookings/[id]/booking-actions.tsx"
git commit -m "feat(bookings): bouton Modifier + EditBookingDialog dans BookingActions"
```

---

## Task 5 : Vérification globale + handoff validation locale

**Files:** aucun (vérification).

- [ ] **Step 1 : Suite Vitest complète**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm test`
Expected: toute la suite verte, y compris les 6 nouveaux tests de `booking-update.test.ts`. Aucune régression.

- [ ] **Step 2 : Lint + typecheck final**

Run: `cd /Users/damiengcls/dev/clochette-nails-v2 && pnpm lint && pnpm exec tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3 : Handoff validation locale (PAS de push)**

Per workflow Damien (mémoire `feedback_local_validation_before_deploy`) : **ne pas pousser**. Annoncer que la feature est prête sur la branche `feat/edit-booking` et lister le scénario de test manuel à valider sur le dev server :

1. Fiche d'un RDV `AWAITING_DEPOSIT` → bouton « Modifier » présent → corriger une faute de frappe dans le nom → Enregistrer → la fiche reflète la correction.
2. Fiche d'un RDV `CONFIRMED` → « Modifier » → changer la prestation pour une plus longue qui chevauche un autre RDV du jour → bandeau d'avertissement orange + « Appliquer quand même » → forcer → durée/heure de fin mises à jour.
3. Cocher « Informer la cliente » → vérifier l'email reçu (récap à jour).
4. Fiche d'un RDV `COMPLETED` → pas de bouton « Modifier » (statut non éditable).

- [ ] **Step 4 : Clôture de branche**

Après validation locale par Damien, suivre la skill **superpowers:finishing-a-development-branch** (vérifier les tests, présenter les options de merge). Merge non-ff dans `main` + suppression de branche, conformément à la convention du repo.

---

## Self-review (effectuée)

- **Couverture spec :** statuts éditables (Task 1 guard + Task 2 fetch conditionnel + Task 4 boutons), champs éditables (schéma Zod Task 1), endTime recalculé (Task 1), overlap warn+force (Task 1 + dialog Task 3), email opt-in (Task 1 `notifyClient` + dialog checkbox), remplacement d'options (Task 1 transaction + test), un seul dialog (Task 3), audit `booking.updated` (Task 1), MAJ montant seulement pour pending (Task 1 met à jour `depositCents`, aucun lien Stripe régénéré). ✓
- **Placeholders :** aucun — tout le code est complet.
- **Cohérence des types :** `UpdateBookingDetailsResult` (avec `code`/`fieldErrors`) utilisé identiquement dans l'action et le dialog ; `EditableService`/`EditableOption` exportés par le dialog et réimportés par `BookingActions` ; props `BookingActions` alignées avec l'appel `page.tsx` (Task 2 ↔ Task 4). ✓
- **Hors-scope respecté :** pas de changement date/heure, pas de refund auto, pas de régénération de lien Stripe. ✓
