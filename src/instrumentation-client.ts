/**
 * Sentry — init côté navigateur (client).
 *
 * Tracing navigation only (pas de Session Replay pour l'instant : choix RGPD).
 * Le DSN est public ; si `NEXT_PUBLIC_SENTRY_DSN` est absent, Sentry est no-op.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  ignoreErrors: [
    // Ponts JS injectés par les navigateurs in-app (Instagram, Facebook, TikTok…) :
    // ces WebViews tentent d'appeler leur bridge natif iOS/Android au démontage
    // de la page → erreurs qui ne viennent PAS de notre code et ne cassent rien.
    /webkit\.messageHandlers/i,
    "sendDataToNative",
    "sendPageHideMessage",
    "_AutofillCallbackHandler",
    // Bruit navigateur / extensions courant, sans impact utilisateur.
    "Non-Error promise rejection captured",
    "ResizeObserver loop",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
