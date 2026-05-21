/**
 * Page /reservation/deplacer?token=…
 *
 * Lien depuis l'email de confirmation. États gérés :
 *  - missing / invalid → erreur
 *  - used → déjà utilisé
 *  - wrong-status → réservation non modifiable
 *  - too-late → < 72h, déplacement INTERDIT → propose annulation ou contact
 *  - actionable → form de déplacement (date picker + grille créneaux + motif)
 *
 * CGV §11 : déplacement uniquement > 72h. <72h → annulation (acompte conservé)
 * + nouvelle résa OU contact direct salon.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { resolveClientToken } from "@/lib/booking-client-token";
import { RescheduleForm } from "./reschedule-form";

export const metadata: Metadata = {
  title: "Déplacer mon rendez-vous",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = {
  token?: string;
};

const PHONE = "06 88 68 66 99";
const PHONE_HREF = "tel:0688686699";
const EMAIL_HREF = "mailto:contact@clochette-nails.fr";

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ReschedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const resolved = await resolveClientToken(token);

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10">
        {resolved.state === "missing" || resolved.state === "invalid" ? (
          <ErrorCard
            title="Lien invalide"
            body="Ce lien n'est pas reconnu. Vérifiez qu'il provient bien de votre email de confirmation Clochette Nails, ou contactez-nous."
          />
        ) : resolved.state === "used" ? (
          <ErrorCard
            title="Lien déjà utilisé"
            body="Ce lien a déjà servi à annuler ou déplacer votre rendez-vous. Pour toute modification supplémentaire, contactez directement le salon."
          />
        ) : resolved.state === "wrong-status" ? (
          <ErrorCard
            title="Réservation non modifiable"
            body={`Cette réservation n'est plus active (statut : ${resolved.status}). Si vous pensez qu'il s'agit d'une erreur, contactez le salon.`}
          />
        ) : resolved.state === "too-late" ? (
          <TooLateCard
            booking={resolved.booking}
            hoursLeft={resolved.hoursLeft}
            token={token!}
          />
        ) : (
          <ActionableCard
            booking={resolved.booking}
            hoursLeft={resolved.hoursLeft}
            token={token!}
          />
        )}
      </div>
    </main>
  );
}

// ─── Sous-composants ────────────────────────────────────────

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p
        className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Déplacement impossible
      </p>
      <h1 className="text-2xl mt-3 mb-4" style={{ fontFamily: "var(--font-serif)" }}>
        {title}
      </h1>
      <p
        className="text-sm text-[var(--color-ink-500)] mb-6"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {body}
      </p>
      <ContactRow />
      <div className="mt-6">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.06em] text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

function TooLateCard({
  booking,
  hoursLeft,
  token,
}: {
  booking: { date: Date; startTime: string; serviceTitle: string };
  hoursLeft: number;
  token: string;
}) {
  const dateFr = formatDateFr(booking.date);
  const hoursLeftRounded = Math.max(0, Math.round(hoursLeft));

  return (
    <div className="text-center">
      <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <p
        className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Délai dépassé
      </p>
      <h1 className="text-2xl mt-3 mb-4" style={{ fontFamily: "var(--font-serif)" }}>
        Déplacement impossible en ligne
      </h1>

      <div className="bg-[var(--color-cream)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-4 mb-6 text-left">
        <p
          className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Votre rendez-vous
        </p>
        <p
          className="text-base text-[var(--color-ink-900)] capitalize mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {dateFr} · {booking.startTime}
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {booking.serviceTitle}
        </p>
      </div>

      <div className="bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] px-4 py-4 mb-6 text-left">
        <p
          className="text-sm text-[var(--color-ink-700)] leading-relaxed mb-3"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Conformément aux{" "}
          <Link
            href="/cgv#annulation"
            target="_blank"
            className="text-[var(--color-violet-700)] underline"
          >
            CGV §11
          </Link>
          , le déplacement en ligne n&apos;est possible que jusqu&apos;à 72 heures
          avant le rendez-vous. Il reste{" "}
          <strong className="text-[var(--color-ink-900)]">{hoursLeftRounded} h</strong>{" "}
          avant le vôtre.
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Deux options s&apos;offrent à vous :
        </p>
        <ul
          className="text-sm text-[var(--color-ink-700)] leading-relaxed list-disc list-inside mt-2 space-y-1"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <li>
            <strong>Annuler ce RDV</strong> (acompte conservé) puis reprendre un
            nouveau créneau avec un nouvel acompte
          </li>
          <li>
            <strong>Contacter le salon</strong> pour étudier un éventuel
            arrangement selon les disponibilités
          </li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={`/reservation/annuler?token=${token}`}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Annuler ce RDV
        </Link>
        <a
          href={PHONE_HREF}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-600)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          📞 Appeler le salon
        </a>
      </div>

      <p
        className="text-xs text-[var(--color-ink-500)] mt-6"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {PHONE} · contact@clochette-nails.fr
      </p>
    </div>
  );
}

function ActionableCard({
  booking,
  hoursLeft,
  token,
}: {
  booking: {
    date: Date;
    startTime: string;
    endTime: string;
    serviceTitle: string;
    clientFirstName: string;
  };
  hoursLeft: number;
  token: string;
}) {
  const dateFr = formatDateFr(booking.date);
  const daysLeft = Math.floor(hoursLeft / 24);
  const currentDateIso = booking.date.toISOString().slice(0, 10);

  return (
    <div>
      <div className="text-center mb-6">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Déplacer mon RDV
        </p>
        <h1
          className="text-2xl mt-3 mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Bonjour {booking.clientFirstName},
        </h1>
        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Choisissez un nouveau créneau pour votre rendez-vous. Votre acompte est
          conservé et reporté automatiquement.
        </p>
      </div>

      <div className="bg-[var(--color-cream)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-5 mb-6">
        <p
          className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Créneau actuel
        </p>
        <p
          className="text-lg text-[var(--color-ink-900)] capitalize mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {dateFr}
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {booking.startTime} – {booking.endTime} · {booking.serviceTitle}
        </p>
      </div>

      <div className="bg-[var(--color-violet-50)] border-l-2 border-[var(--color-violet-600)] rounded-r-[var(--radius-sm)] px-4 py-3 mb-6">
        <p
          className="text-xs text-[var(--color-ink-700)] leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <strong style={{ fontFamily: "var(--font-display)" }} className="uppercase tracking-[0.06em]">
            Bon à savoir —
          </strong>{" "}
          Le déplacement n&apos;est possible qu&apos;une seule fois en ligne. Il
          reste{" "}
          {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""}` : `${Math.round(hoursLeft)} h`} avant
          votre RDV.
        </p>
      </div>

      <RescheduleForm
        token={token}
        currentDate={currentDateIso}
        currentStartTime={booking.startTime}
      />

      <div className="mt-6 pt-6 border-t border-[var(--color-line)] text-center">
        <p
          className="text-xs text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Vous préférez annuler plutôt que déplacer ?{" "}
          <Link
            href={`/reservation/annuler?token=${token}`}
            className="text-[var(--color-violet-700)] hover:underline"
          >
            Annuler le RDV
          </Link>
        </p>
      </div>
    </div>
  );
}

function ContactRow() {
  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href={PHONE_HREF}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        📞 Appeler le salon
      </a>
      <a
        href={EMAIL_HREF}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-600)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        ✉️ Email
      </a>
    </div>
  );
}
