import type { NextConfig } from "next";

/**
 * Content Security Policy strict avec whitelist explicite.
 *
 * Sources autorisées :
 *  - `'self'` : assets et endpoints de notre domaine
 *  - Stripe : JS du Checkout (js.stripe.com) + iframes embed
 *  - Resend : pixel de tracking ouvertures newsletter (a.resend.com)
 *  - data:/blob: pour SVG inline, favicons, downloads PDF
 *
 * `'unsafe-inline'` sur style-src est requis par Next.js et Tailwind v4
 * (impossible de l'éviter sans nonce). Pas un risque XSS majeur car
 * c'est limité aux styles, pas aux scripts.
 *
 * `'unsafe-inline'` + `'unsafe-eval'` sur script-src en dev seulement
 * (HMR Turbopack en a besoin). En prod : ni inline ni eval.
 */
function buildCsp(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "https://js.stripe.com",
      // Google Analytics (chargé seulement si la cliente a consenti via le
      // cookie banner — cf. components/analytics/google-analytics.tsx)
      "https://www.googletagmanager.com",
      ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.stripe.com",
      "https://www.google-analytics.com", // pixel GA
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
    "frame-src": ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

const isDev = process.env.NODE_ENV !== "production";

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: buildCsp(isDev) },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=(self \"https://js.stripe.com\")",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  /**
   * Origines autorisées pour le dev server en LAN.
   * Sans ça, Next.js 15+ bloque les requêtes HMR depuis 192.168.x.x
   * → la WebSocket échoue → hydratation React jamais complétée
   * → onClick ne fire pas sur les composants Client.
   *
   * On autorise tout le subnet 192.168.x.x pour le dev local.
   */
  allowedDevOrigins: ["192.168.1.23", "192.168.0.0/16", "10.0.0.0/8", "192.168.1.160"],

  experimental: {
    serverActions: {
      // Upload photos via FormData : limite par défaut = 1MB, trop bas.
      // On autorise jusqu'à 10MB pour matcher MAX_FILE_BYTES (8MB) + marge.
      bodySizeLimit: "10mb",
    },
  },

  /**
   * Headers de sécurité appliqués à toutes les routes.
   * Cf. https://owasp.org/www-project-secure-headers/
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
