/**
 * Sentry — enregistrement runtime serveur (Node + Edge).
 *
 * `register()` initialise Sentry selon le runtime ; `onRequestError` capture
 * automatiquement les erreurs de requêtes serveur (Server Components, route
 * handlers, server actions). Si `SENTRY_DSN` n'est pas défini, Sentry est
 * simplement désactivé (no-op) → safe sans config.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
