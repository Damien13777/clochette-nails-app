/**
 * ContactSection — Server Component avec 3 info cards + form Client.
 */

import { ContactForm } from "./contact-form";

export function ContactSection() {
  return (
    <section
      id="contact"
      className="max-w-[1240px] mx-auto px-5 md:px-8 lg:px-12 py-20 md:py-28"
    >
      <div className="text-center max-w-[36rem] mx-auto mb-12">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Contact
        </p>
        <h2
          className="mt-4 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Une question ? Écrivez-moi.
        </h2>
      </div>

      {/* 3 info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <ContactCard
          icon="map-pin"
          label="Adresse"
          value="Moncoutant-sur-Sèvre"
          sub="79320, Deux-Sèvres"
          href="https://maps.app.goo.gl/2U4Gm9k9CEfsD1ap8"
        />
        <ContactCard
          icon="phone"
          label="Téléphone"
          value="06 88 68 66 99"
          sub="Lun–Sam sauf mer."
          href="tel:0688686699"
        />
        <ContactCard
          icon="mail"
          label="Email"
          value="contact@clochette-nails.fr"
          sub="Réponse sous 48h"
          href="mailto:contact@clochette-nails.fr"
        />
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 md:p-8">
        <div className="mb-6 p-3 rounded-[var(--radius-sm)] bg-[var(--color-violet-50)] border border-[var(--color-violet-100)] text-sm text-[var(--color-ink-700)]">
          <span
            className="text-[var(--color-violet-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pour réserver un RDV →
          </span>{" "}
          utilisez le bouton{" "}
          <a
            href="/reservation"
            className="text-[var(--color-violet-700)] underline underline-offset-2 hover:text-[var(--color-violet-600)]"
          >
            Prendre rendez-vous
          </a>
          . Ce formulaire est pour les questions générales.
        </div>
        <ContactForm />
      </div>
    </section>
  );
}

const ICONS = {
  "map-pin": (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 7L22 7" />
    </>
  ),
} as const;

function ContactCard({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: keyof typeof ICONS;
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="block bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-violet-100)]"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[var(--color-violet-100)] grid place-items-center text-[var(--color-violet-700)] shrink-0">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[icon]}
          </svg>
        </div>
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {label}
          </p>
          <p
            className="text-base mt-1 truncate"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {value}
          </p>
          <p
            className="text-xs text-[var(--color-ink-500)] mt-1"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {sub}
          </p>
        </div>
      </div>
    </a>
  );
}
