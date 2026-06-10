"use server";

/**
 * Server Action — mise à jour des paramètres globaux (PlatformSettings).
 *
 * Singleton : il n'existe qu'UN seul record en DB (créé au seed).
 * On utilise findFirstOrThrow + update(where: id) pour éviter de créer un doublon.
 *
 * Audit log : chaque modification est tracée pour la vue Logs admin.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const settingsSchema = z
  .object({
    // Identité
    businessName: z.string().trim().min(2, "Nom du salon trop court").max(100),
    businessSiret: z
      .string()
      .trim()
      .regex(/^\d{14}$/, "SIRET = 14 chiffres exactement")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    businessAddress: z
      .string()
      .trim()
      .max(500)
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    contactEmail: z.string().trim().toLowerCase().email("Email invalide").max(150),
    contactPhone: z
      .string()
      .trim()
      .regex(/^(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}$/, "Téléphone FR invalide")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),

    // Réservations
    depositMode: z.enum(["PERCENT", "FIXED"]),
    depositPercent: z.coerce
      .number()
      .int("Doit être un nombre entier")
      .min(1, "Minimum 1 %")
      .max(100, "Maximum 100 %"),
    depositFixedCents: z.coerce
      .number()
      .int()
      .min(500, "Minimum 5 €")
      .max(100000, "Maximum 1000 €"),
    bookingMinAdvanceHours: z.coerce
      .number()
      .int()
      .min(0, "Doit être positif ou nul")
      .max(168, "Maximum 7 jours (168 h)"),
    bookingGranularityMinutes: z.coerce
      .number()
      .int()
      .refine((v) => v === 15 || v === 30 || v === 60, "15, 30 ou 60 min uniquement"),
    bookingCancellationPolicy: z
      .string()
      .trim()
      .max(2000)
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),

    // Emails transactionnels
    emailSignature: z.string().trim().min(2, "Signature requise (2 chars min)").max(200),
    emailFooterNote: z
      .string()
      .trim()
      .max(500)
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),

    // Facturation
    invoiceHeaderName: z
      .string()
      .trim()
      .max(120, "Nom trop long (120 caractères max)")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    invoiceLegalOwner: z
      .string()
      .trim()
      .max(200, "Texte trop long (200 caractères max)")
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
      .max(2000, "Texte trop long (2000 caractères max)")
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),

    // Modules + maintenance
    bookingsEnabled: z.coerce.boolean(),
    ebooksEnabled: z.coerce.boolean(),
    blogEnabled: z.coerce.boolean(),
    newsletterEnabled: z.coerce.boolean(),
    giftCardsEnabled: z.coerce.boolean(),
    maintenanceMode: z.coerce.boolean(),
    maintenanceMessage: z
      .string()
      .trim()
      .max(500)
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
  })
  .refine(
    (data) =>
      !data.maintenanceMode || (data.maintenanceMessage && data.maintenanceMessage.length > 0),
    {
      path: ["maintenanceMessage"],
      message: "Message obligatoire si le mode maintenance est activé.",
    },
  );

export type SettingsState =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

export async function updatePlatformSettings(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }
  const adminId = session.user.id;

  // Booléens checkbox absents si décochés — FormData les omet
  const raw = {
    businessName: formData.get("businessName"),
    businessSiret: formData.get("businessSiret") ?? "",
    businessAddress: formData.get("businessAddress") ?? "",
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone") ?? "",

    depositMode: formData.get("depositMode"),
    depositPercent: formData.get("depositPercent"),
    depositFixedCents: formData.get("depositFixedCents"),
    bookingMinAdvanceHours: formData.get("bookingMinAdvanceHours"),
    bookingGranularityMinutes: formData.get("bookingGranularityMinutes"),
    bookingCancellationPolicy: formData.get("bookingCancellationPolicy") ?? "",

    invoiceHeaderName: formData.get("invoiceHeaderName") ?? "",
    invoiceLegalOwner: formData.get("invoiceLegalOwner") ?? "",
    invoiceVatMention: formData.get("invoiceVatMention"),
    invoiceLegalFooter: formData.get("invoiceLegalFooter") ?? "",

    bookingsEnabled: formData.get("bookingsEnabled") === "on",
    ebooksEnabled: formData.get("ebooksEnabled") === "on",
    blogEnabled: formData.get("blogEnabled") === "on",
    newsletterEnabled: formData.get("newsletterEnabled") === "on",
    giftCardsEnabled: formData.get("giftCardsEnabled") === "on",
    maintenanceMode: formData.get("maintenanceMode") === "on",
    maintenanceMessage: formData.get("maintenanceMessage") ?? "",
    emailSignature: formData.get("emailSignature"),
    emailFooterNote: formData.get("emailFooterNote") ?? "",
  };

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Vérifiez les champs marqués.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  const current = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true },
  });

  await prisma.platformSettings.update({
    where: { id: current.id },
    data: {
      businessName: data.businessName,
      businessSiret: data.businessSiret,
      businessAddress: data.businessAddress,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      depositMode: data.depositMode,
      depositPercent: data.depositPercent,
      depositFixedCents: data.depositFixedCents,
      bookingMinAdvanceHours: data.bookingMinAdvanceHours,
      bookingGranularityMinutes: data.bookingGranularityMinutes,
      bookingCancellationPolicy: data.bookingCancellationPolicy,
      invoiceHeaderName: data.invoiceHeaderName,
      invoiceLegalOwner: data.invoiceLegalOwner,
      invoiceVatMention: data.invoiceVatMention,
      invoiceLegalFooter: data.invoiceLegalFooter,
      bookingsEnabled: data.bookingsEnabled,
      ebooksEnabled: data.ebooksEnabled,
      blogEnabled: data.blogEnabled,
      newsletterEnabled: data.newsletterEnabled,
      giftCardsEnabled: data.giftCardsEnabled,
      maintenanceMode: data.maintenanceMode,
      maintenanceMessage: data.maintenanceMessage,
      emailSignature: data.emailSignature,
      emailFooterNote: data.emailFooterNote,
      updatedById: adminId,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId,
      action: "platform.settings_updated",
      metadata: {
        businessName: data.businessName,
        depositMode: data.depositMode,
        depositPercent: data.depositPercent,
        depositFixedCents: data.depositFixedCents,
        modules: {
          bookings: data.bookingsEnabled,
          ebooks: data.ebooksEnabled,
          blog: data.blogEnabled,
          newsletter: data.newsletterEnabled,
          giftCards: data.giftCardsEnabled,
        },
        maintenanceMode: data.maintenanceMode,
      } as object,
    },
  });

  revalidatePath("/admin/parametres");
  revalidatePath("/", "layout"); // Site public peut dépendre des feature flags
  return { ok: true, message: "Paramètres enregistrés." };
}
