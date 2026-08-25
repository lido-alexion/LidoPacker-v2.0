import { Item, Trip, TripItem, TripItemWithMeta, TripPhase } from "../utils/types";
import { itemsDB, tripItemsDB } from "../db/database";
import { getPhase, parseTripInstant } from "../utils/timeEngine";
import { fuzzySearchByText } from "../utils/search";
import { validateItem, validateTripItem } from "../utils/validation";
import { computeProgress, derivePackingState, sortTripItems, sortCategoryItems } from "../utils/packingLogic";
import { displayCategory, itemMatchesTrip } from "../utils/tripFilter";

export type { TripItemWithMeta };
export { computeProgress, derivePackingState, sortTripItems, sortCategoryItems, displayCategory };

const MW = ["man", "woman"];
const ESS = ["Essentials"];

export async function generateTripItems(trip: Trip): Promise<void> {
  const items = await itemsDB.getAll();
  const tripItems: TripItem[] = items
    .filter((item) => itemMatchesTrip(item, trip))
    .map((item) => {
      const ti: TripItem = {
        tripId: trip.id,
        itemId: item.id,
        count: item.defaultCount >= 1 ? item.defaultCount : 1,
        isSelected: false,
        isPacked: false,
      };
      const err = validateTripItem(ti);
      if (err) throw new Error(err);
      return ti;
    });
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

export function createNewItem(name: string, trip?: Trip, category: string = "Custom"): Item {
  const item: Item = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    category,
    subcategory: "Custom",
    type: "PACK",
    stage: "MID",
    defaultCount: 1,
    travellers: trip?.travellers ? [...trip.travellers] : MW,
    types: trip?.types ? [...trip.types] : ESS,
    ...(trip?.weathers ? { weathers: [...trip.weathers] } : {}),
    ...(trip?.vehicles ? { vehicles: [...trip.vehicles] } : {}),
  };
  const err = validateItem(item);
  if (err) throw new Error(err);
  return item;
}

export function getTripPhase(trip: Trip): TripPhase {
  return getPhase(parseTripInstant(trip.startTime));
}
