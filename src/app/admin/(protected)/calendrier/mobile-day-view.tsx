"use client";

/**
 * Vue détaillée d'un seul jour (mobile).
 *
 * Affiche :
 *  - Header du jour : nav ◀ Jour ▶ + horaires + bouton "Modifier"
 *  - Switcher granularité
 *  - Timeline verticale avec cards bookings pleine largeur, indispos, pauses, fermé
 *  - Now indicator si jour = today
 *  - CTA "+ Ajouter une indispo"
 *
 * Auto-scrolle vers l'heure actuelle au mount si jour = today.
 */

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DAY_LABELS_FULL_FR,
  addDaysIso,
  colorForCategory,
  generateDaySlots,
  timeToMinutes,
} from "@/lib/calendar";
import { BusinessHoursModal } from "./business-hours-modal";
import { CellActionModal } from "./cell-action-modal";
import { NowIndicator } from "./now-indicator";
import { UnavailabilityModal } from "./unavailability-modal";

type BusinessHours = {
  dayOfWeek: number;
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
};

type Booking = {
  id: string;
  dateIso: string;
  startTime: string;
  endTime: string;
  status: string;
  clientName: string;
  serviceTitle: string;
  serviceCategory: string;
  adminNotes: string | null;
  filesCount: number;
};

type Unavailability = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type DayException = {
  dateIso: string;
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  reason: string | null;
};

type RecurringUnav = {
  id: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  startsFromIso: string;
  endsAtIso: string | null;
  reason: string | null;
};

type Service = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
};

type Option = {
  id: string;
  title: string;
  addedDurationMinutes: number;
  addedPriceCents: number;
  applicableCategories: string[];
};

type Props = {
  selectedDayIso: string;
  granularity: number;
  startHour: number;
  endHour: number;
  businessHours: BusinessHours[];
  bookings: Booking[];
  unavailabilities: Unavailability[];
  dayExceptions: DayException[];
  recurringUnavails: RecurringUnav[];
  todayIso: string;
  services: Service[];
  options: Option[];
};

const SLOT_HEIGHT_PX = 28;

const STATUS_DOT: Record<string, string> = {
  CONFIRMED: "bg-[var(--color-success)]",
  AWAITING_DEPOSIT: "bg-[var(--color-warning)]",
  COMPLETED: "bg-[var(--color-ink-500)]",
  NO_SHOW: "bg-[var(--color-danger)]",
};

export function MobileDayView({
  selectedDayIso,
  granularity,
  startHour,
  endHour,
  businessHours,
  bookings,
  unavailabilities,
  dayExceptions,
  recurringUnavails,
  todayIso,
  services,
  options,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isToday = selectedDayIso === todayIso;
  const date = new Date(selectedDayIso + "T00:00:00Z");
  const dayOfWeek = date.getUTCDay();
  const recurringBh = businessHours.find((b) => b.dayOfWeek === dayOfWeek);
  const exception = dayExceptions.find((e) => e.dateIso === selectedDayIso);
  // Hiérarchie : exception override le récurrent pour l'affichage de la timeline
  const bh = exception
    ? {
        dayOfWeek,
        isOpen: exception.isOpen,
        openingTime: exception.openingTime,
        closingTime: exception.closingTime,
        breakStart: exception.breakStart,
        breakEnd: exception.breakEnd,
      }
    : recurringBh;
  const slots = generateDaySlots(granularity, startHour, endHour);
  const totalMinutes = (endHour - startHour) * 60;
  const totalHeight = totalMinutes * (SLOT_HEIGHT_PX / granularity);

  const [editingBH, setEditingBH] = useState(false);
  const [unavailModal, setUnavailModal] = useState<
    | { open: false }
    | {
        open: true;
        initial?: {
          id?: string;
          startsAtLocal: string;
          endsAtLocal: string;
          reason: string;
        };
      }
  >({ open: false });
  // CellActionModal : déclenchée au clic sur une cellule vide de la timeline.
  // Permet de choisir entre créer une indispo OU un RDV admin.
  const [cellActionModal, setCellActionModal] = useState<
    { open: false } | { open: true; startTime: string }
  >({ open: false });

  // Timeline à scroll interne (zone scrollable dédiée, ne fait pas sauter la
  // page) : journée complète 00h00→23h59, positionnée par défaut sur 07h00.
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const hourPx = 60 * (SLOT_HEIGHT_PX / granularity);
    el.scrollTop = 12 + Math.max(0, (7 - startHour) * hourPx); // +12 = padding top
  }, [granularity, startHour, selectedDayIso]);

  function gotoDay(direction: -1 | 1) {
    const newDayIso = addDaysIso(selectedDayIso, direction);
    const params = new URLSearchParams(searchParams.toString());
    params.set("day", newDayIso);
    // Si on sort de la semaine courante, met aussi à jour ?week=
    const newDate = new Date(newDayIso + "T00:00:00Z");
    const newDow = newDate.getUTCDay();
    const newMonday = addDaysIso(newDayIso, newDow === 0 ? -6 : 1 - newDow);
    params.set("week", newMonday);
    router.push(`/admin/calendrier?${params.toString()}`);
  }

  /** Clic sur cellule vide → ouvre CellActionModal (2 onglets : RDV admin ou indispo) */
  function openCellAction(time: string) {
    setCellActionModal({ open: true, startTime: time });
  }

  function openUnavailEdit(u: Unavailability) {
    const start = new Date(u.startsAt);
    const end = new Date(u.endsAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    setUnavailModal({
      open: true,
      initial: {
        id: u.id,
        startsAtLocal: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endsAtLocal: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
        reason: u.reason ?? "",
      },
    });
  }

  function openNewUnavailForDay() {
    setUnavailModal({
      open: true,
      initial: {
        startsAtLocal: `${selectedDayIso}T09:00`,
        endsAtLocal: `${selectedDayIso}T10:00`,
        reason: "",
      },
    });
  }

  const dayBookings = bookings.filter((b) => b.dateIso === selectedDayIso);
  const dayUnavails = unavailabilities.filter((u) =>
    isUnavailOnDay(u, selectedDayIso),
  );
  // RecurringUnavailability applicables au jour : dayOfWeek match + date dans range
  const dayRecurrings = recurringUnavails.filter(
    (r) =>
      r.dayOfWeek === dayOfWeek &&
      r.startsFromIso <= selectedDayIso &&
      (r.endsAtIso === null || selectedDayIso <= r.endsAtIso),
  );

  return (
    <div className="mt-4 space-y-3">
      {/* Header jour : nav + horaires + bouton modifier */}
      <div className="flex items-center gap-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-3">
        <button
          type="button"
          onClick={() => gotoDay(-1)}
          aria-label="Jour précédent"
          className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setEditingBH(true)}
          className="flex-1 text-left min-w-0 px-1"
        >
          <p
            className="text-sm leading-tight capitalize flex items-center flex-wrap gap-1.5"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span>
              {DAY_LABELS_FULL_FR[dayOfWeek]} {date.getUTCDate()}
            </span>
            {isToday && (
              <span
                className="inline-block align-middle px-1.5 py-0.5 rounded-full bg-[var(--color-violet-50)] text-[var(--color-violet-700)] text-[10px] uppercase tracking-[0.08em] normal-case"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Aujourd&apos;hui
              </span>
            )}
            {exception && (
              <span
                className="inline-block align-middle px-1.5 py-0.5 rounded-full bg-[#fff4e0] text-[#b3651e] border border-[#f0d6a0] text-[10px] uppercase tracking-[0.08em] normal-case"
                style={{ fontFamily: "var(--font-display)" }}
                title={exception.reason ?? "Horaires exceptionnels ce jour"}
              >
                Exception
              </span>
            )}
          </p>
          <p
            className="text-xs text-[var(--color-ink-500)] mt-0.5"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {bh && bh.isOpen && bh.openingTime && bh.closingTime
              ? `${bh.openingTime} – ${bh.closingTime}${bh.breakStart && bh.breakEnd ? ` · pause ${bh.breakStart}–${bh.breakEnd}` : ""}`
              : "Fermé · tap pour modifier"}
          </p>
        </button>
        <button
          type="button"
          onClick={() => gotoDay(1)}
          aria-label="Jour suivant"
          className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] hover:bg-[var(--color-bone)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Timeline verticale — zone à scroll interne (journée complète, ouverte
          sur 07h00). Radius réduit pour que les heures ne soient pas rognées par
          les coins arrondis. */}
      <div
        ref={timelineRef}
        className="relative bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-sm)] overflow-auto max-h-[calc(100vh-240px)]"
      >
        <div className="grid grid-cols-[44px_1fr] relative" style={{ minHeight: `${totalHeight + 24}px` }}>
          {/* Padding top — 12px : bone à gauche + paper à droite pour respirer */}
          <div className="bg-[var(--color-bone)] border-r border-[var(--color-line)]" style={{ height: "12px" }} />
          <div style={{ height: "12px" }} />

          {/* Colonne heures + cellules cliquables */}
          {slots.map((time, rowIdx) => {
            const showHourLabel = time.endsWith(":00");
            const isLastRow = rowIdx === slots.length - 1;
            const status = cellStatus(time, granularity, bh);
            const cellDateTime = new Date(`${selectedDayIso}T${time}:00`);
            const isPast = cellDateTime <= new Date();
            const interactive = !isPast && status !== "closed";
            return (
              <Fragment key={time}>
                <div
                  className={`border-r border-[var(--color-line)] ${isLastRow ? "" : "border-b border-dashed border-[var(--color-line)]/60"} bg-[var(--color-bone)] text-[10px] text-[var(--color-ink-500)] text-right pr-2 pt-0.5 leading-none ${isPast ? "opacity-50" : ""}`}
                  style={{
                    height: `${SLOT_HEIGHT_PX}px`,
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {showHourLabel ? time : ""}
                </div>
                <button
                  type="button"
                  onClick={() => interactive && openCellAction(time)}
                  disabled={!interactive}
                  title={
                    isPast
                      ? "Créneau passé"
                      : status === "closed"
                        ? "Hors horaires"
                        : status === "break"
                          ? "Pause"
                          : undefined
                  }
                  className={`${isLastRow ? "" : "border-b border-dashed border-[var(--color-line)]/60"} relative transition-colors text-left ${
                    isPast
                      ? "bg-[var(--color-bone)]/40 cursor-not-allowed opacity-50"
                      : status === "closed"
                        ? "bg-[var(--color-ink-300)]/15 cursor-not-allowed"
                        : status === "break"
                          ? "bg-[#ffedd5]/40 active:bg-[#ffedd5]/70"
                          : "active:bg-[var(--color-violet-50)]"
                  }`}
                  style={{
                    height: `${SLOT_HEIGHT_PX}px`,
                    backgroundImage:
                      status === "closed"
                        ? "repeating-linear-gradient(135deg, rgba(0,0,0,0.04) 0 6px, transparent 6px 12px)"
                        : status === "break"
                          ? "repeating-linear-gradient(135deg, rgba(251,146,60,0.15) 0 6px, transparent 6px 12px)"
                          : undefined,
                  }}
                />
              </Fragment>
            );
          })}

          {/* Padding bottom — symétrique au top */}
          <div className="bg-[var(--color-bone)] border-r border-[var(--color-line)]" style={{ height: "12px" }} />
          <div style={{ height: "12px" }} />

          {/* Overlay : bookings et indispos en absolute, alignés sur la colonne
              droite. Décalé de 12px en haut pour s'aligner avec les vrais slots
              (et non avec la cellule de padding). */}
          <div
            className="pointer-events-none absolute left-[44px] right-0"
            style={{ top: "12px", height: `${totalHeight}px` }}
          >
            {/* Indispos */}
            {dayUnavails.map((u) => {
              const top = computeOverlayTop(u, selectedDayIso, startHour, granularity);
              const height = computeOverlayHeight(
                u,
                selectedDayIso,
                granularity,
                startHour,
                endHour,
              );
              if (height <= 0) return null;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openUnavailEdit(u)}
                  className="pointer-events-auto absolute left-1 right-1 rounded-sm border-l-2 border-[#3b82f6] bg-[#dbeafe]/70 active:bg-[#dbeafe] text-left px-2 py-1 transition-colors"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(59,130,246,0.15) 0 6px, transparent 6px 12px)",
                  }}
                >
                  <span
                    className="text-[11px] text-[#1e3a8a] font-medium"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    🔵 {u.reason ?? "Indispo"}
                  </span>
                </button>
              );
            })}

            {/* Indispos récurrentes — bande hachurée non éditable
                (gérée via panneau "Gérer") */}
            {dayRecurrings.map((r) => {
              if (!r.startTime || !r.endTime) return null;
              const startMin = timeToMinutes(r.startTime) - startHour * 60;
              const durationMin = timeToMinutes(r.endTime) - timeToMinutes(r.startTime);
              if (durationMin <= 0) return null;
              const top = Math.max(0, startMin) * (SLOT_HEIGHT_PX / granularity);
              const height = durationMin * (SLOT_HEIGHT_PX / granularity);
              return (
                <div
                  key={r.id}
                  title={
                    r.reason
                      ? `Récurrent : ${r.reason} (édition via Gérer)`
                      : "Indispo récurrente (édition via Gérer)"
                  }
                  className="pointer-events-none absolute left-1 right-1 rounded-sm border-l-2 border-[#3b82f6] bg-[#dbeafe]/60 text-left px-2 py-1"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(59,130,246,0.12) 0 6px, transparent 6px 12px)",
                  }}
                >
                  <span
                    className="text-[11px] text-[#1e3a8a] font-medium"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    🔁 {r.reason ?? "Récurrent"}
                  </span>
                </div>
              );
            })}

            {/* Bookings — cards pleine largeur, lisibles */}
            {dayBookings.map((b) => {
              const startMin = timeToMinutes(b.startTime) - startHour * 60;
              const durationMin = timeToMinutes(b.endTime) - timeToMinutes(b.startTime);
              if (startMin < 0 || durationMin <= 0) return null;
              const top = startMin * (SLOT_HEIGHT_PX / granularity);
              const height = durationMin * (SLOT_HEIGHT_PX / granularity);
              const color = colorForCategory(b.serviceCategory);
              const hasNotes = !!(b.adminNotes && b.adminNotes.trim());
              return (
                <Link
                  key={b.id}
                  href={`/admin/bookings/${b.id}`}
                  className="pointer-events-auto absolute left-1 right-1 rounded-md px-2.5 py-1.5 overflow-hidden active:shadow-md transition-shadow"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundColor: color.bg,
                    borderLeft: `3px solid ${color.border}`,
                    color: color.text,
                  }}
                >
                  <div className="flex items-start gap-1.5 h-full min-h-0">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[b.status] ?? "bg-[var(--color-ink-300)]"}`}
                      aria-label={b.status}
                    />
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5 min-h-0">
                      <p
                        className="text-[12px] font-medium leading-[1.2] break-words shrink-0"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <span className="font-semibold">
                          {b.startTime} – {b.endTime}
                        </span>
                        {" · "}
                        {b.clientName}
                        {hasNotes && <span className="ml-1">📝</span>}
                        {b.filesCount > 0 && (
                          <span
                            className="ml-1"
                            aria-label={`${b.filesCount} photo${b.filesCount > 1 ? "s" : ""}`}
                            title={`${b.filesCount} photo${b.filesCount > 1 ? "s" : ""} jointe${b.filesCount > 1 ? "s" : ""}`}
                          >
                            📷
                          </span>
                        )}
                      </p>
                      {height > 36 && (
                        <p
                          className="text-[11px] leading-[1.2] opacity-85 break-words shrink-0"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {b.serviceTitle}
                        </p>
                      )}
                      {height > 76 && hasNotes && (
                        <p
                          className="text-[10px] leading-[1.2] opacity-70 italic break-words flex-1 min-h-0 overflow-hidden pt-1 pr-1 mt-0.5 border-t border-current/20"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {b.adminNotes}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Now indicator si today */}
            {isToday && (
              <NowIndicator
                startHour={startHour}
                endHour={endHour}
                granularity={granularity}
                slotHeightPx={SLOT_HEIGHT_PX}
              />
            )}
          </div>
        </div>
      </div>

      {/* CTA Ajouter indispo */}
      <button
        type="button"
        onClick={openNewUnavailForDay}
        className="w-full px-4 py-3 rounded-full border border-dashed border-[var(--color-violet-600)]/50 text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] active:bg-[var(--color-violet-50)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        + Ajouter une indispo ce jour
      </button>

      {editingBH && (
        <BusinessHoursModal
          dayOfWeek={dayOfWeek}
          dateIso={selectedDayIso}
          initial={
            recurringBh
              ? {
                  isOpen: recurringBh.isOpen,
                  openingTime: recurringBh.openingTime,
                  closingTime: recurringBh.closingTime,
                  breakStart: recurringBh.breakStart,
                  breakEnd: recurringBh.breakEnd,
                }
              : {
                  isOpen: true,
                  openingTime: null,
                  closingTime: null,
                  breakStart: null,
                  breakEnd: null,
                }
          }
          existingException={
            exception
              ? {
                  isOpen: exception.isOpen,
                  openingTime: exception.openingTime,
                  closingTime: exception.closingTime,
                  breakStart: exception.breakStart,
                  breakEnd: exception.breakEnd,
                  reason: exception.reason,
                }
              : null
          }
          onClose={() => setEditingBH(false)}
        />
      )}

      {unavailModal.open && (
        <UnavailabilityModal
          initial={unavailModal.initial}
          onClose={() => setUnavailModal({ open: false })}
        />
      )}

      {cellActionModal.open && (
        <CellActionModal
          dateIso={selectedDayIso}
          startTime={cellActionModal.startTime}
          services={services}
          options={options}
          onClose={() => setCellActionModal({ open: false })}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function cellStatus(
  time: string,
  granularity: number,
  bh: BusinessHours | undefined,
): "open" | "closed" | "break" {
  if (!bh || !bh.isOpen) return "closed";
  if (!bh.openingTime || !bh.closingTime) return "closed";
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + granularity;
  const openMin = timeToMinutes(bh.openingTime);
  const closeMin = timeToMinutes(bh.closingTime);
  if (slotStart < openMin || slotEnd > closeMin) return "closed";
  if (bh.breakStart && bh.breakEnd) {
    const bsMin = timeToMinutes(bh.breakStart);
    const beMin = timeToMinutes(bh.breakEnd);
    if (slotStart >= bsMin && slotEnd <= beMin) return "break";
  }
  return "open";
}

function isUnavailOnDay(u: Unavailability, dayIso: string): boolean {
  const dayStart = new Date(dayIso + "T00:00:00");
  const dayEnd = new Date(dayIso + "T23:59:59");
  const uStart = new Date(u.startsAt);
  const uEnd = new Date(u.endsAt);
  return uEnd > dayStart && uStart < dayEnd;
}

function computeOverlayTop(
  u: Unavailability,
  dayIso: string,
  startHour: number,
  granularity: number,
): number {
  const dayStart = new Date(dayIso + "T00:00:00");
  const uStart = new Date(u.startsAt);
  const effectiveStart = uStart < dayStart ? dayStart : uStart;
  const minutesFromStartOfDay =
    effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
  const offsetFromVisible = minutesFromStartOfDay - startHour * 60;
  return Math.max(0, offsetFromVisible * (SLOT_HEIGHT_PX / granularity));
}

function computeOverlayHeight(
  u: Unavailability,
  dayIso: string,
  granularity: number,
  startHour: number,
  endHour: number,
): number {
  const dayStart = new Date(dayIso + "T00:00:00");
  const dayEnd = new Date(dayIso + "T23:59:59");
  const uStart = new Date(u.startsAt);
  const uEnd = new Date(u.endsAt);
  const effectiveStart = uStart < dayStart ? dayStart : uStart;
  const effectiveEnd = uEnd > dayEnd ? dayEnd : uEnd;
  const visibleStartMin = startHour * 60;
  const visibleEndMin = endHour * 60;
  const startMin =
    effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
  const endMin = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
  const clampedStart = Math.max(startMin, visibleStartMin);
  const clampedEnd = Math.min(endMin, visibleEndMin);
  return Math.max(0, (clampedEnd - clampedStart) * (SLOT_HEIGHT_PX / granularity));
}
