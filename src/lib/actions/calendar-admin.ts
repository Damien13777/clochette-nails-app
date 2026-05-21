"use server";

/**
 * Server Actions calendrier admin.
 *
 * Session 1 :
 *  - upsertBusinessHours  : édition horaires hebdo d'un jour (open/close + breaks)
 *  - createUnavailability : création indispo one-off (vacances, RDV perso, etc.)
 *  - updateUnavailability : édition
 *  - deleteUnavailability : suppression
 *
 * Session 2 ajoutera :
 *  - CRUD RecurringUnavailability
 *  - toggleBookableMonth
 *
 * Toutes les actions :
 *  - Auth ADMIN required
 *  - Audit log dans AuditLog
 *  - revalidatePath("/admin/calendrier") + invalidation cache availability
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isoDateParis } from "@/lib/paris-day";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return { id: session.user.id };
}

const timeHHMM = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Format attendu HH:MM")
  .refine((v) => {
    const [h, m] = v.split(":").map(Number);
    return h >= 0 && h < 24 && m >= 0 && m < 60;
  }, "Heure invalide");

// ─────────────────────────────────────────────────────────
// BUSINESS HOURS — horaires hebdomadaires par jour
// ─────────────────────────────────────────────────────────

const businessHoursSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    isOpen: z.coerce.boolean(),
    openingTime: timeHHMM.optional().nullable(),
    closingTime: timeHHMM.optional().nullable(),
    breakStart: timeHHMM.optional().nullable(),
    breakEnd: timeHHMM.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.isOpen) {
      if (!data.openingTime || !data.closingTime) {
        ctx.addIssue({
          code: "custom",
          path: ["openingTime"],
          message: "Horaires d'ouverture obligatoires si le jour est ouvert.",
        });
        return;
      }
      if (data.openingTime >= data.closingTime) {
        ctx.addIssue({
          code: "custom",
          path: ["closingTime"],
          message: "L'heure de fermeture doit être après l'ouverture.",
        });
      }
      if (data.breakStart && data.breakEnd) {
        if (data.breakStart >= data.breakEnd) {
          ctx.addIssue({
            code: "custom",
            path: ["breakEnd"],
            message: "La fin de pause doit être après le début.",
          });
        }
        if (data.openingTime && data.breakStart < data.openingTime) {
          ctx.addIssue({
            code: "custom",
            path: ["breakStart"],
            message: "La pause doit être pendant les heures d'ouverture.",
          });
        }
        if (data.closingTime && data.breakEnd > data.closingTime) {
          ctx.addIssue({
            code: "custom",
            path: ["breakEnd"],
            message: "La pause doit être pendant les heures d'ouverture.",
          });
        }
      }
      if ((data.breakStart && !data.breakEnd) || (!data.breakStart && data.breakEnd)) {
        ctx.addIssue({
          code: "custom",
          path: ["breakStart"],
          message: "Renseignez début ET fin de pause, ou rien.",
        });
      }
    }
  });

export async function upsertBusinessHours(
  input: z.input<typeof businessHoursSchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = businessHoursSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }
  const data = parsed.data;

  await prisma.businessHours.upsert({
    where: { dayOfWeek: data.dayOfWeek },
    create: {
      dayOfWeek: data.dayOfWeek,
      isOpen: data.isOpen,
      openingTime: data.isOpen ? data.openingTime ?? null : null,
      closingTime: data.isOpen ? data.closingTime ?? null : null,
      breakStart: data.isOpen ? data.breakStart ?? null : null,
      breakEnd: data.isOpen ? data.breakEnd ?? null : null,
    },
    update: {
      isOpen: data.isOpen,
      openingTime: data.isOpen ? data.openingTime ?? null : null,
      closingTime: data.isOpen ? data.closingTime ?? null : null,
      breakStart: data.isOpen ? data.breakStart ?? null : null,
      breakEnd: data.isOpen ? data.breakEnd ?? null : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.business_hours_updated",
      metadata: data as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return { ok: true, message: "Horaires mis à jour." };
}

// ─────────────────────────────────────────────────────────
// UNAVAILABILITY — indispos one-off
// ─────────────────────────────────────────────────────────

const unavailabilitySchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine((d) => d.startsAt < d.endsAt, {
    path: ["endsAt"],
    message: "La fin doit être après le début.",
  });

export async function createUnavailability(
  input: z.input<typeof unavailabilitySchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = unavailabilitySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }

  const { startsAt, endsAt, reason } = parsed.data;

  // Pas d'indispo dans le passé.
  if (startsAt <= new Date()) {
    return {
      ok: false,
      error: "Impossible de créer une indispo dans le passé.",
      fieldErrors: { startsAt: "Doit être dans le futur" },
    };
  }

  // Avertissement (sans bloquer) si des bookings existent dans la plage.
  // L'admin verra le warning dans la modale UI, ici on stocke quand même.
  // Plage en jours Paris (pas UTC) : un startsAt 00:30 Paris (22:30 UTC veille)
  // doit matcher les bookings du même jour Paris, pas du jour UTC précédent.
  const conflicting = await prisma.booking.count({
    where: {
      status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
      date: {
        gte: new Date(`${isoDateParis(startsAt)}T00:00:00.000Z`),
        lte: new Date(`${isoDateParis(endsAt)}T00:00:00.000Z`),
      },
    },
  });

  const created = await prisma.unavailability.create({
    data: { startsAt, endsAt, reason },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.unavailability_created",
      metadata: { id: created.id, startsAt, endsAt, reason, conflicting } as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return {
    ok: true,
    message:
      conflicting > 0
        ? `Indispo créée. ⚠ ${conflicting} RDV existant(s) dans la plage — pensez à les contacter.`
        : "Indispo créée.",
  };
}

export async function updateUnavailability(
  id: string,
  input: z.input<typeof unavailabilitySchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = unavailabilitySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }

  const existing = await prisma.unavailability.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Indispo introuvable" };

  await prisma.unavailability.update({
    where: { id },
    data: {
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      reason: parsed.data.reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.unavailability_updated",
      metadata: { id, ...parsed.data } as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return { ok: true, message: "Indispo mise à jour." };
}

// ─────────────────────────────────────────────────────────
// DAY EXCEPTION — horaires exceptionnels d'une date précise
// (override des BusinessHours récurrents pour ce jour)
// ─────────────────────────────────────────────────────────

const dayExceptionSchema = z
  .object({
    /** Date ISO "YYYY-MM-DD" */
    dateIso: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format YYYY-MM-DD attendue"),
    isOpen: z.coerce.boolean(),
    openingTime: timeHHMM.optional().nullable(),
    closingTime: timeHHMM.optional().nullable(),
    breakStart: timeHHMM.optional().nullable(),
    breakEnd: timeHHMM.optional().nullable(),
    reason: z.string().trim().max(200).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.isOpen) {
      if (!data.openingTime || !data.closingTime) {
        ctx.addIssue({
          code: "custom",
          path: ["openingTime"],
          message: "Horaires d'ouverture obligatoires si le jour est ouvert.",
        });
        return;
      }
      if (data.openingTime >= data.closingTime) {
        ctx.addIssue({
          code: "custom",
          path: ["closingTime"],
          message: "L'heure de fermeture doit être après l'ouverture.",
        });
      }
      if (data.breakStart && data.breakEnd) {
        if (data.breakStart >= data.breakEnd) {
          ctx.addIssue({
            code: "custom",
            path: ["breakEnd"],
            message: "La fin de pause doit être après le début.",
          });
        }
        if (data.openingTime && data.breakStart < data.openingTime) {
          ctx.addIssue({
            code: "custom",
            path: ["breakStart"],
            message: "La pause doit être pendant les heures d'ouverture.",
          });
        }
        if (data.closingTime && data.breakEnd > data.closingTime) {
          ctx.addIssue({
            code: "custom",
            path: ["breakEnd"],
            message: "La pause doit être pendant les heures d'ouverture.",
          });
        }
      }
      if ((data.breakStart && !data.breakEnd) || (!data.breakStart && data.breakEnd)) {
        ctx.addIssue({
          code: "custom",
          path: ["breakStart"],
          message: "Renseignez début ET fin de pause, ou rien.",
        });
      }
    }
  });

export async function upsertDayException(
  input: z.input<typeof dayExceptionSchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = dayExceptionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }
  const data = parsed.data;
  const dateObj = new Date(data.dateIso + "T00:00:00.000Z");

  // Compte les bookings dans la plage si on ferme exceptionnellement (warning seul)
  let conflicting = 0;
  if (!data.isOpen) {
    conflicting = await prisma.booking.count({
      where: {
        date: dateObj,
        status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
      },
    });
  }

  await prisma.dayException.upsert({
    where: { date: dateObj },
    create: {
      date: dateObj,
      isOpen: data.isOpen,
      openingTime: data.isOpen ? data.openingTime ?? null : null,
      closingTime: data.isOpen ? data.closingTime ?? null : null,
      breakStart: data.isOpen ? data.breakStart ?? null : null,
      breakEnd: data.isOpen ? data.breakEnd ?? null : null,
      reason: data.reason?.trim() || null,
    },
    update: {
      isOpen: data.isOpen,
      openingTime: data.isOpen ? data.openingTime ?? null : null,
      closingTime: data.isOpen ? data.closingTime ?? null : null,
      breakStart: data.isOpen ? data.breakStart ?? null : null,
      breakEnd: data.isOpen ? data.breakEnd ?? null : null,
      reason: data.reason?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.day_exception_upserted",
      metadata: { ...data, conflictingBookings: conflicting } as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return {
    ok: true,
    message:
      conflicting > 0
        ? `Exception enregistrée. ⚠ ${conflicting} RDV existant(s) ce jour — pensez à les contacter.`
        : data.isOpen
          ? "Exception enregistrée — salon ouvert exceptionnellement ce jour."
          : "Exception enregistrée — salon fermé exceptionnellement ce jour.",
  };
}

export async function deleteDayException(dateIso: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { ok: false, error: "Date invalide." };
  }
  const dateObj = new Date(dateIso + "T00:00:00.000Z");

  const existing = await prisma.dayException.findUnique({
    where: { date: dateObj },
    select: { id: true, isOpen: true, openingTime: true, closingTime: true, reason: true },
  });
  if (!existing) {
    return { ok: false, error: "Aucune exception pour cette date." };
  }

  await prisma.dayException.delete({ where: { date: dateObj } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.day_exception_deleted",
      metadata: { dateIso, ...existing } as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return {
    ok: true,
    message: "Exception supprimée — retour aux horaires récurrents.",
  };
}

// ─────────────────────────────────────────────────────────

export async function deleteUnavailability(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.unavailability.findUnique({
    where: { id },
    select: { id: true, startsAt: true, endsAt: true, reason: true },
  });
  if (!existing) return { ok: false, error: "Indispo introuvable" };

  await prisma.unavailability.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.unavailability_deleted",
      metadata: existing as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return { ok: true, message: "Indispo supprimée." };
}

// ─────────────────────────────────────────────────────────
// RECURRING UNAVAILABILITY — indispo récurrente par jour de semaine
// ─────────────────────────────────────────────────────────

const recurringUnavailabilitySchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: timeHHMM,
    endTime: timeHHMM,
    startsFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide (YYYY-MM-DD)"),
    endsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide (YYYY-MM-DD)")
      .optional()
      .nullable(),
    reason: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .superRefine((data, ctx) => {
    if (data.startTime >= data.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "L'heure de fin doit être après l'heure de début.",
      });
    }
    if (data.endsAt && data.endsAt < data.startsFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La date de fin doit être après la date de début.",
      });
    }
  });

export async function createRecurringUnavailability(
  input: z.input<typeof recurringUnavailabilitySchema>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = recurringUnavailabilitySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }
  const data = parsed.data;

  const created = await prisma.recurringUnavailability.create({
    data: {
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      startsFrom: new Date(data.startsFrom + "T00:00:00.000Z"),
      endsAt: data.endsAt
        ? new Date(data.endsAt + "T00:00:00.000Z")
        : null,
      reason: data.reason,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.recurring_unavailability_created",
      metadata: { id: created.id, ...data } as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return { ok: true, message: "Indispo récurrente créée." };
}

export async function deleteRecurringUnavailability(
  id: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const existing = await prisma.recurringUnavailability.findUnique({
    where: { id },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      reason: true,
    },
  });
  if (!existing) return { ok: false, error: "Indispo récurrente introuvable." };

  await prisma.recurringUnavailability.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.recurring_unavailability_deleted",
      metadata: existing as object,
    },
  });

  revalidatePath("/admin/calendrier");
  return { ok: true, message: "Indispo récurrente supprimée." };
}

// ─────────────────────────────────────────────────────────
// BOOKABLE MONTH — toggle l'ouverture publique de la résa par mois
// ─────────────────────────────────────────────────────────

const bookableMonthSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function toggleBookableMonth(
  input: z.input<typeof bookableMonthSchema>,
): Promise<ActionResult & { isOpen?: boolean }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = bookableMonthSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Année ou mois invalide." };
  }
  const { year, month } = parsed.data;

  const existing = await prisma.bookableMonth.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });

  if (existing) {
    await prisma.bookableMonth.delete({
      where: { year_month: { year, month } },
    });
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "calendar.bookable_month_closed",
        metadata: { year, month } as object,
      },
    });
    revalidatePath("/admin/calendrier");
    revalidatePath("/reservation");
    return {
      ok: true,
      isOpen: false,
      message: `Mois ${month}/${year} fermé à la résa publique.`,
    };
  }

  await prisma.bookableMonth.create({
    data: { year, month, enabledById: admin.id },
  });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "calendar.bookable_month_opened",
      metadata: { year, month } as object,
    },
  });
  revalidatePath("/admin/calendrier");
  revalidatePath("/reservation");
  return {
    ok: true,
    isOpen: true,
    message: `Mois ${month}/${year} ouvert à la résa publique.`,
  };
}
