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

/** Single-level grouping: v1 subcategory when present, else category. */
export function displayCategory(item: Item): string {
  return (item.subcategory && item.subcategory.trim()) || item.category;
}
