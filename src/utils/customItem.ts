import { Item, ItemStage, ItemType, Trip } from "./types";
import { sanitiseSuggestionName } from "./suggestion";
import { validateItem } from "./validation";
import { BAG_TYPES, defaultLuggageType, normalizeBagType } from "./tripBags";

export const ITEM_CATEGORIES = [
  "Clothing",
  "Hygiene",
  "Health",
  "Documents",
  "Gadgets",
  "Miscellaneous",
  "Foods",
  "ToDos",
];

export const ITEM_TYPE_OPTIONS: { id: ItemType; label: string }[] = [
  { id: "PACK", label: "Pack" },
  { id: "WEAR", label: "Wear" },
  { id: "CARRY", label: "Carry" },
  { id: "TODO", label: "Task" },
];

export const ITEM_STAGE_OPTIONS: { id: ItemStage; label: string }[] = [
  { id: "EARLY", label: "Early" },
  { id: "MID", label: "Mid trip" },
  { id: "LAST_MINUTE", label: "Last minute" },
  { id: "POST", label: "After departure" },
];

export const LUGGAGE_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "Not set" },
  ...BAG_TYPES,
  { id: "wear", label: "Wear / on person" },
];

export interface CustomItemDraft {
  name: string;
  category: string;
  subcategory: string;
  type: ItemType;
  stage: ItemStage;
  /** 0 = N/A */
  defaultCount: number;
  luggage: string;
  travellers: string[];
  vehicles: string[];
  weathers: string[];
  types: string[];
}

export function luggageLabel(id: string | undefined): string {
  if (!id) return "";
  const type = normalizeBagType(id);
  return LUGGAGE_OPTIONS.find((o) => o.id === type)?.label || id;
}

export function uniqueExistingLabels(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v && v.toLowerCase() !== "custom"))]
    .sort((a, b) => a.localeCompare(b));
}

export function draftFromTrip(name: string, trip: Trip): CustomItemDraft {
  return {
    name: sanitiseSuggestionName(name),
    category: "",
    subcategory: "",
    type: "PACK",
    stage: "MID",
    defaultCount: 1,
    luggage: defaultLuggageType(trip),
    travellers: [],
    vehicles: [],
    weathers: [],
    types: [],
  };
}

function copyIfAny(values: string[]): string[] | undefined {
  return values.length ? [...values] : undefined;
}

export function buildCustomItem(draft: CustomItemDraft, id?: string): Item {
  const count = Number.isFinite(draft.defaultCount) ? Math.floor(draft.defaultCount) : 0;
  const subcategory = draft.subcategory.trim();
  const luggage = normalizeBagType(draft.luggage);
  const item: Item = {
    id: id || `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: sanitiseSuggestionName(draft.name),
    category: draft.category.trim() || "Custom",
    type: draft.type,
    stage: draft.stage,
    defaultCount: count < 0 ? 0 : count,
    ...(subcategory ? { subcategory } : {}),
    ...(luggage ? { luggage } : {}),
    ...(copyIfAny(draft.travellers) ? { travellers: copyIfAny(draft.travellers) } : {}),
    ...(copyIfAny(draft.weathers) ? { weathers: copyIfAny(draft.weathers) } : {}),
    ...(copyIfAny(draft.vehicles) ? { vehicles: copyIfAny(draft.vehicles) } : {}),
    ...(copyIfAny(draft.types) ? { types: copyIfAny(draft.types) } : {}),
  };
  const err = validateItem(item);
  if (err) throw new Error(err);
  return item;
}

/** Quantity written onto a trip row from a catalog/custom item. 0 stays N/A. */
export function tripItemCountFor(item: Item): number {
  if (item.defaultCount == null || !Number.isFinite(item.defaultCount) || item.defaultCount < 0) {
    return 1;
  }
  return Math.floor(item.defaultCount);
}
