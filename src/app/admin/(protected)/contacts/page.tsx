/**
 * /admin/contacts — Inbox des messages reçus via le formulaire public.
 *
 * Filtres : ?filter=inbox|new|replied|archived|all (défaut inbox)
 *  - inbox    : NEW + READ (à traiter)
 *  - new      : NEW uniquement
 *  - replied  : REPLIED
 *  - archived : ARCHIVED
 *  - all      : tous
 *
 * Tri : archivés DESC sur archivedAt, sinon createdAt DESC.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import type { ContactMessageStatus, Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inbox contacts · Administration",
  robots: { index: false, follow: false },
};

type FilterKey = "inbox" | "new" | "replied" | "archived" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "new", label: "Non lus" },
  { key: "replied", label: "Répondus" },
  { key: "archived", label: "Archivés" },
  { key: "all", label: "Tous" },
];

function buildWhere(filter: FilterKey): Prisma.ContactMessageWhereInput {
  switch (filter) {
    case "new":
      return { status: "NEW" };
    case "replied":
      return { status: "REPLIED" };
    case "archived":
      return { status: "ARCHIVED" };
    case "all":
      return {};
    case "inbox":
    default:
      return { status: { in: ["NEW", "READ"] } };
  }
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter: FilterKey =
    params.filter && ["inbox", "new", "replied", "archived", "all"].includes(params.filter)
      ? (params.filter as FilterKey)
      : "inbox";

  const where = buildWhere(filter);

  const [messages, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy:
        filter === "archived"
          ? [{ archivedAt: "desc" }]
          : [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.contactMessage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<ContactMessageStatus, number>(
    counts.map((c) => [c.status, c._count._all]),
  );
  const inboxCount = (byStatus.get("NEW") ?? 0) + (byStatus.get("READ") ?? 0);
  const countFor = (k: FilterKey): number | undefined => {
    switch (k) {
      case "inbox":
        return inboxCount;
      case "new":
        return byStatus.get("NEW") ?? 0;
      case "replied":
        return byStatus.get("REPLIED") ?? 0;
      case "archived":
        return byStatus.get("ARCHIVED") ?? 0;
      case "all":
        return undefined;
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6 lg:p-8 space-y-6">
      <header className="space-y-2">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Inbox
        </p>
        <h1 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Contacts
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Messages reçus depuis le formulaire de contact public.
        </p>
      </header>

      <nav
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Filtre statut"
      >
        {FILTERS.map((f) => {
          const count = countFor(f.key);
          const isActive = filter === f.key;
          return (
            <Link
              key={f.key}
              href={f.key === "inbox" ? "/admin/contacts" : `/admin/contacts?filter=${f.key}`}
              role="tab"
              aria-selected={isActive}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
                isActive
                  ? "bg-[var(--color-violet-600)] text-white"
                  : "bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {f.label}
              {count !== undefined && (
                <span
                  className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] ${
                    isActive
                      ? "bg-white/25 text-white"
                      : "bg-[var(--color-bone)] text-[var(--color-ink-700)]"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {messages.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-12 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {filter === "inbox"
              ? "Inbox vide — tout est traité."
              : "Aucun message dans cette catégorie."}
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] divide-y divide-[var(--color-line)] overflow-hidden">
          {messages.map((m) => (
            <li key={m.id}>
              <Link
                href={`/admin/contacts/${m.id}`}
                className={`block p-4 hover:bg-[var(--color-violet-50)]/40 transition-colors ${
                  m.status === "NEW" ? "bg-[var(--color-violet-50)]/20" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {m.status === "NEW" && (
                    <span
                      aria-label="Non lu"
                      className="mt-1.5 w-2 h-2 rounded-full bg-[var(--color-violet-600)] shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p
                        className={`text-sm text-[var(--color-ink-900)] ${
                          m.status === "NEW" ? "font-semibold" : ""
                        }`}
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {m.name}
                      </p>
                      <p
                        className="text-xs text-[var(--color-ink-500)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {m.email}
                      </p>
                      <StatusBadge status={m.status} />
                    </div>
                    {m.subject && (
                      <p
                        className="text-sm text-[var(--color-ink-700)] mt-1 truncate"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {m.subject}
                      </p>
                    )}
                    <p
                      className="text-xs text-[var(--color-ink-500)] mt-1 line-clamp-2"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {m.message}
                    </p>
                  </div>
                  <time
                    dateTime={m.createdAt.toISOString()}
                    className="text-xs text-[var(--color-ink-500)] shrink-0"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {formatRelative(m.createdAt)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ContactMessageStatus }) {
  const map: Record<
    ContactMessageStatus,
    { label: string; cls: string } | null
  > = {
    NEW: null,
    READ: null,
    REPLIED: {
      label: "Répondu",
      cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
    },
    ARCHIVED: {
      label: "Archivé",
      cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
    },
  };
  const v = map[status];
  if (!v) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.06em] ${v.cls}`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {v.label}
    </span>
  );
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
