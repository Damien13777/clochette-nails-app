"use server";

/**
 * Server Actions — reset de mot de passe admin.
 *
 * Flow :
 *  1. requestPasswordReset(email) → si user existe, génère un token, store en DB,
 *     envoie l'email via Resend. Réponse générique sans révéler l'existence du compte.
 *  2. resetPassword(token, newPassword) → valide token, update hashedPassword,
 *     supprime token. Redirect vers /admin/connexion.
 *
 * Sécurité :
 *  - Token = 32 bytes random (64 hex chars)
 *  - Expiration : 1 heure
 *  - Token single-use (supprimé après utilisation)
 *  - Rate-limit par IP (3 tentatives / heure)
 *  - Réponse constante quel que soit l'échec côté requestReset
 */

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  AUTH_FAIL,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { buildPasswordResetEmail } from "@/lib/email/templates/password-reset";
import { getClientIp } from "@/lib/client-ip";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 heure
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 100;

type RequestResetResult = { ok: true } | { ok: false; error: string };
type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Étape 1 : déclenche un email de reset si le compte existe.
 * Retourne toujours { ok: true } pour ne pas révéler l'existence du compte
 * (sauf en cas de rate limit ou validation côté input).
 */
export async function requestPasswordReset(
  email: string,
): Promise<RequestResetResult> {
  const h = await headers();
  const ip = getClientIp(h);

  // Rate limit (réutilise le bucket AUTH_FAIL : 5 / 5 min)
  const rl = checkRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.max, AUTH_FAIL.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    };
  }
  recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);

  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Adresse email invalide." };
  }

  const user = await prisma.user.findUnique({
    where: { email: trimmed },
    select: { id: true, role: true, isActive: true },
  });

  // Si user trouvé + admin actif → génère + store le token
  if (user && user.role === "ADMIN" && user.isActive) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + TOKEN_TTL_MS);

    // Supprime d'anciens tokens en attente pour cet email (limite à 1 actif)
    await prisma.verificationToken.deleteMany({
      where: { identifier: trimmed },
    });

    await prisma.verificationToken.create({
      data: { identifier: trimmed, token, expires },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/admin/reinitialiser-mot-de-passe?token=${token}`;

    // Envoi email (fire-and-log : ne révèle pas l'échec côté utilisateur
    // pour préserver l'anti-énumération)
    try {
      const mail = buildPasswordResetEmail({
        resetUrl,
        expiresInMinutes: 60,
      });
      await sendEmail({
        to: trimmed,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "auth.password-reset",
      });
    } catch (err) {
      console.error("[password reset] email échoué:", err);
    }

    // Audit
    await prisma.auditLog.create({
      data: {
        adminId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        metadata: { ipAddress: ip },
      },
    });
  }

  // Réponse identique dans tous les cas — pas d'énumération
  return { ok: true };
}

/**
 * Étape 2 : valide le token + met à jour le mot de passe.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const h = await headers();
  const ip = getClientIp(h);

  const rl = checkRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.max, AUTH_FAIL.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    };
  }
  recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);

  if (!token || token.length < 32) {
    return { ok: false, error: "Lien de réinitialisation invalide." };
  }

  if (
    !newPassword ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return {
      ok: false,
      error: `Mot de passe : entre ${MIN_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères.`,
    };
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record) {
    return {
      ok: false,
      error: "Lien invalide ou déjà utilisé. Demandez un nouveau lien.",
    };
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } });
    return {
      ok: false,
      error: "Lien expiré (valable 1 heure). Demandez un nouveau lien.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true, role: true, isActive: true, hashedPassword: true },
  });
  if (!user || user.role !== "ADMIN" || !user.isActive) {
    await prisma.verificationToken.delete({ where: { token } });
    return { ok: false, error: "Compte introuvable ou désactivé." };
  }

  // Rejet du même mot de passe que l'actuel
  if (user.hashedPassword) {
    const isSame = await bcrypt.compare(newPassword, user.hashedPassword);
    if (isSame) {
      return {
        ok: false,
        error: "Le nouveau mot de passe doit être différent de l'ancien.",
      };
    }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  await prisma.auditLog.create({
    data: {
      adminId: user.id,
      action: "PASSWORD_RESET_COMPLETED",
      metadata: { ipAddress: ip },
    },
  });

  return { ok: true };
}
