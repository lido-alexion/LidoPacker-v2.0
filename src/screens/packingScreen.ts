import { tripsDB } from "../db/database";
import { router } from "../utils/router";
import {
  getTripItemsWithMeta,
  TripItemWithMeta,
  sortCategoryItems,
  fuzzySearch,
  computeProgress,
  getTripPhase,
  derivePackingState,
  saveTripItem,
  ensureTripItemBagAssignments,
} from "../services/itemService";
import { getPhaseLabel, formatCountdown, parseTripInstant } from "../utils/timeEngine";
import { showToast } from "../components/toast";
import { checkMissedItems } from "../services/notificationService";
import { Trip, TripPhase } from "../utils/types";
import { initAutoHideOnScroll, getPageScrollTop, setPageScrollTop, AutoHideChromeHandle } from "../utils/scrollChrome";
import { bindTripBagControls, renderTripBagControl } from "../components/tripBagControl";
import { renderCategoryTabs } from "../components/categoryTabs";
import { categoryPackProgress, categoryTabsFor, groupItemsByLabel, itemCategory, orderCategoryTabsByPackProgress, pickCategoryTab } from "../utils/tripFilter";

type PackingMode = "all" | "last-minute" | "forgot";

let tripIdGlobal: string = "";
let tripGlobal: Trip | null = null;
let allItems: TripItemWithMeta[] = [];
let mode: PackingMode = "all";
let searchQuery: string = "";
let searchActive: boolean = false;
let phase: TripPhase = "EARLY";
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let showPacked = true;
let packedToBottom = false;
let chromeHandle: AutoHideChromeHandle | null = null;
let activeCategory: string = "";
/** Subcategory section labels the user has collapsed (session only). */
const collapsedSections = new Set<string>();

export function teardownPackingScreen(): void {
  chromeHandle?.destroy();
  chromeHandle = null;
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

export async function renderPackingScreen(container: HTMLElement, tripId: string): Promise<void> {
  tripIdGlobal = tripId;
  mode = "all";
  searchQuery = "";
  searchActive = false;
  activeCategory = "";

  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  tripGlobal = trip;
  phase = getTripPhase(trip);
  allItems = await getTripItemsWithMeta(tripId);
  await ensureTripItemBagAssignments(trip, allItems);

  if (allItems.filter((ti) => ti.isSelected).length === 0) {
    router.navigate({ name: "item-selection", tripId }, { replace: true });
    return;
  }

  if (countdownInterval) clearInterval(countdownInterval);

  const progress = computeProgress(allItems);
  renderPackingUI(container, trip.name, trip.startTime);
  void checkMissedItems(trip, progress.packed, progress.total);

  // Live countdown update every 30s
  countdownInterval = setInterval(async () => {
    const freshTrip = await tripsDB.getById(tripId);
    if (!freshTrip) return;
    const newPhase = getTripPhase(freshTrip);
    const countdownEl = container.querySelector("#countdown-text");
    if (countdownEl) countdownEl.textContent = formatCountdown(
      parseTripInstant(freshTrip.startTime),
      freshTrip.endTime ? parseTripInstant(freshTrip.endTime) : undefined
    );
    if (newPhase !== phase) {
      phase = newPhase;
      allItems = await getTripItemsWithMeta(tripId);
      renderPackingUI(container, freshTrip.name, freshTrip.startTime);
    }
  }, 30000);
}

function getModeScopeItems(): TripItemWithMeta[] {
  const derived = derivePackingState(allItems, phase);

  let items: TripItemWithMeta[];
  if (mode === "last-minute") {
    items = derived.remaining.filter((ti) => ti.item.stage === "LAST_MINUTE");
  } else if (mode === "forgot") {
    items = derived.missed.length ? derived.missed : derived.remaining;
  } else {
    items = allItems.filter((ti) => ti.isSelected);
  }

  if (searchQuery) items = fuzzySearch(items, searchQuery);
  return items;
}

function getModeItems(): TripItemWithMeta[] {
  const items = getModeScopeItems();
  if (!showPacked) return items.filter((ti) => !ti.isPacked);
  return items;
}

function getDisplayItems(modeItems: TripItemWithMeta[]): TripItemWithMeta[] {
  if (searchQuery.trim()) return modeItems;
  if (!activeCategory) return modeItems;
  return modeItems.filter((ti) => itemCategory(ti.item) === activeCategory);
}

function renderPackingUI(container: HTMLElement, tripName: string, startTime: string, searchCaret?: number): void {
  const savedScroll = getPageScrollTop();
  chromeHandle?.destroy();
  chromeHandle = null;
  const progress = computeProgress(allItems);
  const tabItems = getModeScopeItems();
  const modeItems = getModeItems();
  const tabs = orderCategoryTabsByPackProgress(categoryTabsFor(tabItems), tabItems);
  activeCategory = pickCategoryTab(tabs, activeCategory);
  const displayItems = getDisplayItems(modeItems);
  const endMs = tripGlobal?.endTime ? parseTripInstant(tripGlobal.endTime) : undefined;
  const countdown = formatCountdown(parseTripInstant(startTime), endMs);
  const phaseLabel = getPhaseLabel(phase);

  const bannerHtml = getBannerHtml(phase, progress.percent);
  const searching = searchActive || !!searchQuery;

  container.innerHTML = `
    <div class="screen packing-screen">
      <div class="header">
        <div class="pane-inner">
          <button class="header__back" id="back-btn">←</button>
          <div class="header__title">${escHtml(tripName)}</div>
          <button class="header__action" id="edit-items-btn">Items</button>
        </div>
      </div>

      <div class="packing-screen__sticky" id="packing-sticky">
        <div class="pane-inner">
          <div class="packing-screen__progress-header">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge badge--${phaseBadge(phase)}">${phaseLabel}</span>
              <span id="countdown-text" style="font-size:12px;color:var(--color-text-muted)">${countdown}</span>
            </div>
            <div class="packing-screen__count">
              <span class="packing-screen__percent">${progress.percent}%</span>
              <span style="margin-left:4px;color:var(--color-text-muted)">${progress.packed}/${progress.total}</span>
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${progress.percent}%"></div>
          </div>
          ${bannerHtml}
          <div class="packing-controls-row${searching ? " packing-controls-row--searching" : ""}">
            <div class="mode-btns" role="group" aria-label="Item view">
              <button type="button" class="mode-btns__btn ${mode === "all" ? "mode-btns__btn--active-primary" : ""}" data-mode="all">All items</button>
              <button type="button" class="mode-btns__btn ${mode === "last-minute" ? "mode-btns__btn--active-danger" : ""}" data-mode="last-minute">Last minute</button>
              <button type="button" class="mode-btns__btn ${mode === "forgot" ? "mode-btns__btn--active-warning" : ""}" data-mode="forgot">Forgot</button>
            </div>
            <div class="segmented" role="group" aria-label="Item view">
              <button type="button" class="segmented__btn ${mode === "all" ? "segmented__btn--active-primary" : ""}" data-mode="all" title="All items">📋</button>
              <button type="button" class="segmented__btn ${mode === "last-minute" ? "segmented__btn--active-danger" : ""}" data-mode="last-minute" title="Last minute">⚡</button>
              <button type="button" class="segmented__btn ${mode === "forgot" ? "segmented__btn--active-warning" : ""}" data-mode="forgot" title="Forgot">🤔</button>
            </div>
            <label class="icon-switch" title="${showPacked ? "Hide packed items" : "Show packed items"}">
              <input type="checkbox" id="show-packed-toggle" ${showPacked ? "checked" : ""} />
              <span class="icon-switch__ui" aria-hidden="true">
                <span class="icon-switch__off">🙈</span>
                <span class="icon-switch__on">👁️</span>
              </span>
              <span class="sr-only">Show packed items</span>
            </label>
            <label class="icon-switch icon-switch--accent" title="${packedToBottom ? "Keep packed items in place" : "Move packed items to the bottom of each category"}">
              <input type="checkbox" id="packed-bottom-toggle" ${packedToBottom ? "checked" : ""} />
              <span class="icon-switch__ui" aria-hidden="true">
                <span class="icon-switch__off">☰</span>
                <span class="icon-switch__on">⬇️</span>
              </span>
              <span class="sr-only">Move packed items to the bottom of each category</span>
            </label>
            <button type="button" class="icon-btn packing-search-toggle" id="search-toggle-btn" title="Search items">🔍</button>
            <div class="search-bar packing-search-field">
              <span class="search-bar__icon">🔍</span>
              <input type="text" id="search-input" placeholder="Search items…" value="${escHtml(searchQuery)}" />
              ${searching ? `<button type="button" class="search-bar__clear" id="clear-search" title="Close search">×</button>` : ""}
            </div>
          </div>
        </div>
        ${renderCategoryTabs(tabs, activeCategory, {
          countFor: (cat) => {
            const { packed, total } = categoryPackProgress(tabItems, cat);
            return `${packed}/${total}`;
          },
          isComplete: (cat) => {
            const { packed, total } = categoryPackProgress(tabItems, cat);
            return total > 0 && packed === total;
          },
        })}
      </div>

      <div id="packing-list">
        ${renderPackingList(displayItems)}
      </div>

      ${progress.percent === 100 ? `
        <div class="banner banner--success" style="margin:16px">
          <div class="banner__icon">🎉</div>
          <div class="banner__content">
            <div class="banner__title">All packed!</div>
            <div class="banner__subtitle">You're ready to go. Bon voyage!</div>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  bindPackingEvents(container, tripName, startTime);
  setPageScrollTop(savedScroll);
  if (searchCaret !== undefined) {
    const next = container.querySelector("#search-input") as HTMLInputElement | null;
    if (next) {
      next.focus();
      try { next.setSelectionRange(searchCaret, searchCaret); } catch { /* ignore */ }
    }
  }

  const sticky = container.querySelector("#packing-sticky") as HTMLElement | null;
  chromeHandle = initAutoHideOnScroll([sticky]);
}

function getBannerHtml(phase: TripPhase, percent: number): string {
  if (phase === "LAST_MINUTE") {
    return `
      <div class="banner banner--danger">
        <div class="banner__icon">⚡</div>
        <div class="banner__content">
          <div class="banner__title">Last minute! Check essentials</div>
          <div class="banner__subtitle">Focus on items you carry and wear</div>
        </div>
      </div>
    `;
  }
  if (phase === "POST" && percent < 100) {
    return `
      <div class="banner banner--warning">
        <div class="banner__icon">🤔</div>
        <div class="banner__content">
          <div class="banner__title">Trip started — forgot something?</div>
          <div class="banner__subtitle">Check unpacked items below</div>
        </div>
      </div>
    `;
  }
  if (phase === "MID") {
    return `
      <div class="banner banner--warning">
        <div class="banner__icon">🕐</div>
        <div class="banner__content">
          <div class="banner__title">Getting close! Keep packing</div>
          <div class="banner__subtitle">Most items should be packed by now</div>
        </div>
      </div>
    `;
  }
  return "";
}

function renderPackingList(items: TripItemWithMeta[]): string {
  if (items.length === 0) {
    if (searchQuery) {
      return `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No results</div></div>`;
    }
    if (mode === "last-minute") {
      return `<div class="empty-state"><div class="empty-state__icon">✅</div><div class="empty-state__title">No urgent items</div><div class="empty-state__subtitle">All last-minute items are packed!</div></div>`;
    }
    if (mode === "forgot") {
      return `<div class="empty-state"><div class="empty-state__icon">🎉</div><div class="empty-state__title">Nothing forgotten</div><div class="empty-state__subtitle">Everything is packed!</div></div>`;
    }
    return `<div class="empty-state"><div class="empty-state__icon">📦</div><div class="empty-state__title">No items selected</div><div class="empty-state__subtitle">Go to Items to select what to pack</div></div>`;
  }

  const groups = groupItemsByLabel(items, !!searchQuery.trim());

  let html = "";
  for (const { label, items: catItems } of groups) {
    const catPacked = catItems.filter(ti => ti.isPacked).length;
    const collapsed = collapsedSections.has(label);
    html += `
      <div class="category-section${collapsed ? " category-section--collapsed" : ""}" data-section="${escHtml(label)}">
        <div class="category-section__header" role="button" tabindex="0" aria-expanded="${collapsed ? "false" : "true"}" data-section-toggle="${escHtml(label)}">
          <span class="category-section__chevron" aria-hidden="true"></span>
          <span class="category-section__title">${escHtml(label)}</span>
          <span class="category-section__count">${catPacked}/${catItems.length}</span>
        </div>
        <div class="category-section__body">
          <div class="card" style="border-radius:0;box-shadow:none">
            ${sortCategoryItems(catItems, phase, packedToBottom).map(renderPackingItemRow).join("")}
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderPackingItemRow(ti: TripItemWithMeta): string {
  const isPhaseMatch = ti.item.stage === phase;
  const typeIcon = { PACK: "🎒", WEAR: "👔", CARRY: "✋", TODO: "✅" }[ti.item.type] || "";
  const bagControl = tripGlobal ? renderTripBagControl(ti.item, tripGlobal, ti) : "";

  return `
    <div class="item-row item-row--selectable ${ti.isPacked ? "item-row--packed" : ""}" data-pack-item="${ti.itemId}">
      <div class="checkbox-wrap">
        <input type="checkbox" ${ti.isPacked ? "checked" : ""} data-pack="${ti.itemId}" />
      </div>
      <div class="item-row__info">
        <div class="item-row__name">${escHtml(ti.item.name)}</div>
        <div class="item-row__meta">
          <span class="item-row__type">${typeIcon} ${ti.item.type}</span>
          ${isPhaseMatch ? `<span class="badge badge--${phaseBadge(phase)}">${getPhaseLabel(phase)}</span>` : ""}
          ${ti.count > 1 ? `<span class="badge badge--muted">×${ti.count}</span>` : ""}
        </div>
      </div>
      ${bagControl ? `<div class="item-row__actions">${bagControl}</div>` : ""}
    </div>
  `;
}

function phaseBadge(p: TripPhase): string {
  if (p === "LAST_MINUTE") return "danger";
  if (p === "MID") return "warning";
  if (p === "POST") return "muted";
  return "primary";
}

function bindPackingEvents(container: HTMLElement, tripName: string, startTime: string): void {
  container.querySelector("#back-btn")?.addEventListener("click", () => {
    if (countdownInterval) clearInterval(countdownInterval);
    router.navigate({ name: "home" });
  });

  container.querySelector("#edit-items-btn")?.addEventListener("click", () => {
    if (countdownInterval) clearInterval(countdownInterval);
    router.navigate({ name: "item-selection", tripId: tripIdGlobal });
  });

  container.querySelector("#search-toggle-btn")?.addEventListener("click", () => {
    searchActive = true;
    renderPackingUI(container, tripName, startTime);
    (container.querySelector("#search-input") as HTMLInputElement | null)?.focus();
  });

  const searchInput = container.querySelector("#search-input") as HTMLInputElement;
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderPackingUI(container, tripName, startTime, searchInput.selectionStart ?? searchQuery.length);
  });

  container.querySelector("#clear-search")?.addEventListener("click", () => {
    searchQuery = "";
    searchActive = false;
    renderPackingUI(container, tripName, startTime);
  });

  // Mode toggle
  container.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = (btn as HTMLElement).dataset.mode! as PackingMode;
      renderPackingUI(container, tripName, startTime);
    });
  });

  container.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = (btn as HTMLElement).dataset.cat!;
      searchQuery = "";
      searchActive = false;
      setPageScrollTop(0);
      renderPackingUI(container, tripName, startTime);
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
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  const packedToggle = container.querySelector("#show-packed-toggle") as HTMLInputElement | null;
  packedToggle?.addEventListener("change", () => {
    showPacked = packedToggle.checked;
    renderPackingUI(container, tripName, startTime);
  });

  const bottomToggle = container.querySelector("#packed-bottom-toggle") as HTMLInputElement | null;
  bottomToggle?.addEventListener("change", () => {
    packedToBottom = bottomToggle.checked;
    renderPackingUI(container, tripName, startTime);
  });

  container.querySelectorAll("[data-pack-item]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("input, select, button, [data-bag-area]")) return;
      const cb = row.querySelector("input[data-pack]") as HTMLInputElement | null;
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  bindTripBagControls(container, () => allItems);

  container.querySelectorAll("[data-pack]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const itemId = (cb as HTMLElement).dataset.pack!;
      const ti = allItems.find((i) => i.itemId === itemId);
      if (!ti) return;
      ti.isPacked = (cb as HTMLInputElement).checked;
      await saveTripItem(ti);
      renderPackingUI(container, tripName, startTime);
      if (computeProgress(allItems).percent === 100) {
        showToast("All items packed! 🎉");
      }
    });
  });
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
