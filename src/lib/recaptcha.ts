/**
 * Vérification serveur reCAPTCHA v3 (score-based).
 *
 * Politique :
 *  - Pas de RECAPTCHA_SECRET_KEY (dev/local) → skip (ok). honeypot + rate-limit
 *    restent la défense active.
 *  - Token manquant / invalide / action différente / score < seuil → fail-CLOSED
 *    (on rejette).
 *  - Endpoint Google injoignable / réponse non-JSON → fail-OPEN (on n'enferme
 *    pas une cliente légitime à cause d'une panne tierce ; honeypot + rate-limit
 *    couvrent).
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;

export type RecaptchaResult =
  | { ok: true; score?: number; skipped?: boolean }
  | { ok: false; reason: string };

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyRecaptcha(
  token: string | null | undefined,
  expectedAction: string,
  ip?: string,
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, reason: "missing-token" };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[recaptcha] siteverify HTTP ${res.status} → fail-open`);
      return { ok: true };
    }

    const data = (await res.json()) as SiteverifyResponse;

    if (!data.success) {
      return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
    }
    if (data.action && data.action !== expectedAction) {
      return { ok: false, reason: "action-mismatch" };
    }
    if (typeof data.score === "number" && data.score < MIN_SCORE) {
      return { ok: false, reason: `low-score:${data.score}` };
    }

    return { ok: true, score: data.score };
  } catch (err) {
    console.warn("[recaptcha] verify error → fail-open:", err);
    return { ok: true };
  }
}
