import { tripsDB } from "../db/database";
import { router } from "../utils/router";
import {
  getTripItemsWithMeta,
  TripItemWithMeta,
  getCategories,
  fuzzySearch,
  addCustomItemToTrip,
  deleteLocalCustomItem,
  isCustomItemId,
  saveTripItem,
  ensureTripItemBagAssignments,
} from "../services/itemService";
import { showToast } from "../components/toast";
import { suggestItemToServer } from "../services/suggestionService";
import { openAddItemDialog, AddItemDialogHandle } from "../components/addItemDialog";
import { renderCategoryTabs } from "../components/categoryTabs";
import { bindTripBagControls, renderTripBagControl } from "../components/tripBagControl";
import { luggageLabel } from "../utils/customItem";
import { packingBagSelectForItem } from "../utils/tripBags";
import { itemCategory, itemGroupLabel, groupItemsByLabel, pickCategoryTab } from "../utils/tripFilter";
import { Trip } from "../utils/types";
import { initAutoHideOnScroll, getPageScrollTop, setPageScrollTop, AutoHideChromeHandle } from "../utils/scrollChrome";

let allItems: TripItemWithMeta[] = [];
let activeCategory: string = "";
let searchQuery: string = "";
let tripId: string = "";
let tripGlobal: Trip | null = null;
let chromeHandle: AutoHideChromeHandle | null = null;
let addDialog: AddItemDialogHandle | null = null;
let addFab: HTMLButtonElement | null = null;
let deleteOverlay: HTMLElement | null = null;
/** Subcategory section labels the user has collapsed (session only). */
const collapsedSections = new Set<string>();

export function teardownItemSelectionScreen(): void {
  chromeHandle?.destroy();
  chromeHandle = null;
  addDialog?.close();
  addDialog = null;
  deleteOverlay?.remove();
  deleteOverlay = null;
  addFab?.remove();
  addFab = null;
}

export async function renderItemSelectionScreen(container: HTMLElement, id: string): Promise<void> {
  tripId = id;
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  tripGlobal = trip;
  allItems = await getTripItemsWithMeta(tripId);
  await ensureTripItemBagAssignments(trip, allItems);
  activeCategory = pickCategoryTab(getCategories(allItems), "");
  searchQuery = "";

  renderUI(container, trip.name);
}

/** Catalog category used as a tab (Clothing, Hygiene, ToDos, …). */
function catFor(ti: TripItemWithMeta): string {
  return itemCategory(ti.item);
}

function sectionLabel(ti: TripItemWithMeta): string {
  return itemGroupLabel(ti.item, { prefixCategory: !!searchQuery.trim() });
}

function renderUI(
  container: HTMLElement,
  tripName: string,
  opts: { searchCaret?: number; scrollTop?: number } = {}
): void {
  const categories = getCategories(allItems);
  activeCategory = pickCategoryTab(categories, activeCategory);
  const searching = !!searchQuery.trim();
  const filtered = getFilteredItems();
  const selectedCount = filtered.filter((ti) => ti.isSelected).length;
  const allVisibleSelected = filtered.length > 0 && selectedCount === filtered.length;
  const q = searching;

  chromeHandle?.destroy();
  chromeHandle = null;

  container.innerHTML = `
    <div class="screen item-selection-screen item-selection-screen--fab-pad">
      <div class="header">
        <div class="pane-inner">
          <button class="header__back" id="back-btn">←</button>
          <div class="header__title">${escHtml(tripName)}</div>
          <button class="header__action" id="done-btn">Done</button>
        </div>
      </div>

      <div class="item-selection-toolbar">
        <div class="pane-inner">
          <div class="search-bar">
            <span class="search-bar__icon">🔍</span>
            <input type="text" id="search-input" placeholder="Search all items…" value="${escHtml(searchQuery)}" />
            ${searchQuery ? `<button class="search-bar__clear" id="clear-search">×</button>` : ""}
          </div>
          <div class="item-selection-actions">
            <span class="item-selection-count">${filtered.length} items · ${selectedCount} selected${q ? " · all categories" : ""}</span>
            <div class="item-selection-actions__btns">
              <button class="text-btn" id="select-all-btn" ${allVisibleSelected || filtered.length === 0 ? "disabled" : ""}>Select all</button>
              <button class="text-btn" id="deselect-all-btn" ${selectedCount === 0 ? "disabled" : ""}>Deselect all</button>
            </div>
          </div>
        </div>
      </div>

      ${renderCategoryTabs(categories, activeCategory, (cat) => allItems.filter((ti) => catFor(ti) === cat).length)}

      <div id="items-list">
        ${renderItemsList(filtered)}
      </div>
    </div>
  `;

  bindEvents(container, tripName);
  mountAddFab(container, tripName);
  if (opts.searchCaret !== undefined) restoreSearchFocus(container, opts.searchCaret);
  if (opts.scrollTop !== undefined) setPageScrollTop(opts.scrollTop);

  const toolbar = container.querySelector(".item-selection-toolbar") as HTMLElement | null;
  chromeHandle = initAutoHideOnScroll([toolbar]);
}

/** Current scroll offset of the screen, so re-renders (e.g. after toggling a
 *  checkbox) don't reset the list back to the top on the user. */
function currentScrollTop(_container: HTMLElement): number {
  return getPageScrollTop();
}

function renderItemsList(items: TripItemWithMeta[]): string {
  if (items.length === 0) {
    return `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No items found</div><div class="empty-state__subtitle">Add it with the + button</div></div>`;
  }

  const groups = groupItemsByLabel(items, !!searchQuery.trim());

  let html = "";
  for (const { label, items: catItems } of groups) {
    const allSelected = catItems.every(ti => ti.isSelected);
    const someSelected = catItems.some(ti => ti.isSelected);
    const checkedAttr = allSelected ? "checked" : "";
    const indeterminate = !allSelected && someSelected ? "data-indeterminate" : "";
    const collapsed = collapsedSections.has(label);

    html += `
      <div class="category-section${collapsed ? " category-section--collapsed" : ""}" data-section="${escHtml(label)}">
        <div class="category-section__header" role="button" tabindex="0" aria-expanded="${collapsed ? "false" : "true"}" data-section-toggle="${escHtml(label)}">
          <span class="category-section__chevron" aria-hidden="true"></span>
          <label class="cat-select-wrap" data-section-check>
            <input
              type="checkbox"
              class="cat-checkbox"
              data-cat-toggle="${escHtml(label)}"
              ${checkedAttr}
              ${indeterminate}
            />
          </label>
          <span class="category-section__title">${escHtml(label)}</span>
          <span class="category-section__count">${catItems.filter(ti => ti.isSelected).length}/${catItems.length}</span>
        </div>
        <div class="category-section__body">
          <div class="card card--surface" style="border-radius:0;box-shadow:none">
            ${catItems.map(renderItemRow).join("")}
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderItemRow(ti: TripItemWithMeta): string {
  const typeIcon = { PACK: "🎒", WEAR: "👔", CARRY: "✋", TODO: "✅" }[ti.item.type] || "";
  const showTripBag = tripGlobal ? packingBagSelectForItem(ti.item, tripGlobal.bags) : false;
  const bag = showTripBag ? "" : luggageLabel(ti.item.luggage);
  const bagControl = tripGlobal ? renderTripBagControl(ti.item, tripGlobal, ti) : "";
  const qty = ti.count < 1
    ? `<span class="item-row__na">N/A</span>`
    : `<div class="stepper">
          <button class="stepper__btn" data-dec="${ti.itemId}" ${ti.count <= 1 ? "disabled" : ""}>−</button>
          <span class="stepper__value" id="count-${ti.itemId}">${ti.count}</span>
          <button class="stepper__btn" data-inc="${ti.itemId}">+</button>
        </div>`;
  return `
    <div class="item-row item-row--selectable" data-item-id="${ti.itemId}" data-check-row="${ti.itemId}">
      <div class="checkbox-wrap">
        <input type="checkbox" ${ti.isSelected ? "checked" : ""} data-check="${ti.itemId}" />
      </div>
      <div class="item-row__info">
        <div class="item-row__name">${escHtml(ti.item.name)}</div>
        <div class="item-row__meta">
          <span class="item-row__type">${typeIcon} ${ti.item.type}</span>
          <span class="badge badge--muted">${ti.item.stage}</span>
          ${bag ? `<span class="badge badge--muted">${escHtml(bag)}</span>` : ""}
        </div>
      </div>
      <div class="item-row__actions item-row__actions--prep">
        ${bagControl}
        <div data-stepper-area>${qty}</div>
        ${isCustomItemId(ti.itemId)
          ? `<button type="button" class="item-row__delete" data-delete-item="${ti.itemId}" aria-label="Delete ${escHtml(ti.item.name)}" title="Delete from your list">🗑</button>`
          : ""}
      </div>
    </div>
  `;
}

function getFilteredItems(): TripItemWithMeta[] {
  // A query searches across every category; otherwise one catalog-category tab.
  let items = searchQuery.trim()
    ? allItems
    : allItems.filter((ti) => catFor(ti) === activeCategory);
  if (searchQuery) items = fuzzySearch(items, searchQuery);
  return items;
}

async function setSelection(items: TripItemWithMeta[], selected: boolean, container: HTMLElement, tripName: string): Promise<void> {
  const scrollTop = currentScrollTop(container);
  for (const ti of items) {
    ti.isSelected = selected;
    await saveTripItem(ti);
  }
  renderUI(container, tripName, { scrollTop });
}

function bindEvents(container: HTMLElement, tripName: string): void {
  container.querySelectorAll<HTMLInputElement>("[data-indeterminate]").forEach(cb => {
    cb.indeterminate = true;
  });

  container.querySelector("#back-btn")?.addEventListener("click", () => router.navigate({ name: "home" }));
  container.querySelector("#done-btn")?.addEventListener("click", () => {
    if (!allItems.some((ti) => ti.isSelected)) {
      showToast("Select items to pack");
      return;
    }
    router.navigate({ name: "packing", tripId });
  });

  const searchInput = container.querySelector("#search-input") as HTMLInputElement;
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderUI(container, tripName, { searchCaret: searchInput.selectionStart ?? searchQuery.length });
  });
  container.querySelector("#clear-search")?.addEventListener("click", () => {
    searchQuery = "";
    renderUI(container, tripName);
  });

  container.querySelector("#select-all-btn")?.addEventListener("click", async () => {
    await setSelection(getFilteredItems(), true, container, tripName);
  });
  container.querySelector("#deselect-all-btn")?.addEventListener("click", async () => {
    await setSelection(getFilteredItems(), false, container, tripName);
  });

  container.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = (btn as HTMLElement).dataset.cat!;
      searchQuery = "";
      renderUI(container, tripName, { scrollTop: 0 });
    });
  });

  container.querySelectorAll<HTMLElement>("[data-section-toggle]").forEach((header) => {
    const toggle = () => {
      const label = header.dataset.sectionToggle!;
      if (collapsedSections.has(label)) collapsedSections.delete(label);
      else collapsedSections.add(label);
      const section = header.closest(".category-section");
      const collapsed = collapsedSections.has(label);
      section?.classList.toggle("category-section--collapsed", collapsed);
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };
    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-section-check]")) return;
      toggle();
    });
    header.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).closest("[data-section-check]")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  container.querySelectorAll<HTMLInputElement>("[data-cat-toggle]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const cat = cb.dataset.catToggle!;
      const catItems = getFilteredItems().filter((ti) => sectionLabel(ti) === cat);
      const shouldSelect = !catItems.every(ti => ti.isSelected);
      await setSelection(catItems, shouldSelect, container, tripName);
    });
  });

  container.querySelectorAll<HTMLElement>("[data-check-row]").forEach((row) => {
    row.addEventListener("click", async (e) => {
      if ((e.target as HTMLElement).closest("[data-stepper-area], [data-bag-area], [data-delete-item]")) return;
      // The row's own checkbox already has a "change" handler below; without
      // this guard, clicking the checkbox fires both handlers (the click
      // bubbling from the checkbox, plus its native change event), toggling
      // selection and re-rendering twice per click.
      if ((e.target as HTMLElement).closest("input")) return;
      const itemId = row.dataset.checkRow!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti) {
        const scrollTop = currentScrollTop(container);
        ti.isSelected = !ti.isSelected;
        await saveTripItem(ti);
        renderUI(container, tripName, { scrollTop });
      }
    });
  });

  container.querySelectorAll("[data-check]").forEach((cb) => {
    cb.addEventListener("change", async (e) => {
      e.stopPropagation();
      const itemId = (cb as HTMLElement).dataset.check!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti) {
        const scrollTop = currentScrollTop(container);
        ti.isSelected = (cb as HTMLInputElement).checked;
        await saveTripItem(ti);
        renderUI(container, tripName, { scrollTop });
      }
    });
  });

  container.querySelectorAll("[data-inc]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const itemId = (btn as HTMLElement).dataset.inc!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti) {
        ti.count++;
        await saveTripItem(ti);
        const el = container.querySelector(`#count-${itemId}`);
        if (el) el.textContent = String(ti.count);
        const decBtn = container.querySelector(`[data-dec="${itemId}"]`) as HTMLButtonElement;
        if (decBtn) decBtn.disabled = ti.count <= 1;
      }
    });
  });

  bindTripBagControls(container, () => allItems);

  container.querySelectorAll<HTMLButtonElement>("[data-delete-item]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.deleteItem!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti) confirmDeleteCustomItem(ti, container, tripName);
    });
  });

  container.querySelectorAll("[data-dec]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const itemId = (btn as HTMLElement).dataset.dec!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti && ti.count > 1) {
        ti.count--;
        await saveTripItem(ti);
        const el = container.querySelector(`#count-${itemId}`);
        if (el) el.textContent = String(ti.count);
        const decBtn = container.querySelector(`[data-dec="${itemId}"]`) as HTMLButtonElement;
        if (decBtn) decBtn.disabled = ti.count <= 1;
      }
    });
  });
}

function mountAddFab(container: HTMLElement, tripName: string): void {
  addFab?.remove();
  const fab = document.createElement("button");
  fab.className = "fab fab--sm";
  fab.id = "fab-add-item";
  fab.title = "Add item";
  fab.setAttribute("aria-label", "Add item");
  fab.textContent = "+";
  container.appendChild(fab);
  addFab = fab;
  fab.addEventListener("click", () => {
    openAddDialog(container, tripName, searchQuery.trim());
  });
}

function openAddDialog(container: HTMLElement, tripName: string, presetName: string): void {
  if (!tripGlobal) return;
  addDialog?.close();
  let added = false;
  addDialog = openAddItemDialog({
    trip: tripGlobal,
    presetName,
    categories: allItems.map((ti) => ti.item.category),
    subcategories: allItems.map((ti) => ti.item.subcategory || ""),
    onSave: async (draft) => {
      if (!tripGlobal) return;
      const newItem = await addCustomItemToTrip(draft, tripGlobal);
      suggestItemToServer(newItem.name, newItem.category);
      allItems = await getTripItemsWithMeta(tripId);
      searchQuery = "";
      activeCategory = itemCategory(newItem);
      added = true;
      showToast(`“${newItem.name}” added`);
    },
    onDone: () => {
      addDialog = null;
      if (added) renderUI(container, tripName);
    },
  });
}

function confirmDeleteCustomItem(ti: TripItemWithMeta, container: HTMLElement, tripName: string): void {
  deleteOverlay?.remove();
  const overlay = document.createElement("div");
  overlay.className = "overlay overlay--delete-item";
  overlay.innerHTML = `
    <div class="overlay__dialog" role="dialog" aria-labelledby="delete-item-title">
      <div class="overlay__title" id="delete-item-title">Delete this item?</div>
      <div class="overlay__message">“${escHtml(ti.item.name)}” will be removed from your lists on this device. The shared suggestion list is not changed.</div>
      <div class="overlay__actions">
        <button class="btn btn--secondary" type="button" style="flex:1" id="cancel-delete-item">Cancel</button>
        <button class="btn btn--danger" type="button" style="flex:1" id="confirm-delete-item">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  deleteOverlay = overlay;

  const dismiss = () => {
    overlay.remove();
    if (deleteOverlay === overlay) deleteOverlay = null;
  };

  overlay.querySelector("#cancel-delete-item")?.addEventListener("click", dismiss);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismiss();
  });
  overlay.querySelector("#confirm-delete-item")?.addEventListener("click", async () => {
    const confirmBtn = overlay.querySelector("#confirm-delete-item") as HTMLButtonElement;
    confirmBtn.disabled = true;
    try {
      const ok = await deleteLocalCustomItem(ti.itemId);
      dismiss();
      if (!ok) {
        showToast("Catalog items cannot be deleted");
        return;
      }
      const scrollTop = currentScrollTop(container);
      allItems = await getTripItemsWithMeta(tripId);
      showToast(`“${ti.item.name}” deleted`);
      renderUI(container, tripName, { scrollTop });
    } catch (err) {
      console.warn("Delete item failed:", err);
      confirmBtn.disabled = false;
      showToast("Could not delete item");
    }
  });
}

function restoreSearchFocus(container: HTMLElement, pos: number): void {
  const next = container.querySelector("#search-input") as HTMLInputElement | null;
  if (!next) return;
  next.focus();
  try { next.setSelectionRange(pos, pos); } catch { /* ignore */ }
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
