import { Item, Trip, TripItemWithMeta } from "../utils/types";
import {
  bagSlots,
  packingBagSelectForItem,
  packingUsesBagPills,
  resolvedItemBagId,
  bagTypeIconSvg,
} from "../utils/tripBags";
import { persistableTripItem } from "../utils/tripItemPersist";
import { tripItemsDB } from "../db/database";

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderTripBagControl(
  item: Item,
  trip: Trip,
  tripItem: { itemId: string; bagId?: string }
): string {
  if (!packingBagSelectForItem(item, trip.bags)) return "";
  const slots = bagSlots(trip.bags);
  if (!slots.length) return "";
  const current = resolvedItemBagId(item, trip, tripItem.bagId) || slots[0].id;
  if (!packingUsesBagPills(trip.bags)) {
    return `
    <div data-bag-area>
      <select class="bag-select" data-bag="${escHtml(tripItem.itemId)}" aria-label="Bag">
        ${slots.map((s) => `<option value="${escHtml(s.id)}"${s.id === current ? " selected" : ""}>${escHtml(s.label)}</option>`).join("")}
      </select>
    </div>
    `;
  }
  return `
    <div data-bag-area>
      <div class="bag-pills" role="radiogroup" aria-label="Bag">
        ${slots.map((s) => {
          const on = s.id === current;
          const num = s.typeCount > 1
            ? `<span class="bag-pill__num">${s.index}</span>`
            : "";
          return `<button type="button" class="bag-pill${on ? " bag-pill--selected" : ""}" role="radio" aria-checked="${on ? "true" : "false"}" aria-label="${escHtml(s.label)}" title="${escHtml(s.label)}" data-bag="${escHtml(tripItem.itemId)}" data-bag-id="${escHtml(s.id)}"><span class="bag-pill__icon">${bagTypeIconSvg(s.type)}</span>${num}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

export function bindTripBagControls(
  container: HTMLElement,
  getItems: () => TripItemWithMeta[],
): void {
  container.querySelectorAll<HTMLButtonElement>("[data-bag-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.bag!;
      const bagId = btn.dataset.bagId!;
      const ti = getItems().find((i) => i.itemId === itemId);
      if (!ti) return;
      ti.bagId = bagId;
      await tripItemsDB.put(persistableTripItem(ti));
      const group = btn.closest("[data-bag-area]");
      group?.querySelectorAll<HTMLButtonElement>("[data-bag-id]").forEach((other) => {
        const on = other.dataset.bagId === bagId;
        other.classList.toggle("bag-pill--selected", on);
        other.setAttribute("aria-checked", on ? "true" : "false");
      });
    });
  });

  container.querySelectorAll<HTMLSelectElement>("select[data-bag]").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      e.stopPropagation();
      const itemId = sel.dataset.bag!;
      const ti = getItems().find((i) => i.itemId === itemId);
      if (!ti) return;
      ti.bagId = sel.value;
      await tripItemsDB.put(persistableTripItem(ti));
    });
  });
}
