"use client";

/**
 * Chargeur + exécuteur reCAPTCHA v3 côté client.
 *
 * Le script n'est PAS chargé au rendu de page (perf Lighthouse + RGPD : pas de
 * tiers chargé tant que l'utilisatrice n'interagit pas avec un formulaire). On
 * le précharge au 1er focus du form (`loadRecaptcha`) puis on l'exécute au
 * submit (`executeRecaptcha`). Sans NEXT_PUBLIC_RECAPTCHA_SITE_KEY (dev),
 * executeRecaptcha renvoie null → le serveur skip la vérif.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let loadPromise: Promise<void> | null = null;

export function loadRecaptcha(): Promise<void> {
  if (!SITE_KEY || typeof window === "undefined") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector("script[data-recaptcha]")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.dataset.recaptcha = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("recaptcha-load-failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function executeRecaptcha(action: string): Promise<string | null> {
  if (!SITE_KEY) return null;
  try {
    await loadRecaptcha();
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) return null;
    await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
    return await grecaptcha.execute(SITE_KEY, { action });
  } catch {
    // fail-open côté client : le serveur tranche (token manquant => fail-closed
    // si une clé secrète est configurée).
    return null;
  }
}
