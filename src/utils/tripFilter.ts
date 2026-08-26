import { Item, Trip } from "./types";
import { ITEM_CATEGORIES } from "./customItem";

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

/** Catalog / custom-item category used as a tab (Clothing, Hygiene, ToDos, …). */
export function itemCategory(item: Pick<Item, "category">): string {
  return (item.category || "").trim() || "Miscellaneous";
}

/** Grouping header inside a category tab. */
export function itemSubcategory(item: Pick<Item, "category" | "subcategory">): string {
  const sub = item.subcategory?.trim();
  return sub || itemCategory(item);
}

/** Section title: subcategory, or "Clothing · Beach" when mixing categories (search). */
export function itemGroupLabel(item: Pick<Item, "category" | "subcategory">, opts?: { prefixCategory?: boolean }): string {
  const cat = itemCategory(item);
  const sub = itemSubcategory(item);
  if (opts?.prefixCategory && sub !== cat) return `${cat} · ${sub}`;
  return sub;
}

/** Tabs in catalog order, then any extra categories A–Z. */
export function categoryTabsFor(items: { item: Pick<Item, "category"> }[]): string[] {
  const present = new Set(items.map((row) => itemCategory(row.item)));
  const extras = [...present]
    .filter((cat) => !ITEM_CATEGORIES.includes(cat))
    .sort((a, b) => a.localeCompare(b));
  return [...ITEM_CATEGORIES.filter((cat) => present.has(cat)), ...extras];
}

export function pickCategoryTab(tabs: string[], current: string): string {
  if (current && tabs.includes(current)) return current;
  return tabs[0] || "";
}

/** Packed / total for one catalog category among the given trip rows. */
export function categoryPackProgress(
  items: { isPacked: boolean; item: Pick<Item, "category"> }[],
  cat: string
): { packed: number; total: number } {
  let packed = 0;
  let total = 0;
  for (const row of items) {
    if (itemCategory(row.item) !== cat) continue;
    total++;
    if (row.isPacked) packed++;
  }
  return { packed, total };
}

/** Keep catalog order, but move fully packed categories to the end. */
export function orderCategoryTabsByPackProgress(
  tabs: string[],
  items: { isPacked: boolean; item: Pick<Item, "category"> }[]
): string[] {
  const incomplete: string[] = [];
  const complete: string[] = [];
  for (const cat of tabs) {
    const { packed, total } = categoryPackProgress(items, cat);
    if (total > 0 && packed === total) complete.push(cat);
    else incomplete.push(cat);
  }
  return [...incomplete, ...complete];
}

export function groupItemsByLabel<T extends { item: Pick<Item, "category" | "subcategory"> }>(
  items: T[],
  prefixCategory = false
): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const row of items) {
    const label = itemGroupLabel(row.item, { prefixCategory });
    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(row);
  }
  return order.map((label) => ({ label, items: groups.get(label)! }));
}

/**
 * Subcategory label for a single item. Kept for search ranking and tests.
 * List tabs use {@link itemCategory}; section headers use {@link itemGroupLabel}.
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
