import { Item, ItemStage, ItemType, Trip, TripItem, TripItemWithMeta, TripPhase } from "../utils/types";
import { itemsDB, tripItemsDB } from "../db/database";
import { getPhase, parseTripInstant } from "../utils/timeEngine";
import { fuzzySearchByText } from "../utils/search";
import { validateItem, validateTripItem } from "../utils/validation";
import { computeProgress, derivePackingState, sortTripItems } from "../utils/packingLogic";
import { displayCategory, itemMatchesTrip } from "../utils/tripFilter";

export type { TripItemWithMeta };
export { computeProgress, derivePackingState, sortTripItems, displayCategory };

const MW = ["man", "woman"];
const ESS = ["Essentials"];

function bi(
  id: string,
  name: string,
  category: string,
  type: ItemType,
  stage: ItemStage,
  defaultCount: number,
  extra: Partial<Item> = {}
): Item {
  return {
    id,
    name,
    category,
    type,
    stage,
    defaultCount,
    travellers: extra.travellers ?? MW,
    types: extra.types ?? ESS,
    subcategory: extra.subcategory ?? (extra.types && extra.types[0]) ?? "Essentials",
    ...(extra.weathers ? { weathers: extra.weathers } : {}),
    ...(extra.vehicles ? { vehicles: extra.vehicles } : {}),
  };
}

export const BASE_ITEMS: Item[] = [
  bi("i_tshirts", "T-Shirts", "Clothing", "PACK", "EARLY", 3),
  bi("i_pants", "Pants", "Clothing", "PACK", "EARLY", 2),
  bi("i_underwear", "Underwear", "Clothing", "PACK", "EARLY", 4),
  bi("i_socks", "Socks", "Clothing", "PACK", "EARLY", 4),
  bi("i_jacket", "Jacket", "Clothing", "PACK", "MID", 1, { weathers: ["cold", "snowy"] }),
  bi("i_shoes", "Shoes", "Clothing", "WEAR", "LAST_MINUTE", 1),
  bi("i_pajamas", "Pajamas", "Clothing", "PACK", "EARLY", 1),
  bi("i_swimwear", "Swimwear", "Clothing", "PACK", "MID", 1, { types: ["Beach", "Swimming"], subcategory: "Beach" }),

  bi("i_toothbrush", "Toothbrush", "Toiletries", "PACK", "MID", 1),
  bi("i_toothpaste", "Toothpaste", "Toiletries", "PACK", "MID", 1),
  bi("i_shampoo", "Shampoo", "Toiletries", "PACK", "MID", 1),
  bi("i_soap", "Soap / Body Wash", "Toiletries", "PACK", "MID", 1),
  bi("i_deodorant", "Deodorant", "Toiletries", "PACK", "MID", 1),
  bi("i_razor", "Razor", "Toiletries", "PACK", "MID", 1),
  bi("i_sunscreen", "Sunscreen", "Toiletries", "PACK", "MID", 1, {
    types: ["Beach", "Essentials"],
    weathers: ["hot", "warm-weather"],
    subcategory: "Beach",
  }),

  bi("i_phone", "Phone", "Electronics", "CARRY", "LAST_MINUTE", 1),
  bi("i_charger", "Phone Charger", "Electronics", "PACK", "MID", 1),
  bi("i_headphones", "Headphones", "Electronics", "CARRY", "LAST_MINUTE", 1),
  bi("i_laptop", "Laptop", "Electronics", "CARRY", "MID", 1, { types: ["Business"], subcategory: "Business" }),
  bi("i_camera", "Camera", "Electronics", "PACK", "MID", 1, { types: ["Photography"], subcategory: "Photography" }),
  bi("i_powerbank", "Power Bank", "Electronics", "CARRY", "MID", 1),
  bi("i_adapter", "Travel Adapter", "Electronics", "PACK", "EARLY", 1, {
    types: ["International"],
    subcategory: "International",
  }),

  bi("i_passport", "Passport", "Documents", "CARRY", "LAST_MINUTE", 1, {
    types: ["International"],
    subcategory: "International",
  }),
  bi("i_id", "ID Card", "Documents", "CARRY", "LAST_MINUTE", 1),
  bi("i_tickets", "Travel Tickets", "Documents", "CARRY", "LAST_MINUTE", 1, {
    types: ["Essentials", "flight"],
    vehicles: ["flight"],
  }),
  bi("i_insurance", "Travel Insurance", "Documents", "CARRY", "EARLY", 1),
  bi("i_hotel_conf", "Hotel Confirmation", "Documents", "CARRY", "MID", 1),

  bi("i_medicine", "Prescription Medicine", "Health", "PACK", "EARLY", 1),
  bi("i_painkiller", "Painkillers", "Health", "PACK", "MID", 1),
  bi("i_bandaids", "Band-Aids", "Health", "PACK", "MID", 1),
  bi("i_vitamins", "Vitamins", "Health", "PACK", "EARLY", 1),
  bi("i_handsan", "Hand Sanitizer", "Health", "CARRY", "LAST_MINUTE", 1),
  bi("i_mask", "Face Mask", "Health", "CARRY", "LAST_MINUTE", 2),

  bi("i_wallet", "Wallet", "Money & Cards", "CARRY", "LAST_MINUTE", 1),
  bi("i_cash", "Cash", "Money & Cards", "CARRY", "LAST_MINUTE", 1),
  bi("i_creditcard", "Credit Card", "Money & Cards", "CARRY", "LAST_MINUTE", 1),

  bi("i_suitcase", "Suitcase / Bag", "Bag & Travel", "PACK", "EARLY", 1),
  bi("i_daypack", "Day Backpack", "Bag & Travel", "CARRY", "MID", 1, {
    types: ["Hiking", "Backpacking", "Essentials"],
    subcategory: "Hiking",
  }),
  bi("i_locks", "Bag Locks", "Bag & Travel", "PACK", "MID", 2),
  bi("i_tags", "Luggage Tags", "Bag & Travel", "PACK", "EARLY", 2),

  bi("i_notify_neighbor", "Notify Neighbor", "Pre-Trip Tasks", "TODO", "EARLY", 1),
  bi("i_stop_mail", "Stop Mail / Delivery", "Pre-Trip Tasks", "TODO", "EARLY", 1),
  bi("i_charge_devices", "Charge All Devices", "Pre-Trip Tasks", "TODO", "LAST_MINUTE", 1),
  bi("i_lock_home", "Lock Home / Windows", "Pre-Trip Tasks", "TODO", "LAST_MINUTE", 1),
  bi("i_water_plants", "Water Plants", "Pre-Trip Tasks", "TODO", "LAST_MINUTE", 1),
];

export async function seedBaseItems(): Promise<void> {
  const existing = await itemsDB.getAll();
  const baseIds = new Set(BASE_ITEMS.map((i) => i.id));
  const custom = existing.filter((i) => !baseIds.has(i.id));
  await itemsDB.putMany([...BASE_ITEMS, ...custom]);
}

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

export function fuzzySearch(items: TripItemWithMeta[], query: string): TripItemWithMeta[] {
  return fuzzySearchByText(items, query, (ti) => [ti.item.name, ti.item.category, displayCategory(ti.item)]);
}

export function getCategories(items: TripItemWithMeta[]): string[] {
  return [...new Set(items.map((ti) => displayCategory(ti.item)))].sort();
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
