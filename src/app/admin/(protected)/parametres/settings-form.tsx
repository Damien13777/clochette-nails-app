"use client";

/**
 * Form Client pour la page Paramètres.
 *
 * 3 sections empilées (cards) :
 *  - Identité salon
 *  - Réservations
 *  - Modules + maintenance
 *
 * Validation côté serveur via updatePlatformSettings (Zod).
 * Affichage des erreurs par champ via fieldErrors.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type SettingsState,
  updatePlatformSettings,
} from "@/lib/actions/settings-admin";
import { EmailBannerField } from "./email-banner-field";

type DepositMode = "PERCENT" | "FIXED";

export type SettingsFormInitial = {
  businessName: string;
  businessSiret: string;
  businessAddress: string;
  contactEmail: string;
  contactPhone: string;
  depositMode: DepositMode;
  depositPercent: number;
  depositFixedCents: number;
  bookingMinAdvanceHours: number;
  bookingGranularityMinutes: number;
  bookingCancellationPolicy: string;
  bookingsEnabled: boolean;
  ebooksEnabled: boolean;
  blogEnabled: boolean;
  newsletterEnabled: boolean;
  giftCardsEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  emailSignature: string;
  emailFooterNote: string;
  emailHeaderImageUrl: string | null;
  emailFooterImageUrl: string | null;
};

export function SettingsForm({ initial }: { initial: SettingsFormInitial }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(updatePlatformSettings, null);

  // Local state pour les UI conditionnelles (mode acompte, maintenance)
  const [depositMode, setDepositMode] = useState<DepositMode>(initial.depositMode);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(
    initial.maintenanceMode,
  );

  // Re-sync local UI state quand initial change (après save → revalidatePath
  // refresh les props depuis la DB → on doit refléter ces nouvelles valeurs).
  useEffect(() => {
    setDepositMode(initial.depositMode);
    setMaintenanceMode(initial.maintenanceMode);
  }, [initial.depositMode, initial.maintenanceMode]);

  // Sur success : scroll top + router.refresh() pour re-fetch les props du
  // Server Component parent. Sans ça, les valeurs en DB sont à jour mais
  // les props `initial` du form restent stale (state local désynchronisé).
  useEffect(() => {
    if (state?.ok) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    }
  }, [state, router]);

  const fieldErrors = !state?.ok && state?.fieldErrors ? state.fieldErrors : {};

  return (
    <form action={formAction} className="space-y-6">
      {state && (
        <div
          role="alert"
          className={`text-sm p-4 rounded-[var(--radius-sm)] border ${
            state.ok
              ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/30"
              : "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/30"
          }`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {state.ok ? state.message : state.error}
        </div>
      )}

      {/* Section 1 — Identité salon */}
      <Section title="Identité salon">
        <Field
          label="Nom du salon"
          required
          name="businessName"
          defaultValue={initial.businessName}
          error={fieldErrors.businessName}
        />
        <Field
          label="SIRET"
          name="businessSiret"
          defaultValue={initial.businessSiret}
          placeholder="14 chiffres, sans espace"
          error={fieldErrors.businessSiret}
          inputMode="numeric"
        />
        <FieldTextarea
          label="Adresse complète"
          name="businessAddress"
          defaultValue={initial.businessAddress}
          placeholder="N°, rue, code postal, ville"
          rows={3}
          error={fieldErrors.businessAddress}
        />
        <Field
          label="Email contact public"
          required
          type="email"
          name="contactEmail"
          defaultValue={initial.contactEmail}
          error={fieldErrors.contactEmail}
        />
        <Field
          label="Téléphone contact public"
          name="contactPhone"
          defaultValue={initial.contactPhone}
          placeholder="06 88 68 66 99"
          error={fieldErrors.contactPhone}
          inputMode="tel"
        />
      </Section>

      {/* Section 2 — Réservations */}
      <Section title="Réservations">
        <div>
          <Label>Mode acompte</Label>
          <div className="flex gap-3 mt-1.5">
            <RadioOption
              name="depositMode"
              value="PERCENT"
              label="Pourcentage du total"
              checked={depositMode === "PERCENT"}
              onChange={() => setDepositMode("PERCENT")}
            />
            <RadioOption
              name="depositMode"
              value="FIXED"
              label="Montant fixe"
              checked={depositMode === "FIXED"}
              onChange={() => setDepositMode("FIXED")}
            />
          </div>
        </div>

        {depositMode === "PERCENT" ? (
          <Field
            label="Pourcentage acompte"
            required
            type="number"
            name="depositPercent"
            defaultValue={String(initial.depositPercent)}
            min={1}
            max={100}
            suffix="%"
            error={fieldErrors.depositPercent}
          />
        ) : (
          <Field
            label="Montant fixe acompte"
            required
            type="number"
            name="depositFixedCents"
            defaultValue={String(initial.depositFixedCents)}
            min={500}
            max={100000}
            step={100}
            suffix="cts"
            error={fieldErrors.depositFixedCents}
            hint={`En centimes — 1 € = 100 cts. Actuel : ${(initial.depositFixedCents / 100).toFixed(2).replace(".", ",")} €`}
          />
        )}
        {/* On envoie les 2 dans tous les cas pour ne pas perdre l'autre valeur */}
        {depositMode === "PERCENT" && (
          <input
            type="hidden"
            name="depositFixedCents"
            value={initial.depositFixedCents}
          />
        )}
        {depositMode === "FIXED" && (
          <input
            type="hidden"
            name="depositPercent"
            value={initial.depositPercent}
          />
        )}

        <Field
          label="Délai minimum avant le RDV (heures)"
          required
          type="number"
          name="bookingMinAdvanceHours"
          defaultValue={String(initial.bookingMinAdvanceHours)}
          min={0}
          max={168}
          suffix="h"
          hint="Buffer entre maintenant et le créneau réservable (ex : 2h = pas de RDV dans les 2 prochaines heures). 0 = autorise la résa jusqu'au dernier moment."
          error={fieldErrors.bookingMinAdvanceHours}
        />

        <div>
          <Label htmlFor="bookingGranularityMinutes">Granularité des créneaux</Label>
          <select
            id="bookingGranularityMinutes"
            name="bookingGranularityMinutes"
            defaultValue={String(initial.bookingGranularityMinutes)}
            className="w-full mt-1.5 px-4 py-3 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
          {fieldErrors.bookingGranularityMinutes && (
            <ErrorText>{fieldErrors.bookingGranularityMinutes}</ErrorText>
          )}
        </div>

        <FieldTextarea
          label="Politique d'annulation (texte affiché à la cliente)"
          name="bookingCancellationPolicy"
          defaultValue={initial.bookingCancellationPolicy}
          placeholder="Ex : Annulation gratuite jusqu'à 72h avant le RDV, au-delà l'acompte est conservé."
          rows={3}
          error={fieldErrors.bookingCancellationPolicy}
        />
      </Section>

      {/* Section 3 — Emails transactionnels */}
      <Section title="Emails (signature & bandeau)">
        <p
          className="text-xs text-[var(--color-ink-500)] -mt-1 mb-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Personnalise la signature et un bandeau optionnel (vacances, promo
          saisonnière) qui apparaîtront dans tous les emails envoyés.
        </p>

        <Field
          label="Signature email"
          name="emailSignature"
          defaultValue={initial.emailSignature}
          required
          hint='Affichée en bas des emails. Ex: "Chloé — Clochette Nails".'
          error={fieldErrors.emailSignature}
        />

        <FieldTextarea
          label="Bandeau temporaire (optionnel)"
          name="emailFooterNote"
          defaultValue={initial.emailFooterNote}
          rows={2}
          placeholder="Ex : « Le salon sera fermé du 1er au 15 août. » — vide = pas de bandeau"
          error={fieldErrors.emailFooterNote}
        />

        <EmailBannerField
          slot="header"
          label="Bannière haut d'email (optionnelle)"
          hint="Affichée tout en haut, avant le titre. Ratio recommandé 3:1 (ex 1200×400px). 5 Mo max, JPG/PNG/WebP."
          currentUrl={initial.emailHeaderImageUrl}
        />

        <EmailBannerField
          slot="footer"
          label="Bannière bas d'email (optionnelle)"
          hint="Affichée juste avant le footer. Idéale pour une signature visuelle ou un CTA discret."
          currentUrl={initial.emailFooterImageUrl}
        />
      </Section>

      {/* Section 4 — Modules + maintenance */}
      <Section title="Modules et maintenance">
        <p
          className="text-xs text-[var(--color-ink-500)] -mt-1 mb-2"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Décocher un module le cache du site public et bloque les actions
          associées. Utile pour les sorties progressives, incidents, ou
          maintenance ciblée.
        </p>

        <ToggleField
          name="bookingsEnabled"
          label="Réservations activées"
          defaultChecked={initial.bookingsEnabled}
          hint="Si désactivé, le bloc résa est masqué et /reservation redirige"
        />
        <ToggleField
          name="newsletterEnabled"
          label="Newsletter activée"
          defaultChecked={initial.newsletterEnabled}
          hint="Le formulaire d'inscription est masqué et l'action serveur refuse"
        />
        <ToggleField
          name="blogEnabled"
          label="Blog activé"
          defaultChecked={initial.blogEnabled}
          hint="/blog redirige et le lien header est masqué"
        />
        <ToggleField
          name="ebooksEnabled"
          label="Ebooks activés"
          defaultChecked={initial.ebooksEnabled}
          hint="/ebooks redirige et le catalogue est masqué"
        />
        <ToggleField
          name="giftCardsEnabled"
          label="Cartes cadeau activées"
          defaultChecked={initial.giftCardsEnabled}
          hint="Achat + application code à la résa désactivés"
        />

        <div className="border-t border-[var(--color-line)] my-4" />

        <ToggleField
          name="maintenanceMode"
          label="Mode maintenance (site indisponible)"
          defaultChecked={initial.maintenanceMode}
          hint="Si activé, tout le site public renvoie une page de maintenance"
          tone="danger"
          onChange={(checked) => setMaintenanceMode(checked)}
        />

        {maintenanceMode && (
          <FieldTextarea
            label="Message de maintenance"
            required
            name="maintenanceMessage"
            defaultValue={initial.maintenanceMessage}
            placeholder="Ex : Site en cours de maintenance, retour très bientôt !"
            rows={2}
            error={fieldErrors.maintenanceMessage}
          />
        )}
        {!maintenanceMode && (
          <input
            type="hidden"
            name="maintenanceMessage"
            value={initial.maintenanceMessage}
          />
        )}
      </Section>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-3 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pending ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </div>
    </form>
  );
}

// ─── Sous-composants ────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Label({
  children,
  htmlFor,
  required,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
      {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
    </label>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-1 text-xs text-[var(--color-danger)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {children}
    </p>
  );
}

function Field({
  label,
  required,
  name,
  defaultValue,
  type = "text",
  placeholder,
  min,
  max,
  step,
  suffix,
  hint,
  error,
  inputMode,
}: {
  label: string;
  required?: boolean;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
  error?: string;
  inputMode?: "tel" | "numeric" | "text" | "email";
}) {
  const isNumber = type === "number";
  // Classes Tailwind v4 arbitrary pour cacher les flèches natives Webkit + Firefox.
  // Évite le chevauchement avec le suffix.
  const noSpinClasses = isNumber
    ? "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
    : "";
  // Padding-right adapté à la longueur du suffix (pour éviter chevauchement)
  const suffixWidth = suffix ? Math.max(48, suffix.length * 9 + 24) : 0;
  return (
    <div>
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
      <div className="relative mt-1.5">
        <input
          id={name}
          type={type}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          inputMode={inputMode}
          required={required}
          className={`w-full px-4 py-3 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all ${
            error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
          } ${noSpinClasses}`}
          style={{
            fontFamily: "var(--font-ui)",
            paddingRight: suffix ? `${suffixWidth}px` : undefined,
          }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ink-500)] pointer-events-none whitespace-nowrap"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <ErrorText>{error}</ErrorText>
      ) : hint ? (
        <p
          className="mt-1 text-[11px] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FieldTextarea({
  label,
  required,
  name,
  defaultValue,
  placeholder,
  rows = 3,
  error,
}: {
  label: string;
  required?: boolean;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className={`w-full mt-1.5 px-4 py-3 bg-[var(--color-paper)] border rounded-[var(--radius-sm)] text-base sm:text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all resize-y ${
          error ? "border-[var(--color-danger)]/60" : "border-[var(--color-line)]"
        }`}
        style={{ fontFamily: "var(--font-ui)" }}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function RadioOption({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex-1 px-4 py-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors ${
        checked
          ? "bg-[var(--color-violet-50)] border-[var(--color-violet-600)] text-[var(--color-violet-700)]"
          : "bg-[var(--color-paper)] border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className="text-sm"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {label}
      </span>
    </label>
  );
}

function ToggleField({
  name,
  label,
  defaultChecked,
  hint,
  tone = "default",
  onChange,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  hint?: string;
  tone?: "default" | "danger";
  onChange?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  // Re-sync quand la prop change (après save → DB refetch → defaultChecked à jour)
  useEffect(() => {
    setChecked(defaultChecked);
  }, [defaultChecked]);
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className={`mt-1 w-4 h-4 rounded border-[var(--color-ink-300)] ${
          tone === "danger"
            ? "text-[var(--color-danger)] focus:ring-[var(--color-danger)]"
            : "text-[var(--color-violet-600)] focus:ring-[var(--color-violet-600)]"
        }`}
      />
      <span className="flex-1">
        <span
          className={`block text-sm ${tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-ink-900)]"}`}
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="block text-[11px] text-[var(--color-ink-500)] mt-0.5"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
