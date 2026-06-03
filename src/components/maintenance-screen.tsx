/**
 * MaintenanceScreen — page plein écran affichée quand `maintenanceMode` est
 * actif (cf. gate dans le root layout). Tout le site PUBLIC est remplacé par ce
 * message ; l'espace /admin reste accessible pour désactiver le mode.
 *
 * Le message est éditable depuis /admin/parametres (PlatformSettings).
 */

export function MaintenanceScreen({ message }: { message?: string | null }) {
  return (
    <main className="min-h-screen grid place-items-center bg-[var(--color-cream)] px-6 py-16 text-center">
      <div className="max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/lockup-horizontal-couleur.svg"
          alt="Clochette Nails"
          className="h-16 w-auto mx-auto mb-10"
        />
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Un instant&hellip;
        </p>
        <h1
          className="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Site en maintenance
        </h1>
        <p
          className="mt-5 text-base text-[var(--color-ink-700)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {message?.trim() ||
            "Notre site est momentanément indisponible, le temps de quelques améliorations. Nous serons de retour très vite — merci de votre patience."}
        </p>
      </div>
    </main>
  );
}
