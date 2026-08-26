import { Item, Trip, TripItem, TripItemWithMeta, TripPhase } from "../utils/types";
import { itemsDB, tripItemsDB } from "../db/database";
import { getPhase, parseTripInstant } from "../utils/timeEngine";
import { fuzzySearchByText } from "../utils/search";
import { validateTripItem } from "../utils/validation";
import { computeProgress, derivePackingState, sortTripItems, sortCategoryItems } from "../utils/packingLogic";
import { displayCategory, itemMatchesTrip, categoryTabsFor } from "../utils/tripFilter";
import { buildCustomItem, CustomItemDraft, tripItemCountFor } from "../utils/customItem";
import { normalizeTripBags, resolvedItemBagId } from "../utils/tripBags";
import { persistableTripItem } from "../utils/tripItemPersist";
import { isCustomItemId, planLocalCustomItemDelete } from "../utils/catalogSync";

export type { TripItemWithMeta };
export { computeProgress, derivePackingState, sortTripItems, sortCategoryItems, displayCategory };
export { persistableTripItem };

export async function saveTripItem(ti: TripItem | TripItemWithMeta): Promise<void> {
  await tripItemsDB.put(persistableTripItem(ti));
}

function tripItemRow(trip: Trip, item: Item, selected: boolean, packed = false, bagId?: string): TripItem {
  const resolved = resolvedItemBagId(item, trip, bagId);
  const ti: TripItem = {
    tripId: trip.id,
    itemId: item.id,
    count: tripItemCountFor(item),
    isSelected: selected,
    isPacked: packed,
    ...(resolved ? { bagId: resolved } : {}),
  };
  const err = validateTripItem(ti);
  if (err) throw new Error(err);
  return ti;
}

export async function generateTripItems(trip: Trip): Promise<void> {
  const items = await itemsDB.getAll();
  const tripItems: TripItem[] = items
    .filter((item) => itemMatchesTrip(item, trip))
    .map((item) => tripItemRow(trip, item, false));
  await tripItemsDB.putMany(tripItems);
}

export async function replaceTripItems(trip: Trip): Promise<void> {
  await tripItemsDB.deleteByTrip(trip.id);
  await generateTripItems(trip);
}

export async function getSelectedCount(tripId: string): Promise<number> {
  const items = await tripItemsDB.getByTrip(tripId);
  return items.filter((ti) => ti.isSelected).length;
}

export async function getTripItemsWithMeta(tripId: string): Promise<TripItemWithMeta[]> {
  const tripItems = await tripItemsDB.getByTrip(tripId);
  const allItems = await itemsDB.getAll();
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  return tripItems
    .map((ti) => ({ ...ti, item: itemMap.get(ti.itemId)! }))
    .filter((ti) => ti.item != null);
}

export function fuzzySearch(items: TripItemWithMeta[], query: string): TripItemWithMeta[] {
  return fuzzySearchByText(items, query, (ti) => [ti.item.name, ti.item.category, ti.item.subcategory || ""]);
}

export function getCategories(items: TripItemWithMeta[]): string[] {
  return categoryTabsFor(items);
}

export async function addCustomItemToTrip(draft: CustomItemDraft, trip: Trip): Promise<Item> {
  const item = buildCustomItem(draft);
  await itemsDB.put(item);
  await tripItemsDB.put(tripItemRow(trip, item, true));
  return item;
}

/** Removes a user-added item from this device only. Does not touch server suggestions. */
export async function deleteLocalCustomItem(itemId: string): Promise<boolean> {
  const rows = await tripItemsDB.getByItemId(itemId);
  const plan = planLocalCustomItemDelete(itemId, rows);
  if (!plan) return false;
  await tripItemsDB.deleteMany(plan.tripItemKeys);
  await itemsDB.delete(plan.itemId);
  return true;
}

export { isCustomItemId };

export async function reassignTripItemBags(trip: Trip): Promise<void> {
  const bags = normalizeTripBags(trip.bags);
  const rows = await getTripItemsWithMeta(trip.id);
  const next = rows.map((ti) => {
    const bagId = bags.length ? resolvedItemBagId(ti.item, trip, ti.bagId) : undefined;
    const updated = persistableTripItem(ti);
    if (bagId) updated.bagId = bagId;
    else delete updated.bagId;
    return updated;
  });
  await tripItemsDB.putMany(next);
}

/** Write missing/invalid bag assignments from trip bags. A valid stored `bagId` is kept, whether or not the item is packed. */
export async function ensureTripItemBagAssignments(trip: Trip, rows: TripItemWithMeta[]): Promise<void> {
  const toPut: TripItem[] = [];
  for (const ti of rows) {
    const next = resolvedItemBagId(ti.item, trip, ti.bagId);
    const current = ti.bagId || undefined;
    if (next === current) continue;
    if (next) ti.bagId = next;
    else delete ti.bagId;
    toPut.push(persistableTripItem(ti));
  }
  if (toPut.length) await tripItemsDB.putMany(toPut);
}

export function getTripPhase(trip: Trip): TripPhase {
  return getPhase(parseTripInstant(trip.startTime));
}
