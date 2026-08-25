import { tripsDB, itemsDB, tripItemsDB } from "../db/database";
import { router } from "../utils/router";
import {
  getTripItemsWithMeta,
  TripItemWithMeta,
  getCategories,
  fuzzySearch,
  createNewItem,
  displayCategory,
} from "../services/itemService";
import { showToast } from "../components/toast";
import { Trip, TripItem } from "../utils/types";
import { initAutoHideOnScroll } from "../utils/scrollChrome";

let allItems: TripItemWithMeta[] = [];
let activeCategory: string = "All";
let searchQuery: string = "";
let tripId: string = "";
let tripGlobal: Trip | null = null;

export async function renderItemSelectionScreen(container: HTMLElement, id: string): Promise<void> {
  tripId = id;
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  tripGlobal = trip;
  allItems = await getTripItemsWithMeta(tripId);
  activeCategory = "All";
  searchQuery = "";

  renderUI(container, trip.name);
}

/** Item's display category for *this* trip — see `displayCategory` for why
 *  the trip matters (keeps tabs limited to what was actually selected). */
function catFor(ti: TripItemWithMeta): string {
  return displayCategory(ti.item, tripGlobal || undefined);
}

function renderUI(
  container: HTMLElement,
  tripName: string,
  opts: { searchCaret?: number; scrollTop?: number } = {}
): void {
  const categories = ["All", ...getCategories(allItems, tripGlobal || undefined)];
  const filtered = getFilteredItems();
  const selectedCount = filtered.filter((ti) => ti.isSelected).length;
  const allVisibleSelected = filtered.length > 0 && selectedCount === filtered.length;
  const q = searchQuery.trim();

  container.innerHTML = `
    <div class="screen item-selection-screen">
      <div class="header">
        <button class="header__back" id="back-btn">←</button>
        <div class="header__title">${escHtml(tripName)}</div>
        <button class="header__action" id="done-btn">Done</button>
      </div>

      <div class="item-selection-toolbar">
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

      <div class="pill-tabs" id="category-tabs">
        ${categories.map((cat) => `
          <button class="pill-tabs__tab ${cat === activeCategory ? "pill-tabs__tab--active" : ""}" data-cat="${escHtml(cat)}">
            ${escHtml(cat)} ${cat === "All" ? `(${allItems.length})` : `(${allItems.filter(ti => catFor(ti) === cat).length})`}
          </button>
        `).join("")}
      </div>

      <div id="items-list">
        ${renderItemsList(filtered)}
      </div>

      ${q.length >= 1 ? `
        <div class="add-item-bar">
          <button class="btn btn--secondary btn--full" id="add-new-btn">+ Add "${escHtml(q)}" as new item</button>
        </div>
      ` : ""}
    </div>
  `;

  bindEvents(container, tripName);
  if (opts.searchCaret !== undefined) restoreSearchFocus(container, opts.searchCaret);
  const scrollEl = container.querySelector(".screen") as HTMLElement | null;
  if (opts.scrollTop !== undefined && scrollEl) scrollEl.scrollTop = opts.scrollTop;

  // Real-estate optimisation: collapse the site header, then the search /
  // select-all toolbar, as the traveller scrolls down the item list.
  if (scrollEl) {
    const toolbar = container.querySelector(".item-selection-toolbar") as HTMLElement | null;
    initAutoHideOnScroll(scrollEl, [toolbar]);
  }
}

/** Current scroll offset of the screen, so re-renders (e.g. after toggling a
 *  checkbox) don't reset the list back to the top on the user. */
function currentScrollTop(container: HTMLElement): number {
  return (container.querySelector(".screen") as HTMLElement | null)?.scrollTop ?? 0;
}

function renderItemsList(items: TripItemWithMeta[]): string {
  if (items.length === 0) {
    return `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No items found</div><div class="empty-state__subtitle">Add it as a custom item below</div></div>`;
  }

  const groups = new Map<string, TripItemWithMeta[]>();
  for (const item of items) {
    const cat = catFor(item);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }

  let html = "";
  for (const [cat, catItems] of groups) {
    const allSelected = catItems.every(ti => ti.isSelected);
    const someSelected = catItems.some(ti => ti.isSelected);
    const checkedAttr = allSelected ? "checked" : "";
    const indeterminate = !allSelected && someSelected ? "data-indeterminate" : "";

    html += `
      <div class="category-section">
        <div class="category-section__header">
          <label class="cat-select-wrap">
            <input
              type="checkbox"
              class="cat-checkbox"
              data-cat-toggle="${escHtml(cat)}"
              ${checkedAttr}
              ${indeterminate}
            />
          </label>
          <span class="category-section__title">${escHtml(cat)}</span>
          <span class="category-section__count">${catItems.filter(ti => ti.isSelected).length}/${catItems.length}</span>
        </div>
        <div class="card card--surface" style="border-radius:0;box-shadow:none">
          ${catItems.map(renderItemRow).join("")}
        </div>
      </div>
    `;
  }
  return html;
}

function renderItemRow(ti: TripItemWithMeta): string {
  const typeIcon = { PACK: "🎒", WEAR: "👔", CARRY: "✋", TODO: "✅" }[ti.item.type] || "";
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
        </div>
      </div>
      <div class="item-row__actions" data-stepper-area>
        <div class="stepper">
          <button class="stepper__btn" data-dec="${ti.itemId}" ${ti.count <= 1 ? "disabled" : ""}>−</button>
          <span class="stepper__value" id="count-${ti.itemId}">${ti.count}</span>
          <button class="stepper__btn" data-inc="${ti.itemId}">+</button>
        </div>
      </div>
    </div>
  `;
}

function getFilteredItems(): TripItemWithMeta[] {
  // Global search: a query searches across every category.
  let items = searchQuery.trim()
    ? allItems
    : (activeCategory === "All" ? allItems : allItems.filter(ti => catFor(ti) === activeCategory));
  if (searchQuery) items = fuzzySearch(items, searchQuery, tripGlobal || undefined);
  return items;
}

async function setSelection(items: TripItemWithMeta[], selected: boolean, container: HTMLElement, tripName: string): Promise<void> {
  const scrollTop = currentScrollTop(container);
  for (const ti of items) {
    ti.isSelected = selected;
    await tripItemsDB.put(ti as TripItem);
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
      renderUI(container, tripName);
    });
  });

  container.querySelectorAll<HTMLInputElement>("[data-cat-toggle]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const cat = cb.dataset.catToggle!;
      const catItems = getFilteredItems().filter(ti => catFor(ti) === cat);
      const shouldSelect = !catItems.every(ti => ti.isSelected);
      await setSelection(catItems, shouldSelect, container, tripName);
    });
  });

  container.querySelectorAll<HTMLElement>("[data-check-row]").forEach((row) => {
    row.addEventListener("click", async (e) => {
      if ((e.target as HTMLElement).closest("[data-stepper-area]")) return;
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
        await tripItemsDB.put(ti as TripItem);
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
        await tripItemsDB.put(ti as TripItem);
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
        await tripItemsDB.put(ti as TripItem);
        const el = container.querySelector(`#count-${itemId}`);
        if (el) el.textContent = String(ti.count);
        const decBtn = container.querySelector(`[data-dec="${itemId}"]`) as HTMLButtonElement;
        if (decBtn) decBtn.disabled = ti.count <= 1;
      }
    });
  });

  container.querySelectorAll("[data-dec]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const itemId = (btn as HTMLElement).dataset.dec!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (ti && ti.count > 1) {
        ti.count--;
        await tripItemsDB.put(ti as TripItem);
        const el = container.querySelector(`#count-${itemId}`);
        if (el) el.textContent = String(ti.count);
        const decBtn = container.querySelector(`[data-dec="${itemId}"]`) as HTMLButtonElement;
        if (decBtn) decBtn.disabled = ti.count <= 1;
      }
    });
  });

  container.querySelector("#add-new-btn")?.addEventListener("click", async () => {
    const name = searchQuery.trim();
    if (!name) return;
    const newItem = createNewItem(name, tripGlobal || undefined);
    await itemsDB.put(newItem);
    const newTripItem: TripItem = {
      tripId,
      itemId: newItem.id,
      count: 1,
      isSelected: true,
      isPacked: false,
    };
    await tripItemsDB.put(newTripItem);
    allItems = await getTripItemsWithMeta(tripId);
    searchQuery = "";
    activeCategory = displayCategory(newItem, tripGlobal || undefined);
    showToast(`"${newItem.name}" added`);
    renderUI(container, tripName);
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
