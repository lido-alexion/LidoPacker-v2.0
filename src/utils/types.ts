export type ItemType = "PACK" | "WEAR" | "CARRY" | "TODO";
export type ItemStage = "EARLY" | "MID" | "LAST_MINUTE" | "POST";
export type TripPhase = "EARLY" | "MID" | "LAST_MINUTE" | "POST";

export type NotificationKind = "pre48" | "pre6" | "departure" | "forgot";

export interface Item {
  id: string;
  name: string;
  category: string;
  /** v1 subcategory; packing UI shows this as the single grouping level when set. */
  subcategory?: string;
  type: ItemType;
  stage: ItemStage;
  /** Preferred quantity. 0 means N/A (tasks that are not counted). */
  defaultCount: number;
  /** Optional bag this item usually goes in (custom items; catalog rows omit it). */
  luggage?: string;
  travellers?: string[];
  weathers?: string[];
  vehicles?: string[];
  types?: string[];
}

export interface TripBag {
  type: string;
  count: number;
}

export interface Trip {
  id: string;
  name: string;
  location: string;
  /** ISO datetime, or YYYY-MM-DD when time is omitted. */
  startTime: string;
  endTime?: string;
  timezone?: string;   // IANA zone, e.g. "Asia/Kolkata"
  isArchived?: boolean;
  travellers?: string[];
  vehicles?: string[];
  weathers?: string[];
  types?: string[];
  /** Bags taken on this trip. Empty/omitted means packing has no bag picker. */
  bags?: TripBag[];
}

export interface TripItem {
  tripId: string;
  itemId: string;
  count: number;
  isSelected: boolean;
  isPacked: boolean;
  /** Packing slot, e.g. carry:1 or luggage:2. Omitted when the trip has no bags. */
  bagId?: string;
}

export interface TripItemWithMeta extends TripItem {
  item: Item;
}

export interface ScheduledNotification {
  id: string;
  tripId: string;
  kind: NotificationKind;
  fireAt: number;
  title: string;
  body: string;
  fired: boolean;
}

export type Route =
  | { name: "home" }
  | { name: "create-trip" }
  | { name: "edit-trip"; tripId: string }
  | { name: "clone-trip"; tripId: string }
  | { name: "item-selection"; tripId: string }
  | { name: "packing"; tripId: string };

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";
