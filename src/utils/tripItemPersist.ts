import { TripItem, TripItemWithMeta } from "./types";

/** IndexedDB row only — never nest the catalog `item` (that would be dropped on some stores and is not part of the key). */
export function persistableTripItem(ti: TripItem | TripItemWithMeta): TripItem {
  const row: TripItem = {
    tripId: ti.tripId,
    itemId: ti.itemId,
    count: ti.count,
    isSelected: ti.isSelected,
    isPacked: ti.isPacked,
  };
  if (ti.bagId) row.bagId = ti.bagId;
  return row;
}
