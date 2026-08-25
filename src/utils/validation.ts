import { Item, ItemStage, ItemType, Trip, TripItem } from "./types";
import { parseTripInstant } from "./timeEngine";

const ITEM_TYPES: ItemType[] = ["PACK", "WEAR", "CARRY", "TODO"];
const ITEM_STAGES: ItemStage[] = ["EARLY", "MID", "LAST_MINUTE", "POST"];

export function isValidIsoDate(value: string | undefined): boolean {
  if (!value) return false;
  const t = parseTripInstant(value);
  return !Number.isNaN(t);
}

export function validateItem(item: Partial<Item>): string | null {
  if (typeof item.id !== "string" || !item.id.trim()) return "Item id is required.";
  if (typeof item.name !== "string" || !item.name.trim()) return "Item name is required.";
  if (typeof item.category !== "string" || !item.category.trim()) return "Item category is required.";
  if (!item.type || !ITEM_TYPES.includes(item.type)) return "Item type is invalid.";
  if (!item.stage || !ITEM_STAGES.includes(item.stage)) return "Item stage is invalid.";
  if (item.defaultCount == null || item.defaultCount < 1 || !Number.isFinite(item.defaultCount)) {
    return "Item count must be at least 1.";
  }
  return null;
}

export function validateTrip(trip: Partial<Trip>): string | null {
  if (!trip.id || !trip.id.trim()) return "Trip id is required.";
  if (!trip.name || !trip.name.trim()) return "Please enter a trip name.";
  if (!trip.location || !trip.location.trim()) return "Please enter a destination.";
  if (!isValidIsoDate(trip.startTime)) return "Please set a valid departure date.";
  if (trip.endTime) {
    if (!isValidIsoDate(trip.endTime)) return "Return date is invalid.";
    if (parseTripInstant(trip.endTime) < parseTripInstant(trip.startTime)) {
      return "Return date must be on or after departure.";
    }
  }
  return null;
}

export function validateTripItem(ti: Partial<TripItem>): string | null {
  if (!ti.tripId) return "Trip item is missing tripId.";
  if (!ti.itemId) return "Trip item is missing itemId.";
  if (ti.count == null || ti.count < 1 || !Number.isFinite(ti.count)) return "Count must be at least 1.";
  if (typeof ti.isSelected !== "boolean") return "isSelected must be a boolean.";
  if (typeof ti.isPacked !== "boolean") return "isPacked must be a boolean.";
  return null;
}

export function assertValid<T>(value: T, error: string | null): T {
  if (error) throw new Error(error);
  return value;
}
