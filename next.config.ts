import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildCsp } from "./src/lib/csp";

const isDev = process.env.NODE_ENV !== "production";

/**
 * En-têtes de sécurité appliqués à toutes les routes (CSP incluse).
 * La CSP est construite dans `src/lib/csp.ts` (cf. le détail du compromis
 * `'unsafe-inline'` sur script-src y est documenté).
 */
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
   * @react-pdf/renderer (génération factures) reste un package Node externe :
   * son bundling Turbopack casse la résolution des polices internes.
   */
  serverExternalPackages: ["@react-pdf/renderer"],

  /**
   * Redirections 301 des URLs du site v1 (PHP) indexées par Google.
   * Source : sitemap.xml v1 (5 URLs : / + 4 pages légales sous /pages/*.html).
   * `permanent: true` → 308/301, transfert du jus SEO vers les routes v2.
   * cookies.html → /confidentialite (le contenu cookies y est intégré).
   */
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/pages/mentions-legales.html", destination: "/mentions-legales", permanent: true },
      { source: "/pages/politique-confidentialite.html", destination: "/confidentialite", permanent: true },
      { source: "/pages/cookies.html", destination: "/confidentialite", permanent: true },
      { source: "/pages/cgv.html", destination: "/cgv", permanent: true },
    ];
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

/**
 * Wrapper Sentry : tunnel `/monitoring` (same-origin → pas de modif CSP,
 * contourne les adblockers). Pas d'org/projet/authToken → upload des source
 * maps désactivé pour l'instant (à activer plus tard avec un SENTRY_AUTH_TOKEN).
 */
export default withSentryConfig(nextConfig, {
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
