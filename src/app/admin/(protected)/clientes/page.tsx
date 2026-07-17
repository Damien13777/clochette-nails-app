/**
 * /admin/clientes — Recherche de la clientèle (canal 2, T4).
 *
 * Lecture seule depuis l'ERP (source de vérité CRM). Formulaire GET → ?q=,
 * liste des fiches matchées, chaque ligne pointe vers /admin/clientes/[id].
 *
 * Fail-soft : si l'ERP n'est pas configuré ou injoignable, on affiche un état
 * informatif plutôt qu'une erreur (le reste de l'admin fonctionne sans l'ERP).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isErpConfigured, searchErpClients } from "@/lib/erp-client";
import type { ErpClientMatch } from "@/lib/erp-client-types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clientèle · Administration",
  robots: { index: false, follow: false },
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const configured = isErpConfigured();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let results: ErpClientMatch[] = [];
  let searched = false;
  let unreachable = false;
  if (configured && query.length >= 2) {
    const outcome = await searchErpClients(query);
    results = outcome.clients;
    unreachable = !outcome.reachable;
    searched = true;
  }

  return (
    <div className="max-w-[1000px] mx-auto p-6 lg:p-8 space-y-6">
      <header className="space-y-2">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          CRM
        </p>
        <h1 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Clientèle
        </h1>
        <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
          Fiches clientes agrégées par l&apos;ERP (coordonnées, allergies, préférences, historique).
        </p>
      </header>

      {!configured ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 text-center">
          <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
            Connexion à l&apos;ERP non configurée sur cet environnement.
          </p>
        </div>
      ) : (
        <>
          <form action="/admin/clientes" method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Nom, email ou téléphone…"
              autoFocus
              className="flex-1 min-w-0 px-3 py-2.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-violet-600)] focus:shadow-[var(--shadow-focus)] transition-all"
              style={{ fontFamily: "var(--font-ui)", WebkitAppearance: "none", appearance: "none" }}
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.06em] bg-[var(--color-violet-600)] text-white hover:bg-[var(--color-violet-700)] transition-colors shrink-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Rechercher
            </button>
          </form>

          {!searched ? (
            <p className="text-sm text-[var(--color-ink-500)] px-1" style={{ fontFamily: "var(--font-ui)" }}>
              Saisissez au moins 2 caractères pour rechercher une cliente.
            </p>
          ) : unreachable ? (
            <div className="bg-[var(--color-paper)] border border-[var(--color-warning)]/30 rounded-[var(--radius-md)] p-8 text-center">
              <p className="text-sm text-[var(--color-warning)]" style={{ fontFamily: "var(--font-ui)" }}>
                ERP momentanément indisponible. Réessayez dans un instant.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 text-center">
              <p className="text-sm text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
                Aucune cliente ne correspond à «&nbsp;{query}&nbsp;».
              </p>
            </div>
          ) : (
            <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] divide-y divide-[var(--color-line)] overflow-hidden">
              {results.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/clientes/${c.id}`}
                    className="block p-4 hover:bg-[var(--color-violet-50)]/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-sm text-[var(--color-ink-900)] font-medium"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Sans nom"}
                          {c.allergies && (
                            <span className="ml-1.5 text-[var(--color-danger)]" title="Allergies">
                              ⚠
                            </span>
                          )}
                        </p>
                        <p
                          className="text-xs text-[var(--color-ink-500)] mt-0.5 truncate"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "Coordonnées manquantes"}
                        </p>
                      </div>
                      <span
                        className="text-[11px] text-[var(--color-ink-500)] shrink-0 whitespace-nowrap"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {c.bookingCount} RDV
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
