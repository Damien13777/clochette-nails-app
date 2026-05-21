/**
 * /admin/contacts/[id] — Détail d'un message.
 *
 * Server Component fetch le message complet + metadata.
 * Auto-mark READ géré côté Client (ContactActions component).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ContactMessageStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ContactActions } from "./contact-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Message ${id.slice(0, 8)} · Inbox`,
    robots: { index: false, follow: false },
  };
}

const STATUS_LABEL: Record<ContactMessageStatus, { label: string; cls: string }> = {
  NEW: {
    label: "Non lu",
    cls: "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]",
  },
  READ: {
    label: "Lu",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-700)]",
  },
  REPLIED: {
    label: "Répondu",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
  },
  ARCHIVED: {
    label: "Archivé",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
  });

  if (!msg) notFound();

  const status = STATUS_LABEL[msg.status];

  return (
    <div className="max-w-[1200px] mx-auto p-6 lg:p-8 space-y-6">
      <nav>
        <Link
          href="/admin/contacts"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour à l&apos;inbox
        </Link>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Colonne principale : message */}
        <div className="space-y-6">
          <header className="space-y-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] ${status.cls}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {status.label}
            </span>
            <h1
              className="text-2xl md:text-3xl break-words"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {msg.subject || "Sans objet"}
            </h1>
            <p
              className="text-sm text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Reçu le{" "}
              {msg.createdAt.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </header>

          {/* Bloc expéditeur */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Expéditrice
            </h2>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label="Nom" value={msg.name} />
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${msg.email}`}
                    className="text-[var(--color-violet-700)] hover:underline break-all"
                  >
                    {msg.email}
                  </a>
                }
              />
              {msg.phone && (
                <Row
                  label="Téléphone"
                  value={
                    <a
                      href={`tel:${msg.phone}`}
                      className="text-[var(--color-violet-700)] hover:underline"
                    >
                      {msg.phone}
                    </a>
                  }
                />
              )}
            </dl>
          </section>

          {/* Bloc message */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Message
            </h2>
            <p
              className="text-sm text-[var(--color-ink-900)] whitespace-pre-wrap break-words"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {msg.message}
            </p>
          </section>

          {/* Métadonnées techniques */}
          {(msg.ipAddress || msg.userAgent || msg.archivedAt) && (
            <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
              <h2
                className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Métadonnées
              </h2>
              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
                {msg.ipAddress && (
                  <Row label="IP" value={<code>{msg.ipAddress}</code>} small />
                )}
                {msg.userAgent && (
                  <Row
                    label="User-Agent"
                    value={
                      <code className="break-all text-[10px]">
                        {msg.userAgent}
                      </code>
                    }
                    small
                  />
                )}
                {msg.archivedAt && (
                  <Row
                    label="Archivé le"
                    value={msg.archivedAt.toLocaleDateString("fr-FR")}
                    small
                  />
                )}
              </dl>
            </section>
          )}
        </div>

        {/* Colonne droite : actions */}
        <aside>
          <div className="sticky top-20">
            <ContactActions
              id={msg.id}
              status={msg.status}
              email={msg.email}
              subject={msg.subject}
              name={msg.name}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  small,
}: {
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <>
      <dt
        className={`text-[var(--color-ink-500)] uppercase tracking-[0.14em] ${
          small ? "text-[10px]" : "text-xs"
        }`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd className="text-[var(--color-ink-900)] break-words">{value}</dd>
    </>
  );
}
