"use client";

/**
 * Global error boundary — capture les erreurs survenant dans le ROOT layout
 * lui-même (avant que <html>/<body> ne soient rendus). Dernier filet de
 * sécurité.
 *
 * Contraintes Next.js :
 *  - Doit contenir <html> + <body> (remplace tout le document)
 *  - Pas de SiteHeader/Footer (sinon dépendrait du layout en panne)
 *  - CSS inline pour ne dépendre de rien
 *  - Doit être Client Component
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          backgroundColor: "#fafaf5",
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#b23a4a",
              marginBottom: "0.75rem",
            }}
          >
            Erreur critique
          </p>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 500,
              lineHeight: 1.2,
              margin: "0 0 1rem 0",
            }}
          >
            Le site est temporairement indisponible
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#555",
              marginBottom: "0.75rem",
            }}
          >
            Un incident technique nous empêche d&apos;afficher cette page.
            Veuillez réessayer dans un instant.
          </p>
          <p
            style={{
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              color: "#777",
              marginBottom: "2rem",
            }}
          >
            Si le problème persiste, contactez-nous à{" "}
            <a
              href="mailto:contact@clochette-nails.fr"
              style={{ color: "#6b46c1", textDecoration: "underline" }}
            >
              contact@clochette-nails.fr
            </a>
            .
          </p>

          {error.digest && (
            <p
              style={{
                fontSize: "11px",
                color: "#999",
                fontFamily: "ui-monospace, monospace",
                marginBottom: "1.5rem",
              }}
            >
              Code incident : {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.625rem 1.5rem",
              borderRadius: "9999px",
              backgroundColor: "#6b46c1",
              color: "white",
              border: "none",
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
