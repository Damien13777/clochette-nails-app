/**
 * /admin/clientes/[id] — Fiche cliente EN LECTURE SEULE (canal 2, T4).
 *
 * Données servies par l'ERP (source de vérité CRM). Aucune écriture ici :
 * l'édition se fait dans l'ERP. Fail-soft : si l'ERP est injoignable / la fiche
 * introuvable, on affiche un état informatif.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getErpClient, isErpConfigured } from "@/lib/erp-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fiche cliente · Administration",
  robots: { index: false, follow: false },
};

// Vocabulaire de statuts de l'ERP (crm booking) : pending | confirmed |
// completed | cancelled | no_show | expired.
const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Honoré",
  cancelled: "Annulé",
  no_show: "Absence",
  expired: "Expiré",
};

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status.toLowerCase()] ?? status;
}

export default async function ClienteFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const client = isErpConfigured() ? await getErpClient(id) : null;

  const fullName =
    client && [client.firstName, client.lastName].filter(Boolean).join(" ");

  return (
    <div className="max-w-[820px] mx-auto p-6 lg:p-8 space-y-6">
      <Link
        href="/admin/clientes"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.06em] text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        ← Clientèle
      </Link>

      {!client ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 text-center">
          <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
            Fiche introuvable ou ERP indisponible.
          </p>
        </div>
      ) : (
        <>
          <header className="space-y-2">
            <p
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Fiche cliente · ERP
            </p>
            <h1 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
              {fullName || "Sans nom"}
            </h1>
          </header>

          {client.allergies && (
            <div
              className="rounded-[var(--radius-sm)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-4 py-3 text-sm text-[var(--color-danger)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              ⚠ Allergies · {client.allergies}
            </div>
          )}

          {/* Coordonnées */}
          <Card title="Coordonnées">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Row label="Email" value={client.email} />
              <Row label="Téléphone" value={client.phone} />
              <Row label="Adresse" value={client.address} />
              <Row label="Date de naissance" value={client.birthDate ? formatDate(client.birthDate) : null} />
              <Row label="Préférences" value={client.preferences} full />
            </dl>
          </Card>

          {/* Notes */}
          <Card title={`Notes (${client.notes.length})`}>
            {client.notes.length === 0 ? (
              <Empty>Aucune note.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {client.notes.map((n, i) => (
                  <li
                    key={i}
                    className="rounded-[var(--radius-sm)] bg-[var(--color-bone)] px-3 py-2.5 text-sm text-[var(--color-ink-700)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <time
                      dateTime={n.createdAt}
                      className="block mt-1 text-[11px] text-[var(--color-ink-500)]"
                    >
                      {new Date(n.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Historique RDV */}
          <Card title={`Historique RDV (${client.bookings.length})`}>
            {client.bookings.length === 0 ? (
              <Empty>Aucun rendez-vous enregistré.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {client.bookings.map((b, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--color-ink-900)]" style={{ fontFamily: "var(--font-ui)" }}>
                        {b.serviceTitle}
                      </p>
                      <p className="text-[11px] text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
                        {formatDate(b.date)} · {statusLabel(b.status)}
                      </p>
                    </div>
                    {b.revenueCents != null && (
                      <span
                        className="text-sm text-[var(--color-ink-700)] shrink-0"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {euros(b.revenueCents)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5 space-y-3">
      <h2
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt
        className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className="text-sm text-[var(--color-ink-900)] mt-0.5 whitespace-pre-wrap break-words"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
      {children}
    </p>
  );
}
