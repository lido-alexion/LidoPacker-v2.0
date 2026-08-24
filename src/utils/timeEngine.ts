import { TripPhase } from "./types";

export function getPhase(startTime: number, now: number = Date.now()): TripPhase {
  const diff = startTime - now;

  if (diff > 48 * 60 * 60 * 1000) return "EARLY";
  if (diff > 6 * 60 * 60 * 1000) return "MID";
  if (diff > 0) return "LAST_MINUTE";
  return "POST";
}

export function getPhaseLabel(phase: TripPhase): string {
  switch (phase) {
    case "EARLY": return "Early Prep";
    case "MID": return "Getting Ready";
    case "LAST_MINUTE": return "Last Minute!";
    case "POST": return "Trip Started";
  }
}

export function getPhaseColor(phase: TripPhase): string {
  switch (phase) {
    case "EARLY": return "var(--color-primary)";
    case "MID": return "var(--color-warning)";
    case "LAST_MINUTE": return "var(--color-danger)";
    case "POST": return "var(--color-success)";
  }
}

export function formatCountdown(startTime: number, endTime?: number): string {
  const now = Date.now();
  const diff = startTime - now;

  if (diff <= 0) {
    if (endTime && now > endTime) return "Trip ended";
    return "Trip has started";
  }

  const totalMinutes = Math.floor(diff / (60 * 1000));
  const totalHours   = Math.floor(diff / (60 * 60 * 1000));
  const totalDays    = Math.floor(diff / (24 * 60 * 60 * 1000));

  const months       = Math.floor(totalDays / 30);
  const remDays      = totalDays % 30;
  const remHours     = totalHours % 24;
  const remMinutes   = totalMinutes % 60;

  if (months >= 1) {
    const parts = [`${months} month${months > 1 ? "s" : ""}`];
    if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? "s" : ""}`);
    return parts.join(", ") + " remaining";
  }
  if (totalDays >= 1) {
    const parts = [`${totalDays} day${totalDays > 1 ? "s" : ""}`];
    if (remHours > 0) parts.push(`${remHours}h`);
    return parts.join(", ") + " remaining";
  }
  if (totalHours > 0) return `${totalHours}h ${remMinutes}m remaining`;
  return `${remMinutes}m remaining`;
}

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string | undefined): boolean {
  return !!value && DATE_ONLY.test(value);
}

/** Local midnight for YYYY-MM-DD; otherwise Date.parse. */
export function parseTripInstant(value: string | undefined): number {
  if (!value) return NaN;
  if (isDateOnly(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return Date.parse(value);
}

export function toDateInputValue(value: string | undefined): string {
  if (!value) return "";
  if (isDateOnly(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInputValue(value: string | undefined): string {
  if (!value || isDateOnly(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date required; empty time stores YYYY-MM-DD. With time, stores local ISO. */
export function combineDateAndTime(dateStr: string, timeStr: string): string {
  if (!dateStr) return "";
  if (!timeStr) return dateStr;
  const d = new Date(`${dateStr}T${timeStr}`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function formatDate(value: string, timeZone?: string): string {
  const ms = parseTripInstant(value);
  if (Number.isNaN(ms)) return "";
  const date = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  if (!isDateOnly(value)) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  if (timeZone && !isDateOnly(value)) opts.timeZone = timeZone;
  return date.toLocaleString("en-US", opts);
}

export function formatTimeZoneLabel(timeZone?: string): string {
  const tz = timeZone || getLocalTimeZone();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ? `${tz} (${name})` : tz;
  } catch {
    return tz;
  }
}
