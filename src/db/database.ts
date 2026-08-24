import { Item, ScheduledNotification, Trip, TripItem } from "../utils/types";

const DB_NAME = "LidoPackerDB";
const DB_VERSION = 2;

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

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
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function getDB(): IDBDatabase {
  if (!db) throw new Error("DB not initialized");
  return db;
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
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Write was aborted"));
    const os = tx.objectStore(store);
    for (const item of items) os.put(cloneForStore(item));
  });
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
  putMany: (items: Item[]) => txPutMany("items", items),
};

export const tripsDB = {
  getAll: () => txGetAll<Trip>("trips"),
  getById: (id: string) => txGet<Trip>("trips", id),
  put: (trip: Trip) => txPut("trips", trip),
  delete: (id: string) => txDelete("trips", id),
};

export const tripItemsDB = {
  getByTrip: (tripId: string) => txGetAll<TripItem>("tripItems", "tripId", tripId),
  get: (tripId: string, itemId: string) =>
    txGet<TripItem>("tripItems", [tripId, itemId]),
  put: (tripItem: TripItem) => txPut("tripItems", tripItem),
  putMany: (items: TripItem[]) => txPutMany("tripItems", items),
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
