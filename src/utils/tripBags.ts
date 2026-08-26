import { Item, Trip, TripBag } from "./types";

export const DEFAULT_BAG_TYPE = "carry";
export const BAG_COUNT_MAX = 9;

export const BAG_TYPES: { id: string; label: string }[] = [
  { id: "carry", label: "Carry" },
  { id: "luggage", label: "Suitcase/Bag" },
  { id: "backpack", label: "Backpack" },
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
  personal: "carry",
};

export function bagTypeIconSvg(type: string): string {
  const id = normalizeBagType(type);
  if (id === "luggage") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1e3a8a" d="M1.8 9.1h20.4v10.6A1.9 1.9 0 0 1 20.3 21.6H3.7A1.9 1.9 0 0 1 1.8 19.7V9.1z"/><path fill="#1e3a8a" d="M7.6 9.1V5.7A1.6 1.6 0 0 1 9.2 4.1h5.6A1.6 1.6 0 0 1 16.4 5.7v3.4h-1.7V5.9H9.3v3.2H7.6z"/><rect fill="#93c5fd" x="10.4" y="13.1" width="3.2" height="2.4" rx="0.45"/></svg>`;
  }
  if (id === "backpack") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#e85d3a" d="M8.4 7.2V5.2A3.6 3.6 0 0 1 12 1.8a3.6 3.6 0 0 1 3.6 3.4v2h-1.7V5.4A1.9 1.9 0 0 0 12 3.6a1.9 1.9 0 0 0-1.9 1.8v1.8z"/><rect fill="#e85d3a" x="5.2" y="6.4" width="13.6" height="15.2" rx="2.4"/><rect fill="#e85d3a" x="3.8" y="11.4" width="1.8" height="5" rx="0.6"/><rect fill="#e85d3a" x="18.4" y="11.4" width="1.8" height="5" rx="0.6"/><rect fill="#c94a28" x="8" y="12.2" width="8" height="5.4" rx="1.1"/><rect fill="#9ca3af" x="8" y="12.2" width="8" height="1.1" rx="0.4"/><path fill="#4b5563" d="M5.2 18.8h13.6v1A2.4 2.4 0 0 1 16.4 22.2H7.6A2.4 2.4 0 0 1 5.2 19.8v-1z"/><path fill="#6b7280" d="M10 6.6c0-1.4 4-1.4 4 0h-1.5c0-.5-1-.5-1 0z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#dc2626" fill-rule="evenodd" d="M8 8.8V7.2a4 4 0 0 1 8 0v1.6h2.2l-1.2 11.5A1.7 1.7 0 0 1 15.3 22H8.7a1.7 1.7 0 0 1-1.7-1.5L5.8 8.8H8zm1.7.2h4.6V7.3a2.3 2.3 0 0 0-4.6 0V9z"/></svg>`;
}

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
  return bagSlots(bags).length >= 1;
}

/** Icon pills up to 5 slots; a dropdown when there are more. */
export const PACKING_BAG_PILL_MAX = 5;

export function packingUsesBagPills(bags: TripBag[] | undefined): boolean {
  const n = bagSlots(bags).length;
  return n >= 1 && n <= PACKING_BAG_PILL_MAX;
}

export function itemUsesPackingBag(item: Pick<Item, "type">): boolean {
  return item.type !== "TODO";
}

/** Packing picker lists only bags added on the trip. Task items have no bag. */
export function packingBagSelectForItem(
  item: Pick<Item, "type">,
  bags: TripBag[] | undefined
): boolean {
  if (!itemUsesPackingBag(item)) return false;
  return packingBagSelectNeeded(bags);
}

export function bagsSummary(bags: TripBag[] | undefined): string {
  const rows = normalizeTripBags(bags);
  if (!rows.length) return "";
  return rows.map((row) => `${row.count}× ${bagTypeLabel(row.type)}`).join(", ");
}

export function defaultBagId(bags: TripBag[] | undefined, itemLuggage?: string): string | undefined {
  const slots = bagSlots(bags);
  if (!slots.length) return undefined;
  const raw = normalizeBagType(itemLuggage);
  const preferred = isKnownBagType(raw) ? raw : DEFAULT_BAG_TYPE;
  const match = slots.find((s) => s.type === preferred);
  if (match) return match.id;
  if (preferred !== DEFAULT_BAG_TYPE) {
    const carry = slots.find((s) => s.type === DEFAULT_BAG_TYPE);
    if (carry) return carry.id;
  }
  return slots[0].id;
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

export function resolvedItemBagId(item: Pick<Item, "luggage" | "type">, trip: Pick<Trip, "bags">, bagId?: string): string | undefined {
  if (!itemUsesPackingBag(item)) return undefined;
  return coerceBagId(bagId, trip.bags, item.luggage || DEFAULT_BAG_TYPE);
}
