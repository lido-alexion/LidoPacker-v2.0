import { Item, ScheduledNotification, Trip, TripItem } from "../utils/types";

const DB_NAME = "LidoPackerDB";
/** Bumped to 4 so devices already on v3 get the `meta` store (catalog last_updated). */
const DB_VERSION = 4;
const STORE_NAMES = [
  "items",
  "trips",
  "tripItems",
  "scheduledNotifications",
  "meta",
] as const;

export interface MetaRow {
  key: string;
  value: string;
}

let db: IDBDatabase | null = null;

function ensureStores(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains("items")) {
    const itemStore = database.createObjectStore("items", { keyPath: "id" });
    itemStore.createIndex("category", "category", { unique: false });
    itemStore.createIndex("stage", "stage", { unique: false });
  }

  if (!database.objectStoreNames.contains("trips")) {
    database.createObjectStore("trips", { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains("tripItems")) {
    const tripItemStore = database.createObjectStore("tripItems", {
      keyPath: ["tripId", "itemId"],
    });
    tripItemStore.createIndex("tripId", "tripId", { unique: false });
    tripItemStore.createIndex("itemId", "itemId", { unique: false });
  }

  if (!database.objectStoreNames.contains("scheduledNotifications")) {
    const nStore = database.createObjectStore("scheduledNotifications", { keyPath: "id" });
    nStore.createIndex("tripId", "tripId", { unique: false });
    nStore.createIndex("fireAt", "fireAt", { unique: false });
  }

  if (!database.objectStoreNames.contains("meta")) {
    database.createObjectStore("meta", { keyPath: "key" });
  }
}

function missingStores(database: IDBDatabase): string[] {
  return STORE_NAMES.filter((name) => !database.objectStoreNames.contains(name));
}

function openAtVersion(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version == null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);

    request.onupgradeneeded = (event) => {
      ensureStores((event.target as IDBOpenDBRequest).result);
    };

    request.onblocked = () => {
      console.warn("IndexedDB open is blocked by another tab. Close other LidoPacker tabs and refresh.");
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      reject(request.error || new Error("Could not open local storage."));
    };
  });
}

export async function initDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("This browser cannot save trips on the device.");
  }

  let database: IDBDatabase;
  try {
    database = await openAtVersion(DB_VERSION);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name !== "VersionError") throw err;
    // This profile already has a newer schema from an earlier local build.
    database = await openAtVersion();
  }

  const missing = missingStores(database);
  if (missing.length) {
    database.close();
    throw new Error(`Local database is missing: ${missing.join(", ")}.`);
  }

  db = database;
  return database;
}

function getDB(): IDBDatabase {
  if (!db) throw new Error("DB not initialized");
  return db;
}

function hasStore(store: string): boolean {
  return getDB().objectStoreNames.contains(store);
}

function txGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function txGetAll<T>(store: string, index?: string, query?: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readonly");
    const os = tx.objectStore(store);
    const req = index ? os.index(index).getAll(query) : os.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function cloneForStore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function txPut<T>(store: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Write was aborted"));
    tx.objectStore(store).put(cloneForStore(value));
  });
}

function txPutMany<T>(store: string, items: T[]): Promise<void> {
  if (!items.length) return Promise.resolve();
  const CHUNK = 100;
  const putChunk = (chunk: T[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = getDB().transaction(store, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Write was aborted"));
      const os = tx.objectStore(store);
      for (const item of chunk) os.put(cloneForStore(item));
    });
  let chain = Promise.resolve();
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    chain = chain.then(() => putChunk(chunk));
  }
  return chain;
}

function txDeleteMany(store: string, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Delete was aborted"));
    const os = tx.objectStore(store);
    for (const key of keys) os.delete(key);
  });
}

function txDelete(store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const itemsDB = {
  getAll: () => txGetAll<Item>("items"),
  getById: (id: string) => txGet<Item>("items", id),
  getByCategory: (category: string) => txGetAll<Item>("items", "category", category),
  put: (item: Item) => txPut("items", item),
  delete: (id: string) => txDelete("items", id),
  deleteMany: (ids: string[]) => txDeleteMany("items", ids),
  putMany: (items: Item[]) => txPutMany("items", items),
};

export const metaDB = {
  get: (key: string) => txGet<MetaRow>("meta", key),
  put: (row: MetaRow) => txPut("meta", row),
  getValue: async (key: string): Promise<string | undefined> => {
    if (!hasStore("meta")) return undefined;
    const row = await txGet<MetaRow>("meta", key);
    return row?.value;
  },
  setValue: async (key: string, value: string) => {
    if (!hasStore("meta")) {
      console.warn("meta store missing; catalog date was not saved.");
      return;
    }
    await txPut("meta", { key, value });
  },
};

export const tripsDB = {
  getAll: () => txGetAll<Trip>("trips"),
  getById: (id: string) => txGet<Trip>("trips", id),
  put: (trip: Trip) => txPut("trips", trip),
  delete: (id: string) => txDelete("trips", id),
};

export const tripItemsDB = {
  getAll: () => txGetAll<TripItem>("tripItems"),
  getByTrip: (tripId: string) => txGetAll<TripItem>("tripItems", "tripId", tripId),
  get: (tripId: string, itemId: string) =>
    txGet<TripItem>("tripItems", [tripId, itemId]),
  put: (tripItem: TripItem) => txPut("tripItems", tripItem),
  putMany: (items: TripItem[]) => txPutMany("tripItems", items),
  deleteMany: (keys: Array<[string, string]>) => txDeleteMany("tripItems", keys),
  deleteByTrip: async (tripId: string) => {
    const items = await txGetAll<TripItem>("tripItems", "tripId", tripId);
    await txDeleteMany("tripItems", items.map((item) => [item.tripId, item.itemId]));
  },
};

export const notificationsDB = {
  getAll: () => txGetAll<ScheduledNotification>("scheduledNotifications"),
  getByTrip: (tripId: string) =>
    txGetAll<ScheduledNotification>("scheduledNotifications", "tripId", tripId),
  put: (n: ScheduledNotification) => txPut("scheduledNotifications", n),
  putMany: (rows: ScheduledNotification[]) => txPutMany("scheduledNotifications", rows),
  delete: (id: string) => txDelete("scheduledNotifications", id),
  deleteByTrip: async (tripId: string) => {
    const rows = await txGetAll<ScheduledNotification>("scheduledNotifications", "tripId", tripId);
    await txDeleteMany("scheduledNotifications", rows.map((row) => row.id));
  },
};
