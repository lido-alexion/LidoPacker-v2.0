import { TripPhase } from "./types";

export interface Packable {
  isPacked: boolean;
  isSelected: boolean;
  item: { stage: string };
}

export function sortTripItems<T extends Packable>(items: T[], phase: TripPhase): T[] {
  return [...items].sort((a, b) => {
    const aPhase = a.item.stage === phase ? 0 : 1;
    const bPhase = b.item.stage === phase ? 0 : 1;
    if (aPhase !== bPhase) return aPhase - bPhase;

    const aPacked = a.isPacked ? 1 : 0;
    const bPacked = b.isPacked ? 1 : 0;
    if (aPacked !== bPacked) return aPacked - bPacked;

    return 0;
  });
}

export function computeProgress(items: Packable[]): {
  selected: number;
  packed: number;
  total: number;
  percent: number;
} {
  const selected = items.filter((ti) => ti.isSelected);
  const packed = selected.filter((ti) => ti.isPacked);
  const total = selected.length;
  const percent = total > 0 ? Math.round((packed.length / total) * 100) : 0;
  return { selected: selected.length, packed: packed.length, total, percent };
}

/** Derived packing state (§6 State Engine). */
export function derivePackingState<T extends Packable>(items: T[], phase: TripPhase): {
  remaining: T[];
  phaseItems: T[];
  missed: T[];
} {
  const selected = items.filter((ti) => ti.isSelected);
  const remaining = selected.filter((ti) => !ti.isPacked);
  const phaseItems = remaining.filter((ti) => ti.item.stage === phase);
  const missed = phase === "POST" ? remaining : [];
  return { remaining, phaseItems, missed };
}
