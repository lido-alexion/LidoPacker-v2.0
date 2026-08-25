import { Item, Trip, TripBag } from "./types";

export const DEFAULT_BAG_TYPE = "carry";
export const BAG_COUNT_MAX = 9;

export const BAG_TYPES: { id: string; label: string }[] = [
  { id: "carry", label: "Carry" },
  { id: "luggage", label: "Luggage" },
  { id: "backpack", label: "Backpack" },
  { id: "personal", label: "Personal item" },
];

export interface BagSlot {
  id: string;
  type: string;
  index: number;
  typeCount: number;
  label: string;
}

const TYPE_ALIASES: Record<string, string> = {
  "carry-on": "carry",
  carryon: "carry",
  suitcase: "luggage",
};

export function bagTypeLabel(type: string): string {
  const id = normalizeBagType(type);
  return BAG_TYPES.find((t) => t.id === id)?.label || id;
}

export function isKnownBagType(type: string): boolean {
  return BAG_TYPES.some((t) => t.id === type);
}

export function normalizeBagType(raw: string | undefined): string {
  const v = (raw || "").trim().toLowerCase();
  return TYPE_ALIASES[v] || v;
}

export function slotId(type: string, index: number): string {
  return `${normalizeBagType(type)}:${index}`;
}

export function parseSlotId(id: string | undefined): { type: string; index: number } | null {
  if (!id) return null;
  const sep = id.lastIndexOf(":");
  if (sep <= 0) {
    const type = normalizeBagType(id);
    return type ? { type, index: 1 } : null;
  }
  const type = normalizeBagType(id.slice(0, sep));
  const index = Number(id.slice(sep + 1));
  if (!type || !Number.isInteger(index) || index < 1) return null;
  return { type, index };
}

export function normalizeTripBags(bags: TripBag[] | undefined): TripBag[] {
  if (!bags?.length) return [];
  const byType = new Map<string, number>();
  for (const row of bags) {
    const type = normalizeBagType(row.type);
    if (!isKnownBagType(type)) continue;
    const count = Math.min(BAG_COUNT_MAX, Math.max(1, Math.floor(Number(row.count) || 1)));
    byType.set(type, count);
  }
  return BAG_TYPES
    .filter((t) => byType.has(t.id))
    .map((t) => ({ type: t.id, count: byType.get(t.id)! }));
}

export function bagSlots(bags: TripBag[] | undefined): BagSlot[] {
  const slots: BagSlot[] = [];
  for (const row of normalizeTripBags(bags)) {
    for (let i = 1; i <= row.count; i++) {
      slots.push({
        id: slotId(row.type, i),
        type: row.type,
        index: i,
        typeCount: row.count,
        label: row.count > 1 ? `${bagTypeLabel(row.type)} ${i}` : bagTypeLabel(row.type),
      });
    }
  }
  return slots;
}

export function packingBagSelectNeeded(bags: TripBag[] | undefined): boolean {
  return bagSlots(bags).length > 1;
}

export function bagsSummary(bags: TripBag[] | undefined): string {
  const rows = normalizeTripBags(bags);
  if (!rows.length) return "";
  return rows.map((row) => `${row.count}× ${bagTypeLabel(row.type)}`).join(", ");
}

export function defaultBagId(bags: TripBag[] | undefined, itemLuggage?: string): string | undefined {
  const slots = bagSlots(bags);
  if (!slots.length) return undefined;
  const preferred = normalizeBagType(itemLuggage);
  const match = preferred ? slots.find((s) => s.type === preferred) : undefined;
  if (match) return match.id;
  return slots.find((s) => s.type === DEFAULT_BAG_TYPE)?.id || slots[0].id;
}

export function coerceBagId(
  bagId: string | undefined,
  bags: TripBag[] | undefined,
  itemLuggage?: string
): string | undefined {
  const slots = bagSlots(bags);
  if (!slots.length) return undefined;
  if (bagId && slots.some((s) => s.id === bagId)) return bagId;
  const parsed = parseSlotId(bagId);
  if (parsed) {
    const sameType = slots.filter((s) => s.type === parsed.type);
    if (sameType.length) {
      return sameType[Math.min(parsed.index, sameType.length) - 1].id;
    }
  }
  return defaultBagId(bags, itemLuggage);
}

export function defaultLuggageType(trip: Pick<Trip, "bags">): string {
  const rows = normalizeTripBags(trip.bags);
  if (rows.some((r) => r.type === DEFAULT_BAG_TYPE)) return DEFAULT_BAG_TYPE;
  return rows[0]?.type || "";
}

export function slotLabel(bagId: string | undefined, bags: TripBag[] | undefined): string {
  if (!bagId) return "";
  return bagSlots(bags).find((s) => s.id === bagId)?.label || "";
}

export function validateTripBags(bags: TripBag[] | undefined): string | null {
  if (!bags || bags.length === 0) return null;
  const seen = new Set<string>();
  for (const row of bags) {
    const type = normalizeBagType(row.type);
    if (!isKnownBagType(type)) return "Unknown bag type.";
    if (seen.has(type)) return "Each bag type can only be added once.";
    seen.add(type);
    const count = Number(row.count);
    if (!Number.isInteger(count) || count < 1 || count > BAG_COUNT_MAX) {
      return `Bag count must be between 1 and ${BAG_COUNT_MAX}.`;
    }
  }
  return null;
}

export function unusedBagTypes(bags: TripBag[]): { id: string; label: string }[] {
  const used = new Set(normalizeTripBags(bags).map((b) => b.type));
  return BAG_TYPES.filter((t) => !used.has(t.id));
}

export function resolvedItemBagId(item: Pick<Item, "luggage">, trip: Pick<Trip, "bags">, bagId?: string): string | undefined {
  return coerceBagId(bagId, trip.bags, item.luggage);
}
