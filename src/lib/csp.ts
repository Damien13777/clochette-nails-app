/**
 * Content-Security-Policy du site.
 *
 * `script-src` autorise `'unsafe-inline'` : Next.js injecte des scripts inline
 * d'hydratation sur **toutes** les pages, y compris les pages prérendues
 * statiquement. Une CSP par nonce (plus stricte) n'est pas applicable ici sans
 * rendre TOUTES les pages dynamiques (un nonce par requête est impossible sur du
 * HTML statique) — ce qui ferait perdre le rendu statique et dégraderait la
 * performance. `'unsafe-inline'` sur les scripts est le compromis standard des
 * apps Next à rendu statique.
 *
 * Risque XSS maîtrisé par ailleurs : tout HTML user-generated passe par
 * DOMPurify (`sanitize-html.ts`), les sources de scripts externes sont
 * whitelistées (Stripe, GA), et `'unsafe-eval'` est interdit en prod.
 *
 * `'unsafe-inline'` sur `style-src` est de toute façon requis par Next + Tailwind v4.
 */

export function buildCsp(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "https://js.stripe.com",
      // Google Analytics (chargé seulement après consentement cookie)
      "https://www.googletagmanager.com",
      // reCAPTCHA v3 (chargé paresseusement sur interaction formulaire)
      "https://www.google.com/recaptcha/",
      "https://www.gstatic.com/recaptcha/",
      // eval requis uniquement par le HMR Turbopack en dev ; jamais en prod.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.stripe.com",
      "https://www.google-analytics.com",
      "https://www.googletagmanager.com",
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
      "https://api.stripe.com",
      "https://api.resend.com",
      "https://www.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
      ...(isDev ? ["ws://localhost:*", "ws://192.168.*:*"] : []),
    ],
    "frame-src": [
      "'self'",
      "https://js.stripe.com",
      "https://hooks.stripe.com",
      // reCAPTCHA v3 (iframe de challenge invisible)
      "https://www.google.com/recaptcha/",
    ],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}
