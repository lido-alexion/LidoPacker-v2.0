import fallbackCatalogJson from "../data/catalog.json";
import { Item, TripItem } from "../utils/types";
import { itemsDB, metaDB, tripItemsDB, tripsDB } from "../db/database";
import { assetPath } from "../utils/basePath";
import {
  CATALOG_META_KEY,
  CatalogFile,
  isCatalogNewer,
  isCustomItemId,
  mergeCatalogItems,
  parseCatalogFile,
  remapLegacyBaseItems,
  isLegacyBaseItemId,
} from "../utils/catalogSync";
import { itemMatchesTrip } from "../utils/tripFilter";
import { validateTripItem } from "../utils/validation";
import { tripItemCountFor } from "../utils/customItem";
import { resolvedItemBagId } from "../utils/tripBags";

const FETCH_TIMEOUT_MS = 8000;

function bundledCatalog(): CatalogFile {
  return parseCatalogFile(fallbackCatalogJson);
}

async function fetchServerCatalog(): Promise<CatalogFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(assetPath("/catalog.json"), {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Catalog fetch failed (${res.status})`);
    }
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type.includes("text/html")) {
      throw new Error("Catalog fetch returned a web page instead of the item list.");
    }
    return parseCatalogFile(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

async function writeLegacyRemap(remap: ReturnType<typeof remapLegacyBaseItems>): Promise<void> {
  if (!remap.remapped) return;
  await tripItemsDB.putMany(remap.tripItemsToPut);
  await tripItemsDB.deleteMany(remap.tripItemKeysToDelete);
  await itemsDB.putMany(remap.itemsToPut);
  await itemsDB.deleteMany(remap.itemIdsToDelete);
}

async function applyCatalog(catalog: CatalogFile): Promise<void> {
  const existing = await itemsDB.getAll();
  const tripItems = await tripItemsDB.getAll();
  const remap = remapLegacyBaseItems(existing, tripItems, catalog.items);
  await writeLegacyRemap(remap);

  const afterItems = remap.remapped ? await itemsDB.getAll() : existing;
  const afterTripItems = remap.remapped ? await tripItemsDB.getAll() : tripItems;
  const referenced = new Set(afterTripItems.map((row) => row.itemId));
  const { toPut, toDelete } = mergeCatalogItems(afterItems, catalog.items, referenced);

  await itemsDB.putMany(toPut);
  await itemsDB.deleteMany(toDelete);
  await metaDB.setValue(CATALOG_META_KEY, catalog.last_updated);
  // Existing trips keep their selected/packed rows on catalog upgrade (v1 port
  // remaps i_* ids only). Incremental later additions still join as unselected.
  if (!remap.remapped) {
    await addMissingTripItems(catalog.items);
  }
}

/** Devices that already stored last_updated before remap finished still have i_* rows. */
async function remapLeftoverBaseItems(catalogItems: Item[]): Promise<void> {
  const existing = await itemsDB.getAll();
  if (!existing.some((item) => isLegacyBaseItemId(item.id))) return;
  const tripItems = await tripItemsDB.getAll();
  await writeLegacyRemap(remapLegacyBaseItems(existing, tripItems, catalogItems));
}

async function addMissingTripItems(catalogItems: Item[]): Promise<void> {
  const trips = await tripsDB.getAll();
  if (!trips.length) return;

  const additions: TripItem[] = [];
  for (const trip of trips) {
    const current = await tripItemsDB.getByTrip(trip.id);
    const have = new Set(current.map((row) => row.itemId));
    for (const item of catalogItems) {
      if (have.has(item.id) || !itemMatchesTrip(item, trip)) continue;
      const bagId = resolvedItemBagId(item, trip);
      const ti: TripItem = {
        tripId: trip.id,
        itemId: item.id,
        count: tripItemCountFor(item),
        isSelected: false,
        isPacked: false,
        ...(bagId ? { bagId } : {}),
      };
      if (validateTripItem(ti)) continue;
      additions.push(ti);
    }
  }
  await tripItemsDB.putMany(additions);
}

/**
 * First visit: load the server catalog into IndexedDB (bundled copy if offline).
 * Later visits: keep the IndexedDB list unless the server last_updated is newer.
 */
export async function syncCatalog(): Promise<void> {
  try {
    const localUpdated = await metaDB.getValue(CATALOG_META_KEY);
    const existing = await itemsDB.getAll();
    const hasCatalog = existing.some((item) => !isCustomItemId(item.id));

    let server: CatalogFile | null = null;
    try {
      server = await fetchServerCatalog();
    } catch (err) {
      console.warn("Catalog fetch failed:", err);
    }

    const bundled = bundledCatalog();
    const newest =
      server && isCatalogNewer(server.last_updated, bundled.last_updated) ? server : bundled;

    if (isCatalogNewer(newest.last_updated, localUpdated) || !hasCatalog) {
      await applyCatalog(newest);
    } else {
      await remapLeftoverBaseItems(newest.items);
    }
  } catch (err) {
    // Item-list refresh must not block the dashboard; trips live in other stores.
    console.error("Catalog sync failed:", err);
  }
}
