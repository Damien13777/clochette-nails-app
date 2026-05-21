/**
 * Schemas Zod pour la création de booking — Clochette Nails.
 */

import { z } from "zod";

export const clientSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(60),
  lastName: z.string().trim().min(1, "Nom requis").max(60),
  email: z.string().trim().toLowerCase().email("Email invalide").max(150),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/,
      "Numéro de téléphone français invalide",
    ),
  message: z.string().trim().max(500).optional().or(z.literal("")),
});

export const photoUrlSchema = z.object({
  url: z
    .string()
    .regex(
      /^\/uploads\/booking-files\/[0-9a-f-]{36}\.webp$/i,
      "URL photo invalide",
    ),
  originalName: z.string().trim().max(200),
  mimeType: z.string().trim().max(50),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
});

export const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  optionIds: z.array(z.string()).max(8).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format heure invalide"),
  client: clientSchema,
  giftCardCode: z.string().trim().optional().or(z.literal("")),
  /** Photos uploadées via /api/booking/upload (URLs validées). Max 5. */
  photoUrls: z.array(photoUrlSchema).max(5).default([]),
  consent: z.literal(true, {
    message: "Vous devez accepter les conditions",
  }),
  honeypot: z.string().max(0).optional(), // anti-bot
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ClientInfo = z.infer<typeof clientSchema>;
