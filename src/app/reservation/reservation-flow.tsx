"use client";

/**
 * ReservationFlow — orchestrateur du flow de réservation.
 *
 * State local (useState plutôt que Zustand pour Phase 1 — on migrera si
 * le flow devient plus complexe). 4 étapes pour V1 :
 *   1. Prestation
 *   2. Options
 *   3. Créneau (date + heure)
 *   4. Coordonnées
 *
 * Layout :
 *   Desktop ≥ lg → grid [1fr 22rem] avec récap sticky droite
 *   Mobile       → single column, récap collé en bas (sticky bar)
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServiceCategory } from "@prisma/client";
import { ServiceSelector } from "./steps/service-selector";
import { OptionsPicker } from "./steps/options-picker";
import { BookingCalendar } from "./steps/booking-calendar";
import { ClientFormStep } from "./steps/client-form";
import type { UploadedFile } from "./steps/photo-upload";
import { ReservationSummary } from "./summary";
import { createBookingAction, type CreateBookingResult } from "@/lib/actions/booking";
import { executeRecaptcha, loadRecaptcha } from "@/lib/recaptcha-client";
import { computeDepositCents } from "@/lib/deposit";

export type ServiceLite = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  category: ServiceCategory;
  durationMinutes: number;
  priceCents: number;
  disclaimer: string | null;
};

export type OptionLite = {
  id: string;
  title: string;
  description: string | null;
  addedDurationMinutes: number;
  addedPriceCents: number;
  applicableCategories: ServiceCategory[];
  disclaimer: string | null;
};

export type ClientInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

const EMPTY_CLIENT: ClientInfo = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  message: "",
};

type Props = {
  services: ServiceLite[];
  options: OptionLite[];
  bookableMonths: { year: number; month: number }[];
  closedDays: import("@/lib/closed-days").ClosedDayData;
  stripeConfigured: boolean;
  depositSettings: import("@/lib/deposit").DepositSettings | null;
};

export function ReservationFlow({
  services,
  options,
  bookableMonths,
  closedDays,
  stripeConfigured,
  depositSettings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Précharge reCAPTCHA dès l'entrée dans le tunnel (la page /reservation est
  // un funnel noindex/dynamique → pas d'impact Lighthouse sur les pages SEO).
  useEffect(() => {
    void loadRecaptcha();
  }, []);

  // State du flow
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo>(EMPTY_CLIENT);
  const [consent, setConsent] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState<string | null>(null);
  const [giftCardAmount, setGiftCardAmount] = useState(0);
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleGiftCardChange(code: string | null, amountCents: number) {
    setGiftCardCode(code);
    setGiftCardAmount(amountCents);
  }

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [serviceId, services],
  );
  const selectedOptions = useMemo(
    () => options.filter((o) => optionIds.includes(o.id)),
    [optionIds, options],
  );
  const totalDuration = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      selectedOptions.reduce((s, o) => s + o.addedDurationMinutes, 0)
    );
  }, [selectedService, selectedOptions]);

  const depositCents = useMemo(() => {
    if (!selectedService) return 0;
    const totalCents =
      selectedService.priceCents +
      selectedOptions.reduce((s, o) => s + o.addedPriceCents, 0);
    return computeDepositCents(totalCents, depositSettings);
  }, [selectedService, selectedOptions, depositSettings]);

  const giftCardApplied = Math.min(giftCardAmount, depositCents);
  const remainingDeposit = Math.max(0, depositCents - giftCardApplied);

  const compatibleOptions = useMemo(() => {
    if (!selectedService) return [];
    return options.filter((o) =>
      o.applicableCategories.includes(selectedService.category),
    );
  }, [options, selectedService]);

  // Avance/recule
  function goToStep(n: 1 | 2 | 3 | 4) {
    setError(null);
    setStep(n);
  }

  function handleSelectService(id: string) {
    setServiceId(id);
    setOptionIds([]); // reset options
    setDate(null);
    setStartTime(null);
    // Ne ferme pas l'accordéon : la cliente peut lire le disclaimer.
    // L'avance vers l'étape 2 est déclenchée par le bouton Continuer.
  }

  function handleConfirmService() {
    if (!serviceId) return;
    goToStep(2);
  }

  function handleOptionsConfirm() {
    goToStep(3);
  }

  function handleSlotPicked(d: string, t: string) {
    setDate(d);
    setStartTime(t);
    goToStep(4);
  }

  function handleSubmit() {
    if (!selectedService || !date || !startTime) {
      setError("Étapes incomplètes.");
      return;
    }
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const token = await executeRecaptcha("booking");
      const result: CreateBookingResult = await createBookingAction({
        serviceId: selectedService.id,
        optionIds: optionIds,
        date,
        startTime,
        client: {
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phone: client.phone,
          message: client.message || undefined,
        },
        giftCardCode: giftCardCode || undefined,
        photoUrls: photos.map((p) => ({
          url: p.url,
          originalName: p.originalName,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
        })),
        consent: consent as true,
        honeypot: "",
        recaptchaToken: token ?? undefined,
      });

      if (!result.ok) {
        if (result.code === "VALIDATION_ERROR" && result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        } else if (result.code === "SLOT_TAKEN") {
          setError(result.error);
          setStartTime(null);
          goToStep(3);
        } else {
          setError(result.error);
        }
        return;
      }

      // Success → redirect
      if ("checkoutUrl" in result) {
        window.location.href = result.checkoutUrl;
      } else if ("redirectUrl" in result) {
        router.push(result.redirectUrl);
      }
    });
  }

  return (
    <div className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-16 pb-32 lg:pb-16">
      {/* Header */}
      <header className="mb-10 lg:mb-14">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Réservation · 4 étapes · ~2 minutes
        </p>
        <h1
          className="mt-4 text-[clamp(2rem,5vw,3rem)] leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Prenez votre <em className="text-[var(--color-violet-700)]">rendez-vous</em>
        </h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1 mt-4 text-sm text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Retour au site
        </Link>
      </header>

      {/* Layout 2 cols desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 lg:gap-12">
        {/* ── Colonne gauche : étapes ────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Step 1 */}
          <StepCard
            num={1}
            label="Votre prestation"
            active={step === 1}
            complete={!!selectedService}
            onClick={() => goToStep(1)}
            summary={selectedService?.title}
          >
            {step === 1 && (
              <ServiceSelector
                services={services}
                selectedId={serviceId}
                onSelect={handleSelectService}
                onConfirm={handleConfirmService}
              />
            )}
          </StepCard>

          {/* Step 2 */}
          <StepCard
            num={2}
            label="Personnalisez (optionnel)"
            active={step === 2}
            complete={step > 2}
            disabled={!selectedService}
            onClick={() => selectedService && goToStep(2)}
            summary={
              selectedOptions.length > 0
                ? selectedOptions.map((o) => o.title).join(", ")
                : step > 2
                ? "Aucune option"
                : undefined
            }
          >
            {step === 2 && selectedService && (
              <OptionsPicker
                options={compatibleOptions}
                selectedIds={optionIds}
                onChange={setOptionIds}
                onConfirm={handleOptionsConfirm}
              />
            )}
          </StepCard>

          {/* Step 3 */}
          <StepCard
            num={3}
            label="Date et créneau"
            active={step === 3}
            complete={!!date && !!startTime}
            disabled={!selectedService}
            onClick={() => selectedService && goToStep(3)}
            summary={
              date && startTime
                ? `${formatDateFr(new Date(date))} · ${startTime}`
                : undefined
            }
          >
            {step === 3 && selectedService && (
              <BookingCalendar
                serviceId={selectedService.id}
                optionIds={optionIds}
                bookableMonths={bookableMonths}
                closedDays={closedDays}
                onPick={handleSlotPicked}
              />
            )}
          </StepCard>

          {/* Step 4 */}
          <StepCard
            num={4}
            label="Vos coordonnées"
            active={step === 4}
            complete={false}
            disabled={!date || !startTime}
            onClick={() => date && startTime && goToStep(4)}
          >
            {step === 4 && (
              <ClientFormStep
                value={client}
                onChange={setClient}
                consent={consent}
                onConsentChange={setConsent}
                giftCardCode={giftCardCode}
                onGiftCardChange={handleGiftCardChange}
                photos={photos}
                onPhotosChange={setPhotos}
                fieldErrors={fieldErrors}
                onSubmit={handleSubmit}
                isPending={isPending}
                stripeConfigured={stripeConfigured}
                depositLabel={
                  selectedService
                    ? `Continuer vers le paiement de l'acompte`
                    : "Valider"
                }
              />
            )}
          </StepCard>

          {/* Erreur globale */}
          {error && (
            <div
              role="alert"
              className="p-4 rounded-[var(--radius-sm)] bg-[rgba(178,58,74,0.06)] border border-[var(--color-danger)] text-[var(--color-danger)] text-sm"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {error}
            </div>
          )}
        </div>

        {/* ── Colonne droite : récap sticky ───────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <ReservationSummary
              service={selectedService}
              options={selectedOptions}
              totalDuration={totalDuration}
              date={date}
              startTime={startTime}
              stripeConfigured={stripeConfigured}
              depositCents={depositCents}
              giftCardApplied={giftCardApplied}
              remainingDeposit={remainingDeposit}
            />
          </div>
        </aside>
      </div>

      {/* Récap mobile sticky bottom */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--color-paper)] border-t border-[var(--color-line)] shadow-[var(--shadow-lg)] p-4">
        <ReservationSummary
          service={selectedService}
          options={selectedOptions}
          totalDuration={totalDuration}
          date={date}
          startTime={startTime}
          stripeConfigured={stripeConfigured}
          depositCents={depositCents}
          giftCardApplied={giftCardApplied}
          remainingDeposit={remainingDeposit}
          compact
        />
      </div>
    </div>
  );
}

// ── Step card wrapper ────────────────────────────────────

function StepCard({
  num,
  label,
  active,
  complete,
  disabled = false,
  onClick,
  summary,
  children,
}: {
  num: number;
  label: string;
  active: boolean;
  complete: boolean;
  disabled?: boolean;
  onClick: () => void;
  summary?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`bg-[var(--color-paper)] border rounded-[var(--radius-md)] overflow-hidden transition-all ${
        active
          ? "border-[var(--color-violet-300)] shadow-[var(--shadow-sm)]"
          : "border-[var(--color-line)]"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center gap-4 p-5 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`w-8 h-8 rounded-full grid place-items-center text-sm shrink-0 ${
            complete
              ? "bg-[var(--color-success)] text-white"
              : active
              ? "bg-[var(--color-violet-600)] text-white"
              : "bg-[var(--color-bone)] text-[var(--color-ink-500)]"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden="true"
        >
          {complete ? "✓" : num}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Étape {num}
          </div>
          <div
            className="text-base"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {label}
          </div>
          {summary && !active && (
            <div className="text-sm text-[var(--color-ink-700)] mt-1 truncate">
              {summary}
            </div>
          )}
        </div>
      </button>
      {children && active && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--color-line)]">
          {children}
        </div>
      )}
    </section>
  );
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
