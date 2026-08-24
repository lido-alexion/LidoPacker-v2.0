import { Trip } from "./types";

export function normalizeTripName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isTripNameTaken(name: string, trips: Trip[], excludeId?: string): boolean {
  const key = normalizeTripName(name);
  if (!key) return false;
  return trips.some((t) => t.id !== excludeId && normalizeTripName(t.name) === key);
}

export function uniqueCloneName(base: string, trips: Trip[]): string {
  const names = new Set(trips.map((t) => normalizeTripName(t.name)));
  const stem = base.trim() || "Trip";
  let candidate = `${stem} copy`;
  let n = 2;
  while (names.has(normalizeTripName(candidate))) {
    candidate = `${stem} copy ${n}`;
    n++;
  }
  return candidate;
}
