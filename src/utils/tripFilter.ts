import { Item, Trip } from "./types";

function lower(values: string[] | undefined): string[] {
  return (values || []).map((v) => v.toLowerCase());
}

/** v1 fetchAllItems: overlap on tagged dimensions; untagged item matches that dimension. */
export function itemMatchesTrip(item: Item, trip: Trip): boolean {
  const tripTravellers = trip.travellers || [];
  const itemTravellers = item.travellers || [];
  if (tripTravellers.length && itemTravellers.length) {
    if (!tripTravellers.some((t) => itemTravellers.includes(t))) return false;
  }

  const tripWeathers = trip.weathers || [];
  const itemWeathers = item.weathers || [];
  if (tripWeathers.length && itemWeathers.length) {
    if (!tripWeathers.some((t) => itemWeathers.includes(t))) return false;
  }

  const tripTypes = [
    ...lower(trip.types),
    ...lower(trip.vehicles),
  ];
  const itemTypes = [
    ...lower(item.types),
    ...lower(item.vehicles),
  ];
  if (tripTypes.length && itemTypes.length) {
    if (!tripTypes.some((t) => itemTypes.includes(t))) return false;
  }

  return true;
}

/**
 * Single-level grouping: v1 subcategory when present, else category.
 *
 * An item can carry several `types` tags (e.g. Swimwear is tagged both
 * "Beach" and "Swimming") but only one `subcategory` is used as its display
 * label. Without a trip, that raw subcategory is shown (used by contexts
 * that already know the item is relevant, e.g. the packing screen).
 *
 * When a `trip` is supplied, only show the item's own subcategory label if
 * the trip actually selected that specific tag (or the subcategory is a
 * generic bucket the item has no tag for, e.g. "Essentials"). Otherwise fall
 * back to the item's broader `category` (e.g. "Clothing", "Toiletries").
 * This keeps the tabs shown while picking items limited to what the
 * traveller actually selected, instead of surfacing categories such as
 * "Beach" or "Hiking" purely because an item happened to also match on a
 * different, selected tag (e.g. "Swimming" or "Essentials").
 */
export function displayCategory(item: Item, trip?: Trip): string {
  const sub = item.subcategory && item.subcategory.trim();
  if (!sub) return item.category;
  if (!trip) return sub;

  const selectedTags = new Set(lower([...(trip.types || []), ...(trip.vehicles || [])]));
  const itemTags = new Set(lower(item.types));
  // Subcategories that don't correspond to one of the item's own tags (e.g.
  // the "Essentials" default) are not tag-driven, so they're always shown.
  const isTagDriven = itemTags.has(sub.toLowerCase());
  if (!isTagDriven || selectedTags.has(sub.toLowerCase())) return sub;
  return item.category;
}
