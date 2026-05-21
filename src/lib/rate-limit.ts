/**
 * Rate limit in-memory — Clochette Nails
 *
 * Pattern repris d'Academy. Décision Phase 0 :
 * pas d'Upstash/Redis, in-memory suffit pour notre échelle mono-instance.
 *
 * Le compteur reset au redémarrage du serveur (acceptable). Si on scale
 * horizontal un jour, swap vers une implémentation Redis sans changer l'API.
 */

type Entry = { count: number; resetAt: number };

const limiters = new Map<string, Map<string, Entry>>();
const MAX_ENTRIES_PER_BUCKET = 10_000;

/**
 * Crée ou récupère un bucket nommé (ex: "auth:fail", "booking:submit").
 */
function getBucket(name: string): Map<string, Entry> {
  let bucket = limiters.get(name);
  if (!bucket) {
    bucket = new Map();
    limiters.set(name, bucket);
  }
  return bucket;
}

/**
 * Vérifie si la clé peut faire une action, sans incrémenter.
 * Renvoie { allowed: true } si OK, sinon { allowed: false, retryAfterSec }.
 */
export function checkRateLimit(
  bucketName: string,
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec?: number; remaining: number } {
  const now = Date.now();
  const bucket = getBucket(bucketName);
  const entry = bucket.get(key);

  if (!entry || entry.resetAt < now) {
    return { allowed: true, remaining: max };
  }
  if (entry.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      remaining: 0,
    };
  }
  return { allowed: true, remaining: max - entry.count };
}

/**
 * Incrémente le compteur pour cette clé. Si la fenêtre est expirée, reset.
 */
export function recordRateLimit(
  bucketName: string,
  key: string,
  windowMs: number,
): void {
  const now = Date.now();
  const bucket = getBucket(bucketName);
  const entry = bucket.get(key);

  if (!entry || entry.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
  }

  // Safety cap : éviter croissance non-bornée
  if (bucket.size > MAX_ENTRIES_PER_BUCKET) {
    // évince les plus anciennement expirées
    const sorted = [...bucket.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const toEvict = bucket.size - MAX_ENTRIES_PER_BUCKET;
    for (let i = 0; i < toEvict; i++) {
      bucket.delete(sorted[i][0]);
    }
  }
}

/**
 * Reset le compteur pour cette clé (à appeler sur succès d'auth par exemple).
 */
export function resetRateLimit(bucketName: string, key: string): void {
  const bucket = limiters.get(bucketName);
  bucket?.delete(key);
}

/**
 * Cleanup périodique (auto-démarré côté Node, pas en edge).
 */
if (typeof globalThis.setInterval === "function" && typeof window === "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const bucket of limiters.values()) {
      for (const [key, entry] of bucket) {
        if (entry.resetAt < now) bucket.delete(key);
      }
    }
  }, 60_000);
}

// ── Presets ────────────────────────────────────────────────

/**
 * Auth login : 5 tentatives par IP en 5 minutes.
 */
export const AUTH_FAIL = {
  bucket: "auth:fail",
  max: 5,
  windowMs: 5 * 60 * 1000,
};

/**
 * Booking submit : 30 par IP par minute.
 */
export const BOOKING_SUBMIT = {
  bucket: "booking:submit",
  max: 30,
  windowMs: 60 * 1000,
};

/**
 * Gift card validate : 10 par IP par minute.
 */
export const GIFT_CARD_VALIDATE = {
  bucket: "gc:validate",
  max: 10,
  windowMs: 60 * 1000,
};

/**
 * Upload : 5 par IP par minute.
 */
export const UPLOAD = {
  bucket: "upload",
  max: 5,
  windowMs: 60 * 1000,
};

/**
 * Contact form : 5 par IP par minute.
 */
export const CONTACT = {
  bucket: "contact",
  max: 5,
  windowMs: 60 * 1000,
};

/**
 * Newsletter subscribe : 3 par IP par heure.
 * Anti-abuse (quelqu'un qui inscrit en masse n'importe quelles adresses).
 */
export const NEWSLETTER = {
  bucket: "newsletter",
  max: 3,
  windowMs: 60 * 60 * 1000,
};

/**
 * Availability slots (endpoint public sans auth) : 60 par IP par minute.
 * Permissif car appelé à chaque changement de date dans le picker — mais
 * bloque le scraping bot (12 mois * ~30 dates = 360 appels en 1 min) et les
 * onglets multiples ouverts en simultané (DDoS léger).
 */
export const AVAILABILITY = {
  bucket: "availability",
  max: 60,
  windowMs: 60 * 1000,
};
