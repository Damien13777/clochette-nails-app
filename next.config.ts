import type { NextConfig } from "next";

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
};

export default nextConfig;
