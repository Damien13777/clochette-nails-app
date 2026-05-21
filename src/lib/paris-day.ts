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
