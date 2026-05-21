"use client";

/**
 * Grille semaine du calendrier admin.
 *
 * Layout :
 *  - 1 colonne d'heures (gauche)
 *  - 7 colonnes (Lun → Dim) avec en-têtes cliquables (édition horaires)
 *  - Cellules vides cliquables → ouvre modal Unavailability pré-remplie
 *  - Bookings positionnés en absolute selon startTime/endTime (clic → fiche admin)
 *  - Indispos affichées en bandes bleues hachurées (clic → modal édition)
 *  - Plages "fermé" (en dehors business hours) en gris hachuré
 *  - Plages "pause" en orange hachuré
 *  - Drag sur cellules vides (Session 2) — pour V1 : clic simple
 */

import { useState } from "react";
import Link from "next/link";
import {
  DAY_LABELS_SHORT_FR,
  colorForCategory,
  formatDayShortFr,
  generateDaySlots,
  timeToMinutes,
  weekDaysIso,
} from "@/lib/calendar";
import { todayIsoParis } from "@/lib/paris-day";
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
  startsAt: string; // ISO
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
  weekStartIso: string;
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

// Hauteur d'un slot en pixels. Le total = (endHour - startHour) * (60/granularity) * SLOT_HEIGHT
const SLOT_HEIGHT_PX = 24; // 1 cell de granularity min

const STATUS_DOT: Record<string, string> = {
  CONFIRMED: "bg-[var(--color-success)]",
  AWAITING_DEPOSIT: "bg-[var(--color-warning)]",
  COMPLETED: "bg-[var(--color-ink-500)]",
  NO_SHOW: "bg-[var(--color-danger)]",
};

export function WeekGrid({
  weekStartIso,
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
  const days = weekDaysIso(weekStartIso);
  const slots = generateDaySlots(granularity, startHour, endHour);
  const totalMinutes = (endHour - startHour) * 60;
  const totalHeight = totalMinutes * (SLOT_HEIGHT_PX / granularity);

  // ─── State modales ──────────────────────────────────────
  const [editingDay, setEditingDay] = useState<
    { dayOfWeek: number; dateIso: string } | null
  >(null);
  const [unavailModalInitial, setUnavailModalInitial] = useState<
    | undefined
    | {
        id?: string;
        startsAtLocal: string;
        endsAtLocal: string;
        reason: string;
      }
  >(undefined);
  const [unavailModalOpen, setUnavailModalOpen] = useState(false);
  // CellActionModal : clic sur cellule vide → choix RDV admin OU indispo
  const [cellAction, setCellAction] = useState<
    { open: false } | { open: true; dateIso: string; startTime: string }
  >({ open: false });

  /** Clic sur cellule vide → ouvre CellActionModal (RDV admin ou indispo) */
  function openUnavailFromCell(dayIso: string, time: string) {
    setCellAction({ open: true, dateIso: dayIso, startTime: time });
  }

  function openUnavailEdit(u: Unavailability) {
    const start = new Date(u.startsAt);
    const end = new Date(u.endsAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    setUnavailModalInitial({
      id: u.id,
      startsAtLocal: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endsAtLocal: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
      reason: u.reason ?? "",
    });
    setUnavailModalOpen(true);
  }

  return (
    <>
      <div className="relative bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] overflow-x-auto">
        <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] min-w-[920px]">
          {/* Coin top-left */}
          <div className="border-b border-r border-[var(--color-line)] bg-[var(--color-bone)]" />

          {/* En-têtes jours (cliquables → édition horaires) */}
          {days.map((dayIso, i) => {
            const dayOfWeek = (i + 1) % 7; // 0 = Lun → JS Date day 1. On veut dayOfWeek Prisma : 0=Dim, 1=Lun. i=0 (lun) → dayOfWeek 1.
            const dow = i === 6 ? 0 : i + 1;
            const recurringBh = businessHours.find((b) => b.dayOfWeek === dow);
            const exception = dayExceptions.find((e) => e.dateIso === dayIso);
            // Override : si exception, ses horaires sont affichés à la place
            const bh = exception
              ? {
                  isOpen: exception.isOpen,
                  openingTime: exception.openingTime,
                  closingTime: exception.closingTime,
                }
              : recurringBh;
            const isToday = dayIso === todayIsoParis();
            return (
              <button
                key={dayIso}
                type="button"
                onClick={() => setEditingDay({ dayOfWeek: dow, dateIso: dayIso })}
                aria-label={`Modifier horaires ${DAY_LABELS_SHORT_FR[dow]}`}
                className={`border-b border-r border-[var(--color-line)] last:border-r-0 p-2.5 text-left hover:bg-[var(--color-bone)] transition-colors ${
                  isToday ? "bg-[var(--color-violet-50)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <p
                    className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {formatDayShortFr(dayIso)}
                  </p>
                  {exception && (
                    <span
                      className="inline-block px-1 py-px rounded-full bg-[#fff4e0] text-[#b3651e] border border-[#f0d6a0] text-[9px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-display)" }}
                      title={exception.reason ?? "Horaires exceptionnels ce jour"}
                    >
                      Excep.
                    </span>
                  )}
                </div>
                <p
                  className="text-[11px] mt-0.5 text-[var(--color-ink-700)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {bh && bh.isOpen && bh.openingTime && bh.closingTime
                    ? `${bh.openingTime}–${bh.closingTime}`
                    : "Fermé"}
                </p>
              </button>
            );
          })}

          {/* Lignes horaires + cellules */}
          {slots.map((time, rowIdx) => {
            const showHourLabel = time.endsWith(":00");
            return (
              <Row
                key={time}
                time={time}
                showHourLabel={showHourLabel}
                isLastRow={rowIdx === slots.length - 1}
                days={days}
                granularity={granularity}
                businessHours={businessHours}
                dayExceptions={dayExceptions}
                onClickCell={openUnavailFromCell}
              />
            );
          })}
        </div>

        {/* Couche overlay absolue : bookings + indispos positionnés en pixels */}
        <div
          className="pointer-events-none absolute top-[57px] left-[60px] right-0"
          style={{ height: `${totalHeight}px` }}
        >
          {/* 7 colonnes virtuelles pour positionner les overlays */}
          <div className="grid grid-cols-7 h-full relative">
            {days.map((dayIso, dayIdx) => (
              <div key={dayIso} className="relative border-r border-transparent">
                {/* Indispos du jour */}
                {unavailabilities
                  .filter((u) => isUnavailOnDay(u, dayIso))
                  .map((u) => {
                    const top = computeOverlayTop(u, dayIso, startHour, granularity);
                    const height = computeOverlayHeight(u, dayIso, granularity, startHour, endHour);
                    if (height <= 0) return null;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => openUnavailEdit(u)}
                        title={u.reason ? `Indispo : ${u.reason}` : "Indisponibilité"}
                        className="pointer-events-auto absolute left-0.5 right-0.5 rounded-sm border-l-2 border-[#3b82f6] bg-[#dbeafe]/70 hover:bg-[#dbeafe] transition-colors group"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundImage:
                            "repeating-linear-gradient(135deg, rgba(59,130,246,0.15) 0 6px, transparent 6px 12px)",
                        }}
                      >
                        <span
                          className="absolute top-1 left-1.5 right-1.5 text-[10px] text-[#1e3a8a] truncate text-left"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {u.reason ?? "Indispo"}
                        </span>
                      </button>
                    );
                  })}

                {/* Indispos récurrentes du jour (non éditables, géré via panneau) */}
                {(() => {
                  const dayDate = new Date(dayIso + "T00:00:00Z");
                  const dow = dayDate.getUTCDay();
                  return recurringUnavails
                    .filter(
                      (r) =>
                        r.dayOfWeek === dow &&
                        r.startsFromIso <= dayIso &&
                        (r.endsAtIso === null || dayIso <= r.endsAtIso),
                    )
                    .map((r) => {
                      if (!r.startTime || !r.endTime) return null;
                      const startMin =
                        timeToMinutes(r.startTime) - startHour * 60;
                      const durationMin =
                        timeToMinutes(r.endTime) - timeToMinutes(r.startTime);
                      if (durationMin <= 0) return null;
                      const top =
                        Math.max(0, startMin) * (SLOT_HEIGHT_PX / granularity);
                      const height = durationMin * (SLOT_HEIGHT_PX / granularity);
                      return (
                        <div
                          key={r.id}
                          title={
                            r.reason
                              ? `Récurrent : ${r.reason} (édition via Gérer)`
                              : "Indispo récurrente (édition via Gérer)"
                          }
                          className="pointer-events-none absolute left-0.5 right-0.5 rounded-sm border-l-2 border-[#3b82f6] bg-[#dbeafe]/60"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundImage:
                              "repeating-linear-gradient(135deg, rgba(59,130,246,0.12) 0 6px, transparent 6px 12px)",
                          }}
                        >
                          <span
                            className="absolute top-1 left-1.5 right-1.5 text-[10px] text-[#1e3a8a] truncate text-left"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            🔁 {r.reason ?? "Récurrent"}
                          </span>
                        </div>
                      );
                    });
                })()}

                {/* Bookings du jour */}
                {bookings
                  .filter((b) => b.dateIso === dayIso)
                  .map((b) => {
                    const startMin = timeToMinutes(b.startTime) - startHour * 60;
                    const durationMin =
                      timeToMinutes(b.endTime) - timeToMinutes(b.startTime);
                    if (startMin < 0 || durationMin <= 0) return null;
                    const top = startMin * (SLOT_HEIGHT_PX / granularity);
                    const height = durationMin * (SLOT_HEIGHT_PX / granularity);
                    const color = colorForCategory(b.serviceCategory);
                    const hasNotes = !!(b.adminNotes && b.adminNotes.trim());
                    // Tooltip enrichi avec toutes les infos + notes admin si présentes
                    const tooltip = [
                      `${b.startTime}–${b.endTime} · ${b.clientName}`,
                      b.serviceTitle,
                      hasNotes ? `\n📝 Notes admin :\n${b.adminNotes}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <Link
                        key={b.id}
                        href={`/admin/bookings/${b.id}`}
                        title={tooltip}
                        className="pointer-events-auto absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 overflow-hidden hover:shadow-md hover:z-10 transition-all"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: color.bg,
                          borderLeft: `3px solid ${color.border}`,
                          color: color.text,
                        }}
                      >
                        <div className="flex items-start gap-1 h-full min-h-0">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${STATUS_DOT[b.status] ?? "bg-[var(--color-ink-300)]"}`}
                            aria-label={b.status}
                          />
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5 min-h-0">
                            <p
                              className="text-[10px] font-medium leading-[1.15] break-words shrink-0"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              <span className="font-semibold">{b.startTime}</span>
                              {" · "}
                              {b.clientName}
                              {hasNotes && (
                                <span
                                  aria-label="Notes admin"
                                  className="ml-1 inline-block"
                                  title=""
                                >
                                  📝
                                </span>
                              )}
                              {b.filesCount > 0 && (
                                <span
                                  aria-label={`${b.filesCount} photo${b.filesCount > 1 ? "s" : ""} jointe${b.filesCount > 1 ? "s" : ""}`}
                                  className="ml-1 inline-block"
                                  title={`${b.filesCount} photo${b.filesCount > 1 ? "s" : ""} jointe${b.filesCount > 1 ? "s" : ""}`}
                                >
                                  📷
                                </span>
                              )}
                            </p>
                            {height > 28 && (
                              <p
                                className="text-[10px] leading-[1.15] opacity-85 break-words shrink-0"
                                style={{ fontFamily: "var(--font-ui)" }}
                              >
                                {b.serviceTitle}
                              </p>
                            )}
                            {height > 70 && hasNotes && (
                              <p
                                className="text-[9px] leading-[1.2] opacity-70 italic break-words flex-1 min-h-0 overflow-hidden pt-0.5 pr-1 mt-0.5 border-t border-current/20"
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
                {/* Now indicator dans la colonne d'aujourd'hui */}
                {dayIso === todayIso && (
                  <NowIndicator
                    startHour={startHour}
                    endHour={endHour}
                    granularity={granularity}
                    slotHeightPx={SLOT_HEIGHT_PX}
                  />
                )}
                {/* Inutilisé mais sert au dayIdx */}
                <span className="hidden">{dayIdx}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-xs text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-ui)" }}>
        <LegendDot color="bg-[var(--color-success)]" label="Confirmé" />
        <LegendDot color="bg-[var(--color-warning)]" label="Acompte attendu" />
        <LegendDot color="bg-[var(--color-ink-500)]" label="Honoré" />
        <LegendDot color="bg-[var(--color-danger)]" label="No-show" />
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm border-l-2 border-[#3b82f6]"
            style={{
              backgroundColor: "#dbeafe",
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(59,130,246,0.25) 0 4px, transparent 4px 8px)",
            }}
          />
          Indisponibilité
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm bg-[var(--color-ink-300)]/30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(0,0,0,0.08) 0 4px, transparent 4px 8px)",
            }}
          />
          Hors horaires
        </span>
        <span
          className="ml-auto text-[11px] text-[var(--color-ink-500)]"
        >
          Astuce : clique sur un en-tête de jour pour modifier les horaires, ou
          sur une cellule vide pour créer une indispo.
        </span>
      </div>

      {/* Modales */}
      {editingDay !== null && (() => {
        const bh = businessHours.find((b) => b.dayOfWeek === editingDay.dayOfWeek);
        const exception = dayExceptions.find(
          (e) => e.dateIso === editingDay.dateIso,
        );
        return (
          <BusinessHoursModal
            dayOfWeek={editingDay.dayOfWeek}
            dateIso={editingDay.dateIso}
            initial={{
              isOpen: bh?.isOpen ?? true,
              openingTime: bh?.openingTime ?? null,
              closingTime: bh?.closingTime ?? null,
              breakStart: bh?.breakStart ?? null,
              breakEnd: bh?.breakEnd ?? null,
            }}
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
            onClose={() => setEditingDay(null)}
          />
        );
      })()}

      {unavailModalOpen && (
        <UnavailabilityModal
          initial={unavailModalInitial}
          onClose={() => {
            setUnavailModalOpen(false);
            setUnavailModalInitial(undefined);
          }}
        />
      )}

      {cellAction.open && (
        <CellActionModal
          dateIso={cellAction.dateIso}
          startTime={cellAction.startTime}
          services={services}
          options={options}
          onClose={() => setCellAction({ open: false })}
        />
      )}
    </>
  );
}

// ─── Row component ────────────────────────────────────────

function Row({
  time,
  showHourLabel,
  isLastRow,
  days,
  granularity,
  businessHours,
  dayExceptions,
  onClickCell,
}: {
  time: string;
  showHourLabel: boolean;
  isLastRow: boolean;
  days: string[];
  granularity: number;
  businessHours: BusinessHours[];
  dayExceptions: DayException[];
  onClickCell: (dayIso: string, time: string) => void;
}) {
  return (
    <>
      {/* Label heure */}
      <div
        className={`border-r border-[var(--color-line)] ${isLastRow ? "" : "border-b border-dashed border-[var(--color-line)]/60"} bg-[var(--color-bone)] text-[10px] text-[var(--color-ink-500)] text-right pr-2 leading-none pt-0.5`}
        style={{
          height: `${SLOT_HEIGHT_PX}px`,
          fontFamily: "var(--font-ui)",
        }}
      >
        {showHourLabel ? time : ""}
      </div>

      {/* 7 cellules */}
      {days.map((dayIso, i) => {
        const dow = i === 6 ? 0 : i + 1;
        const recurringBh = businessHours.find((b) => b.dayOfWeek === dow);
        const exception = dayExceptions.find((e) => e.dateIso === dayIso);
        // Exception override BusinessHours pour le calcul du status
        const bh: BusinessHours | undefined = exception
          ? {
              dayOfWeek: dow,
              isOpen: exception.isOpen,
              openingTime: exception.openingTime,
              closingTime: exception.closingTime,
              breakStart: exception.breakStart,
              breakEnd: exception.breakEnd,
            }
          : recurringBh;
        const status = cellStatus(time, granularity, bh);
        const cellDateTime = new Date(`${dayIso}T${time}:00`);
        const isPast = cellDateTime <= new Date();
        const interactive = !isPast && status !== "closed";
        return (
          <button
            key={dayIso + time}
            type="button"
            onClick={() => interactive && onClickCell(dayIso, time)}
            disabled={!interactive}
            title={
              isPast
                ? "Créneau passé"
                : status === "closed"
                  ? "Hors horaires"
                  : status === "break"
                    ? "Pause"
                    : `Créer un RDV ou une indispo le ${dayIso} à ${time}`
            }
            className={`border-r border-[var(--color-line)] last:border-r-0 ${isLastRow ? "" : "border-b border-dashed border-[var(--color-line)]/60"} relative transition-colors ${
              isPast
                ? "bg-[var(--color-bone)]/40 cursor-not-allowed opacity-50"
                : status === "closed"
                  ? "bg-[var(--color-ink-300)]/15 cursor-not-allowed"
                  : status === "break"
                    ? "bg-[#ffedd5]/40 hover:bg-[#ffedd5]/70"
                    : "hover:bg-[var(--color-violet-50)] hover:cursor-pointer"
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
        );
      })}
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

// ─── Helpers cellule ──────────────────────────────────────

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

  // Bornes visibles de la grille
  const visibleStartMin = startHour * 60;
  const visibleEndMin = endHour * 60;

  const startMin =
    effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
  const endMin = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
  const clampedStart = Math.max(startMin, visibleStartMin);
  const clampedEnd = Math.min(endMin, visibleEndMin);

  return Math.max(0, (clampedEnd - clampedStart) * (SLOT_HEIGHT_PX / granularity));
}
