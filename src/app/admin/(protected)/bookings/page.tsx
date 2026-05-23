/**
 * Page /admin/bookings — liste des réservations.
 *
 * Filtres : ?filter=all|today|upcoming|awaiting|completed|cancelled (défaut all)
 * Pagination : ?page=N (50 par page)
 *
 * Tri :
 *  - all / today / upcoming / awaiting : date ASC, startTime ASC (chronologique)
 *  - completed / cancelled : date DESC, startTime DESC (récent d'abord)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfTodayParisAsUtc } from "@/lib/paris-day";
import { upcomingBookingsWhere } from "@/lib/booking-where";
import {
  STATUS_VISUAL,
  formatBookingDateShort,
  formatCents,
} from "@/lib/booking-display";

export const metadata: Metadata = {
  title: "Réservations · Admin",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type FilterKey =
  | "all"
  | "today"
  | "upcoming"
  | "awaiting"
  | "completed"
  | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "today", label: "Aujourd'hui" },
  { key: "upcoming", label: "À venir" },
  { key: "awaiting", label: "En attente" },
  { key: "completed", label: "Honorées" },
  { key: "cancelled", label: "Annulées" },
];

type SearchParams = {
  filter?: FilterKey;
  page?: string;
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const params = await searchParams;
  const filter: FilterKey = isFilterKey(params.filter) ? params.filter : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const today = startOfTodayParisAsUtc();
  const where = buildWhere(filter, today);
  const orderBy: Prisma.BookingOrderByWithRelationInput[] =
    filter === "completed" || filter === "cancelled"
      ? [{ date: "desc" }, { startTime: "desc" }]
      : [{ date: "asc" }, { startTime: "asc" }];

  const [bookings, total, counts] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      skip,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        clientFirstName: true,
        clientLastName: true,
        clientEmail: true,
        depositCents: true,
        totalDurationMinutes: true,
        service: { select: { title: true } },
      },
    }),
    prisma.booking.count({ where }),
    fetchFilterCounts(today),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 mb-8">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pilotage des rendez-vous
          </p>
          <h1
            className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)] flex items-center flex-wrap gap-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span>Réservations</span>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--color-violet-100)] text-[var(--color-violet-700)] text-xs whitespace-nowrap"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {total} {total > 1 ? "résultats" : "résultat"}
            </span>
          </h1>
        </div>
      </header>

      {/* Filter chips */}
      <div
        role="tablist"
        aria-label="Filtrer les réservations"
        className="flex flex-wrap gap-2 mb-8"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            count={counts[f.key]}
            active={filter === f.key}
            href={f.key === "all" ? "/admin/bookings" : `/admin/bookings?filter=${f.key}`}
          />
        ))}
      </div>

      {/* List */}
      {bookings.length === 0 ? (
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-10 text-center">
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucune réservation dans ce filtre.
          </p>
        </div>
      ) : (
        <ul className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--color-line)]">
          {bookings.map((b) => {
            const visual = STATUS_VISUAL[b.status];
            return (
              <li key={b.id}>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 md:gap-6 items-center px-5 py-4 hover:bg-[var(--color-bone)] transition-colors"
                >
                  {/* Date + horaire */}
                  <div className="md:w-[180px]">
                    <p
                      className="text-base"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {formatBookingDateShort(b.date)}
                    </p>
                    <p
                      className="text-xs text-[var(--color-ink-500)] mt-0.5"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.startTime} – {b.endTime}
                    </p>
                  </div>

                  {/* Client + service */}
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.clientFirstName} {b.clientLastName}
                    </p>
                    <p
                      className="text-xs text-[var(--color-ink-500)] truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.service.title}
                    </p>
                    <p
                      className="text-[10px] text-[var(--color-ink-500)] mt-1 truncate"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {b.clientEmail}
                    </p>
                  </div>

                  {/* Status + acompte */}
                  <div className="flex items-center justify-between md:justify-end md:flex-col md:items-end gap-2 md:gap-1">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${visual.bgClass} ${visual.textClass}`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${visual.dotClass}`} />
                      {visual.label}
                    </span>
                    <span
                      className="text-xs text-[var(--color-ink-700)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      Acompte : {formatCents(b.depositCents)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-2 mt-6"
        >
          {page > 1 && (
            <Link
              href={buildPageHref(filter, page - 1)}
              className="px-3 py-1.5 rounded-full border border-[var(--color-line)] text-xs hover:bg-[var(--color-bone)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ← Précédent
            </Link>
          )}
          <span
            className="text-xs text-[var(--color-ink-500)] px-3"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Page {page} sur {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildPageHref(filter, page + 1)}
              className="px-3 py-1.5 rounded-full border border-[var(--color-line)] text-xs hover:bg-[var(--color-bone)] transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "bg-[var(--color-bone)] text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] ${
          active
            ? "bg-white/20 text-white"
            : "bg-[var(--color-paper)] text-[var(--color-ink-500)]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isFilterKey(value: unknown): value is FilterKey {
  return (
    typeof value === "string" &&
    ["all", "today", "upcoming", "awaiting", "completed", "cancelled"].includes(
      value,
    )
  );
}

// Helper recentré dans @/lib/paris-day pour partage avec dashboard + calendar.
// Cf. lib/paris-day.ts pour la justification du fix timezone.

function buildWhere(filter: FilterKey, today: Date): Prisma.BookingWhereInput {
  switch (filter) {
    case "today":
      return { date: today };
    case "upcoming":
      return {
        ...upcomingBookingsWhere(),
        status: { in: ["CONFIRMED", "AWAITING_DEPOSIT"] },
      };
    case "awaiting":
      return { status: "AWAITING_DEPOSIT" };
    case "completed":
      return { status: "COMPLETED" };
    case "cancelled":
      return {
        status: {
          in: ["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "NO_SHOW", "EXPIRED"],
        },
      };
    case "all":
    default:
      return {};
  }
}

async function fetchFilterCounts(
  today: Date,
): Promise<Record<FilterKey, number>> {
  const [all, todayCount, upcoming, awaiting, completed, cancelled] =
    await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { date: today } }),
      prisma.booking.count({
        where: {
          ...upcomingBookingsWhere(),
          status: { in: ["CONFIRMED", "AWAITING_DEPOSIT"] },
        },
      }),
      prisma.booking.count({ where: { status: "AWAITING_DEPOSIT" } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.booking.count({
        where: {
          status: {
            in: ["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "NO_SHOW", "EXPIRED"],
          },
        },
      }),
    ]);
  return {
    all,
    today: todayCount,
    upcoming,
    awaiting,
    completed,
    cancelled,
  };
}

function buildPageHref(filter: FilterKey, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
}
