import { Item, Trip, TripItem, TripItemWithMeta, TripPhase } from "../utils/types";
import { itemsDB, tripItemsDB } from "../db/database";
import { getPhase, parseTripInstant } from "../utils/timeEngine";
import { fuzzySearchByText } from "../utils/search";
import { validateTripItem } from "../utils/validation";
import { computeProgress, derivePackingState, sortTripItems, sortCategoryItems } from "../utils/packingLogic";
import { displayCategory, itemMatchesTrip } from "../utils/tripFilter";
import { buildCustomItem, CustomItemDraft, tripItemCountFor } from "../utils/customItem";
import { coerceBagId, defaultBagId, normalizeTripBags } from "../utils/tripBags";

export type { TripItemWithMeta };
export { computeProgress, derivePackingState, sortTripItems, sortCategoryItems, displayCategory };

function tripItemRow(trip: Trip, item: Item, selected: boolean, packed = false, bagId?: string): TripItem {
  const resolved = bagId
    ? coerceBagId(bagId, trip.bags, item.luggage)
    : defaultBagId(trip.bags, item.luggage);
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

export function fuzzySearch(items: TripItemWithMeta[], query: string, trip?: Trip): TripItemWithMeta[] {
  return fuzzySearchByText(items, query, (ti) => [ti.item.name, ti.item.category, displayCategory(ti.item, trip)]);
}

export function getCategories(items: TripItemWithMeta[], trip?: Trip): string[] {
  return [...new Set(items.map((ti) => displayCategory(ti.item, trip)))].sort();
}

export async function addCustomItemToTrip(draft: CustomItemDraft, trip: Trip): Promise<Item> {
  const item = buildCustomItem(draft);
  await itemsDB.put(item);
  await tripItemsDB.put(tripItemRow(trip, item, true));
  return item;
}

export async function reassignTripItemBags(trip: Trip): Promise<void> {
  const bags = normalizeTripBags(trip.bags);
  const rows = await getTripItemsWithMeta(trip.id);
  const next = rows.map((ti) => {
    const { item, ...row } = ti;
    const bagId = bags.length ? coerceBagId(row.bagId, bags, item.luggage) : undefined;
    const updated: TripItem = { ...row };
    if (bagId) updated.bagId = bagId;
    else delete updated.bagId;
    return updated;
  });
  await tripItemsDB.putMany(next);
}

export function getTripPhase(trip: Trip): TripPhase {
  return getPhase(parseTripInstant(trip.startTime));
}
