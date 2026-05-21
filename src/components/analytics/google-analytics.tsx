"use client";

/**
 * Google Analytics 4 — chargement conditionnel selon le consentement RGPD.
 *
 * Comportement :
 *  - Au mount : check le consentement "analytics"
 *  - Si OUI → charge gtag.js + track page views au changement de route
 *  - Si NON → ne charge rien (zéro requête tierce, zéro cookie GA)
 *  - Écoute `cookie-consent-changed` : si l'utilisateur accepte plus tard,
 *    le script se charge dynamiquement. Si l'utilisateur révoque, on
 *    affiche un message au reload (le gtag déjà chargé reste en mémoire
 *    jusqu'au refresh — limitation acceptable pour V1).
 *
 *  - Paramètre `anonymize_ip` activé (recommandation CNIL).
 *  - Pas de Google Signals, pas de personalisation pub (default).
 *
 * Usage : <GoogleAnalytics trackingId="G-XXXXXXXXXX" />
 * Tracking ID dans NEXT_PUBLIC_GA_TRACKING_ID
 */

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  CONSENT_CHANGED_EVENT,
  hasCookieConsent,
} from "@/lib/cookie-consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type Props = {
  trackingId: string;
};

export function GoogleAnalytics({ trackingId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Suit l'état du consentement
  useEffect(() => {
    function check() {
      setEnabled(hasCookieConsent("analytics"));
    }
    check();
    document.addEventListener(CONSENT_CHANGED_EVENT, check);
    return () => {
      document.removeEventListener(CONSENT_CHANGED_EVENT, check);
    };
  }, []);

  // Track page view au changement de route (uniquement si activé + gtag chargé)
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.gtag) return;
    const url =
      pathname + (searchParams.toString() ? `?${searchParams}` : "");
    window.gtag("config", trackingId, { page_path: url });
  }, [enabled, pathname, searchParams, trackingId]);

  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${trackingId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${trackingId}', {
            anonymize_ip: true,
            cookie_flags: 'SameSite=None;Secure'
          });
        `}
      </Script>
    </>
  );
}
