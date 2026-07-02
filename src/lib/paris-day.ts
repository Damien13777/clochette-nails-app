/**
 * Helpers timezone Paris ↔ Date Postgres.
 *
 * Le champ Prisma `Booking.date` est `@db.Date` (date seule, sans tz).
 * Prisma compare en convertissant les JS Date en UTC. Construire « minuit
 * Paris » avec `new Date(); setHours(0, 0, 0, 0)` produit en réalité minuit
 * local → après conversion UTC, 22h la veille (été) ou 23h (hiver).
 * La comparaison `=` avec une date Postgres matche alors le jour précédent.
 *
 * Solution : extraire Y-M-D directement depuis le fuseau Europe/Paris,
 * puis construire une JS Date dont la composante UTC vaut minuit pile.
 * Ainsi `prisma...findMany({ where: { date: startOfTodayParisAsUtc() } })`
 * matche le bon jour côté Postgres.
 */

export function startOfTodayParisAsUtc(): Date {
  return startOfDayParisAsUtc(new Date());
}

export function startOfDayParisAsUtc(d: Date): Date {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
}

/** "HH:MM" courant dans le fuseau Paris (utilisé pour comparer Booking.endTime). */
export function currentTimeHHMMParis(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/**
 * Renvoie "YYYY-MM-DD" du jour courant en Europe/Paris.
 * Utilisable côté Server ET Client (uniquement Intl). À privilégier sur
 * `new Date().toISOString().slice(0, 10)` qui donne le jour UTC.
 */
export function todayIsoParis(): string {
  return isoDateParis(new Date());
}

/**
 * Renvoie "YYYY-MM-DD" représentant le jour Paris contenant cette JS Date.
 * À privilégier sur `d.toISOString().slice(0, 10)` qui donne le jour UTC :
 * une date à 23:00 UTC peut être déjà demain Paris (été).
 */
export function isoDateParis(d: Date): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Décalage UTC (en minutes) du fuseau Europe/Paris à un instant donné.
 * +120 en été (UTC+2), +60 en hiver (UTC+1). DST-aware.
 */
function parisUtcOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // quirk Intl : minuit rendu "24"
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Convertit une heure-mur Europe/Paris ("YYYY-MM-DD" + "HH:MM") en instant UTC.
 * DST-aware (utilise l'offset Paris réel à cette date).
 *
 * Ex : parisWallClockToUtc("2026-07-09", "08:00") → 2026-07-09T06:00:00Z (été).
 *
 * ⚠ Le champ Unavailability.startsAt/endsAt est un instant absolu ; le reste
 * du domaine (BusinessHours, Booking.startTime) est en heure-mur Paris. Ce
 * helper est le pont pour écrire/lire ces instants sans dépendre du fuseau du
 * navigateur qui a saisi la valeur.
 */
export function parisWallClockToUtc(isoDate: string, hhmm: string): Date {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  const offsetMin = parisUtcOffsetMinutes(new Date(guessMs));
  return new Date(guessMs - offsetMin * 60_000);
}

/**
 * Minutes écoulées depuis minuit Paris pour l'heure-mur Paris d'un instant.
 * Ex : 2026-07-09T06:00:00Z → 08:00 Paris → 480. DST-aware.
 */
export function parisMinutesSinceMidnight(instant: Date): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let h = get("hour");
  if (h === 24) h = 0;
  return h * 60 + get("minute");
}

/** Jour ISO suivant (calendaire, sans tz). "2026-07-09" → "2026-07-10". */
export function nextIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Convertit une Unavailability (instants absolus startsAt/endsAt) en plage
 * bloquée `[startMin, endMin]` en minutes-mur Europe/Paris, clampée au jour
 * Paris `isoDate`. Renvoie null si l'indispo ne chevauche pas ce jour.
 *
 * PURE (sans Prisma) → testable et consommée par computeAvailableSlots. C'est
 * le pont qui évite le bug d'offset UTC : une indispo 08:00→10:00 Paris stockée
 * 06:00Z→08:00Z (été) donne bien [480, 600] et non [360, 480].
 */
export function unavailabilityToParisRange(
  startsAt: Date,
  endsAt: Date,
  isoDate: string,
): [number, number] | null {
  const dayStart = parisWallClockToUtc(isoDate, "00:00").getTime();
  const dayEnd = parisWallClockToUtc(nextIsoDate(isoDate), "00:00").getTime();
  const clamp = (at: Date): number => {
    const t = at.getTime();
    if (t <= dayStart) return 0;
    if (t >= dayEnd) return 24 * 60;
    return parisMinutesSinceMidnight(at);
  };
  const startMin = clamp(startsAt);
  const endMin = clamp(endsAt);
  return startMin < endMin ? [startMin, endMin] : null;
}

/**
 * Renvoie le lundi de la semaine contenant aujourd'hui (Paris) au format ISO.
 * À utiliser en remplacement de `getMondayIso(new Date())` qui dépend de la
 * TZ serveur et bugue à minuit Paris dimanche→lundi.
 */
export function mondayIsoForTodayParis(): string {
  // Construit une Date dont les composantes UTC = composantes Paris,
  // puis utilise les helpers UTC standards.
  const todayIso = todayIsoParis();
  const [y, m, d] = todayIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Dim
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
