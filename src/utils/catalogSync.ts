import { Item, ItemStage, ItemType, TripItem } from "./types";
import { validateItem } from "./validation";

export const CUSTOM_ITEM_PREFIX = "custom_";
export const CATALOG_META_KEY = "catalogLastUpdated";

export interface CatalogFile {
  last_updated: string;
  items: Item[];
}

export function isCustomItemId(id: string): boolean {
  return id.startsWith(CUSTOM_ITEM_PREFIX);
}

/** Keys to drop when the user deletes a local-only item. Catalog ids are refused. */
export function planLocalCustomItemDelete(
  itemId: string,
  tripItems: { tripId: string; itemId: string }[]
): { itemId: string; tripItemKeys: Array<[string, string]> } | null {
  if (!isCustomItemId(itemId)) return null;
  return {
    itemId,
    tripItemKeys: tripItems
      .filter((row) => row.itemId === itemId)
      .map((row) => [row.tripId, row.itemId]),
  };
}

/** True when the server catalog should replace the IndexedDB copy. Missing local date always refreshes. */
export function isCatalogNewer(
  serverLastUpdated: string,
  localLastUpdated: string | undefined | null
): boolean {
  if (!localLastUpdated) return true;
  const serverMs = Date.parse(serverLastUpdated);
  if (Number.isNaN(serverMs)) return false;
  const localMs = Date.parse(localLastUpdated);
  if (Number.isNaN(localMs)) return true;
  return serverMs > localMs;
}

/** Webpack/Node JSON imports may be the file or `{ default: file }`. */
export function catalogPayload(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const rec = raw as Record<string, unknown>;
  if ("last_updated" in rec || "items" in rec) return raw;
  if ("default" in rec) return rec.default;
  return raw;
}

export function parseCatalogFile(raw: unknown): CatalogFile {
  const payload = catalogPayload(raw);
  if (payload == null || typeof payload !== "object") {
    throw new Error("Catalog file is not an object.");
  }
  const rec = payload as Record<string, unknown>;
  const lastUpdated = rec.last_updated;
  if (typeof lastUpdated !== "string" || !lastUpdated.trim()) {
    throw new Error("Catalog is missing last_updated.");
  }
  if (Number.isNaN(Date.parse(lastUpdated))) {
    throw new Error("Catalog last_updated is not a valid date.");
  }
  if (!Array.isArray(rec.items)) {
    throw new Error("Catalog items must be an array.");
  }

  const items: Item[] = [];
  for (const row of rec.items) {
    if (row == null || typeof row !== "object") continue;
    const item = row as Item;
    if (validateItem(item)) continue;
    items.push(item);
  }
  if (!items.length) {
    throw new Error("Catalog has no valid items.");
  }
  return { last_updated: lastUpdated, items };
}

export function mergeCatalogItems(
  existing: Item[],
  serverItems: Item[],
  referencedItemIds: Set<string> = new Set()
): { toPut: Item[]; toDelete: string[] } {
  const serverIds = new Set(serverItems.map((item) => item.id));
  const custom = existing.filter((item) => isCustomItemId(item.id) && !serverIds.has(item.id));
  const orphans = existing.filter(
    (item) =>
      !isCustomItemId(item.id) &&
      !serverIds.has(item.id) &&
      referencedItemIds.has(item.id)
  );
  const toDelete = existing
    .filter(
      (item) =>
        !isCustomItemId(item.id) &&
        !serverIds.has(item.id) &&
        !referencedItemIds.has(item.id)
    )
    .map((item) => item.id);
  return { toPut: [...serverItems, ...custom, ...orphans], toDelete };
}

/** Placeholder ids from the 45-item v2 catalog (`i_tshirts`, …). */
export function isLegacyBaseItemId(id: string): boolean {
  return id.startsWith("i_");
}

export function typeAndStageForV1Category(category: string): { type: ItemType; stage: ItemStage } {
  const cat = category === "Documants" ? "Documents" : category;
  if (cat === "ToDos") return { type: "TODO", stage: "EARLY" };
  if (cat === "Documents") return { type: "CARRY", stage: "LAST_MINUTE" };
  if (cat === "Clothing") return { type: "PACK", stage: "EARLY" };
  if (cat === "Hygiene" || cat === "Health") return { type: "PACK", stage: "MID" };
  return { type: "PACK", stage: "MID" };
}

export function normaliseItemName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const NAME_ALIASES: Record<string, string> = {
  soapbodywash: "soap",
  traveltickets: "tickets",
  hotelconfirmation: "hotelreservation",
  facemask: "mask",
  daybackpack: "backpack",
  baglocks: "padlock",
  tshirts: "poloshirts",
};

export function isBabyOnlyItem(item: Item): boolean {
  const travellers = item.travellers || [];
  return travellers.length > 0 && travellers.every((t) => t === "baby");
}

function catalogByName(catalogItems: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const item of catalogItems) {
    const key = normaliseItemName(item.name);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export function pickCatalogMatch(legacy: Item, candidates: Item[]): Item | undefined {
  if (!candidates.length) return undefined;
  if (!isBabyOnlyItem(legacy)) {
    const notBaby = candidates.filter((item) => !isBabyOnlyItem(item));
    if (notBaby.length) return pickLowestId(notBaby);
    return undefined;
  }
  return pickLowestId(candidates);
}

function pickLowestId(items: Item[]): Item {
  return [...items].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id))[0];
}

export function matchLegacyToCatalog(legacy: Item, catalogItems: Item[]): Item | undefined {
  const byName = catalogByName(catalogItems);
  const key = normaliseItemName(legacy.name);
  const lookup = NAME_ALIASES[key] || key;
  return pickCatalogMatch(legacy, byName.get(lookup) || []);
}

export interface LegacyBaseRemap {
  remapped: boolean;
  itemsToPut: Item[];
  itemIdsToDelete: string[];
  tripItemsToPut: TripItem[];
  tripItemKeysToDelete: Array<[string, string]>;
}

/**
 * Rewrite leftover `i_*` catalog rows onto v1 numeric ids by normalised name.
 * Unmatched placeholders become `custom_i_*` so packed state is not dropped.
 */
export function remapLegacyBaseItems(
  existingItems: Item[],
  tripItems: TripItem[],
  catalogItems: Item[]
): LegacyBaseRemap {
  const legacy = existingItems.filter((item) => isLegacyBaseItemId(item.id));
  if (!legacy.length) {
    return {
      remapped: false,
      itemsToPut: [],
      itemIdsToDelete: [],
      tripItemsToPut: [],
      tripItemKeysToDelete: [],
    };
  }

  const idMap = new Map<string, string>();
  const itemsToPut: Item[] = [];
  const itemIdsToDelete: string[] = [];

  for (const item of legacy) {
    const match = matchLegacyToCatalog(item, catalogItems);
    const nextId = match ? match.id : `custom_${item.id}`;
    idMap.set(item.id, nextId);
    itemIdsToDelete.push(item.id);
    if (!match) itemsToPut.push({ ...item, id: nextId });
  }

  const occupied = new Set(tripItems.map((row) => `${row.tripId}::${row.itemId}`));
  const tripItemsToPut: TripItem[] = [];
  const tripItemKeysToDelete: Array<[string, string]> = [];

  for (const row of tripItems) {
    const nextId = idMap.get(row.itemId);
    if (!nextId || nextId === row.itemId) continue;
    tripItemKeysToDelete.push([row.tripId, row.itemId]);
    const occ = `${row.tripId}::${nextId}`;
    if (occupied.has(occ)) continue;
    occupied.add(occ);
    tripItemsToPut.push({ ...row, itemId: nextId });
  }

  return { remapped: true, itemsToPut, itemIdsToDelete, tripItemsToPut, tripItemKeysToDelete };
}
