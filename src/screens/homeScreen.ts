import { Trip } from "../utils/types";
import { tripsDB, tripItemsDB } from "../db/database";
import { router } from "../utils/router";
import { getPhase, formatCountdown, parseTripInstant, isDateOnly, formatTimeZoneLabel, getLocalTimeZone } from "../utils/timeEngine";
import { getSelectedCount, persistableTripItem, replaceTripItems } from "../services/itemService";
import { openTripDetails } from "../components/tripDetails";
import { showToast } from "../components/toast";
import {
  cancelNotificationsForTrip,
  getNotificationPermissionState,
  requestNotificationPermission,
  rescheduleAllUpcomingTrips,
} from "../services/notificationService";

// Persists across re-renders within the session
let showArchived = false;

export async function renderHomeScreen(container: HTMLElement): Promise<void> {
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const allTrips = await tripsDB.getAll();

  // Categorise
  const now = Date.now();
  const active:   Trip[] = [];
  const ended:    Trip[] = [];
  const archived: Trip[] = [];

  for (const trip of allTrips) {
    if (trip.isArchived) {
      archived.push(trip);
      continue;
    }
    const endTimeMs = trip.endTime ? parseTripInstant(trip.endTime) : null;
    const isEnded = endTimeMs !== null && !Number.isNaN(endTimeMs) && now > endTimeMs;
    if (isEnded) ended.push(trip);
    else active.push(trip);
  }

  // Within each group: most recent start date first
  const byStartDesc = (a: Trip, b: Trip) =>
    parseTripInstant(b.startTime) - parseTripInstant(a.startTime);
  active.sort(byStartDesc);
  ended.sort(byStartDesc);
  archived.sort(byStartDesc);

  const screen = document.createElement("div");
  screen.className = "screen";

  const titlebar = `
    <div class="home-titlebar">
      <div class="pane-inner">
        <div class="home-screen__title">Lido Pack</div>
        <div class="home-screen__subtitle">Version 2.0.0</div>
      </div>
    </div>
  `;

  const perm = getNotificationPermissionState();
  const notifBanner = perm === "default" ? `
    <div class="status-banner status-banner--info" id="notif-banner">
      <div class="status-banner__text">Enable reminders so we can ping you before departure.</div>
      <button type="button" class="btn btn--secondary" id="enable-notif-btn" style="height:36px;padding:0 12px;flex-shrink:0">Enable</button>
    </div>
  ` : perm === "denied" ? `
    <div class="status-banner status-banner--warn">
      <div class="status-banner__text">Notifications are blocked. Enable them in your browser settings for packing reminders.</div>
    </div>
  ` : "";

  const tzHint = `
    <div class="home-tz-hint">Times use this device’s clock (${escHtml(formatTimeZoneLabel(getLocalTimeZone()))})</div>
  `;

  if (active.length === 0 && ended.length === 0 && archived.length === 0) {
    screen.innerHTML = `
      ${titlebar}
      ${notifBanner}
      <div class="home-screen home-screen--fab-pad">
        <div class="empty-state">
          <div class="empty-state__icon">🧳</div>
          <div class="empty-state__title">No trips yet</div>
          <div class="empty-state__subtitle">Tap + to create your first trip</div>
        </div>
        ${tzHint}
      </div>
    `;
  } else {
    const activeHtml   = await buildGroupHtml(active,   false);
    const endedHtml    = await buildGroupHtml(ended,    true);
    const archivedHtml = await buildGroupHtml(archived, false, true);

    screen.innerHTML = `
      ${titlebar}
      ${notifBanner}
      <div class="home-screen home-screen--fab-pad">
        ${active.length ? `<div class="trip-group">${activeHtml}</div>` : ""}
        ${ended.length  ? `<div class="trip-group">${endedHtml}</div>`  : ""}

        ${archived.length ? `
          <div class="archive-toggle-row">
            <span class="archive-toggle-row__label">Show archived trips (${archived.length})</span>
            <label class="slider-toggle">
              <input type="checkbox" id="show-archived-toggle" ${showArchived ? "checked" : ""} />
              <span class="slider-toggle__track"></span>
            </label>
          </div>
          <div id="archived-section" style="${showArchived ? "" : "display:none"}">
            <div class="trip-group">${archivedHtml}</div>
          </div>
        ` : ""}
        ${tzHint}
      </div>
    `;
  }

  container.innerHTML = "";
  container.appendChild(screen);

  const fab = document.createElement("button");
  fab.className = "fab";
  fab.id = "fab-add";
  fab.title = "Add trip";
  fab.setAttribute("aria-label", "Add trip");
  fab.textContent = "+";
  container.appendChild(fab);

  fab.addEventListener("click", () => {
    router.navigate({ name: "create-trip" });
  });

  container.querySelector("#enable-notif-btn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    showToast("Allow notifications if the browser asks");
    try {
      const ok = await requestNotificationPermission();
      showToast(ok ? "Reminders enabled" : "Reminders not enabled");
      if (ok) await rescheduleAllUpcomingTrips();
    } catch (err) {
      console.warn("Enable reminders failed:", err);
      showToast("Reminders not enabled");
    }
    renderHomeScreen(container);
  });

  container.querySelectorAll("[data-trip-card]").forEach((card) => {
    card.addEventListener("click", async () => {
      const tripId = (card as HTMLElement).dataset.tripCard!;
      const selected = await getSelectedCount(tripId);
      if (selected === 0) router.navigate({ name: "item-selection", tripId });
      else router.navigate({ name: "packing", tripId });
    });
  });

  container.querySelectorAll("[data-trip-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tripId = (btn as HTMLElement).dataset.tripMenu!;
      const trip = allTrips.find(t => t.id === tripId)!;
      openTripMenu(trip, btn as HTMLElement, container);
    });
  });

  const archiveToggle = container.querySelector("#show-archived-toggle") as HTMLInputElement | null;
  archiveToggle?.addEventListener("change", () => {
    showArchived = archiveToggle.checked;
    const section = container.querySelector("#archived-section") as HTMLElement | null;
    if (section) section.style.display = showArchived ? "" : "none";
  });
}

async function buildGroupHtml(trips: Trip[], isEndedGroup: boolean, isArchivedGroup = false): Promise<string> {
  const cards = await Promise.all(trips.map(t => buildCardHtml(t, isEndedGroup, isArchivedGroup)));
  return cards.join("");
}

async function buildCardHtml(trip: Trip, isEndedGroup: boolean, isArchivedGroup: boolean): Promise<string> {
  const tripItems = await tripItemsDB.getByTrip(trip.id);
  const selected  = tripItems.filter(ti => ti.isSelected);
  const packed    = selected.filter(ti => ti.isPacked);
  const percent   = selected.length > 0 ? Math.round((packed.length / selected.length) * 100) : 0;

  const startMs    = parseTripInstant(trip.startTime);
  const phase      = getPhase(startMs);
  const endTimeMs  = trip.endTime ? parseTripInstant(trip.endTime) : undefined;
  const isEnded    = isEndedGroup || isArchivedGroup; // visually dim both ended & archived
  const countdown  = formatCountdown(startMs, endTimeMs);
  const { startLabel, endLabel, daysLabel } = formatTripDates(trip.startTime, trip.endTime, trip.timezone);

  const cardClass = isEnded ? "card trip-card trip-card--ended" : "card trip-card";
  const nightsSpan = daysLabel
    ? ` <span class="${isEnded ? "trip-card__nights--ended" : "trip-card__nights"}">(${daysLabel})</span>`
    : "";
  const phaseClass = isEnded ? "ENDED" : phase;

  return `
    <div class="${cardClass}" data-trip-card="${trip.id}">
      <div class="trip-card__header">
        <div style="flex:1;min-width:0">
          <div class="trip-card__name${isEnded ? " trip-card__name--ended" : ""}">${escHtml(trip.location)}</div>
          <div class="trip-card__trip-name">${escHtml(trip.name)}</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:8px;flex-shrink:0">
          <div class="trip-card__phase trip-card__phase--${phaseClass}">${countdown}</div>
          <button class="trip-card__menu-btn" data-trip-menu="${trip.id}" title="Options">⋯</button>
        </div>
      </div>
      <div class="trip-card__date-line">${startLabel}${endLabel ? ` – ${endLabel}` : ""}${nightsSpan}</div>
      <div class="trip-card__progress">
        <div class="trip-card__progress-label">
          <span>${percent}% packed</span>
          <span>${packed.length} / ${selected.length} items</span>
        </div>
        <div class="progress-bar${isEnded ? " progress-bar--ended" : ""}">
          <div class="progress-bar__fill" style="width:${percent}%"></div>
        </div>
      </div>
    </div>
  `;
}

function openTripMenu(trip: Trip, anchor: HTMLElement, container: HTMLElement): void {
  document.querySelector(".trip-context-menu")?.remove();

  const archiveLabel = trip.isArchived ? "📦 Unarchive trip" : "📦 Archive trip";

  const menu = document.createElement("div");
  menu.className = "trip-context-menu";
  menu.innerHTML = `
    <button class="trip-context-menu__item" data-action="pack">🎒 Open packing list</button>
    <button class="trip-context-menu__item" data-action="items">📋 Select items</button>
    <button class="trip-context-menu__item" data-action="edit">✏️ Edit trip details</button>
    <button class="trip-context-menu__item" data-action="clone">📄 Clone</button>
    <button class="trip-context-menu__item" data-action="details">ℹ️ Trip details</button>
    <button class="trip-context-menu__item" data-action="unpack">📭 Unpack all items</button>
    <button class="trip-context-menu__item" data-action="clear">🧹 Remove all items</button>
    <button class="trip-context-menu__item" data-action="archive">${archiveLabel}</button>
    <div class="trip-context-menu__divider"></div>
    <button class="trip-context-menu__item trip-context-menu__item--danger" data-action="delete">🗑 Delete trip</button>
  `;

  const rect = anchor.getBoundingClientRect();
  menu.style.top   = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  document.body.appendChild(menu);

  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);

  menu.querySelectorAll("[data-action]").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = (item as HTMLElement).dataset.action!;
      menu.remove();
      document.removeEventListener("click", closeMenu);

      if (action === "pack") {
        const selected = await getSelectedCount(trip.id);
        if (selected === 0) router.navigate({ name: "item-selection", tripId: trip.id });
        else router.navigate({ name: "packing", tripId: trip.id });
      }
      if (action === "items")   router.navigate({ name: "item-selection", tripId: trip.id });
      if (action === "edit")    router.navigate({ name: "edit-trip",      tripId: trip.id });
      if (action === "clone")   router.navigate({ name: "clone-trip",     tripId: trip.id });
      if (action === "details") openTripDetails(trip);
      if (action === "unpack") {
        const items = await tripItemsDB.getByTrip(trip.id);
        await Promise.all(items.map((ti) => tripItemsDB.put(persistableTripItem({ ...ti, isPacked: false }))));
        showToast("All items unpacked");
        renderHomeScreen(container);
      }
      if (action === "clear") {
        await replaceTripItems(trip);
        showToast("All items removed");
        renderHomeScreen(container);
      }
      if (action === "archive") {
        await tripsDB.put({ ...trip, isArchived: !trip.isArchived });
        showToast(trip.isArchived ? "Trip unarchived" : "Trip archived");
        renderHomeScreen(container);
      }
      if (action === "delete")  confirmDeleteTrip(trip.id, container);
    });
  });
}

function formatTripDates(startIso: string, endIso?: string, timeZone?: string): {
  startLabel: string;
  endLabel: string | null;
  daysLabel: string | null;
} {
  const start = new Date(parseTripInstant(startIso));
  const currentYear = new Date().getFullYear();
  const startYear = start.getFullYear();
  const endYear = endIso ? new Date(parseTripInstant(endIso)).getFullYear() : startYear;
  const showTime = !isDateOnly(startIso) || (endIso ? !isDateOnly(endIso) : false);

  const omitYear = startYear === currentYear && endYear === currentYear && startYear === endYear;
  const optsWithYear: Intl.DateTimeFormatOptions    = { month: "short", day: "numeric", year: "numeric" };
  const optsWithoutYear: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (showTime) {
    optsWithYear.hour = "2-digit";
    optsWithYear.minute = "2-digit";
    optsWithoutYear.hour = "2-digit";
    optsWithoutYear.minute = "2-digit";
  }
  const opts = omitYear ? optsWithoutYear : optsWithYear;
  if (timeZone && showTime) {
    optsWithYear.timeZone = timeZone;
    optsWithoutYear.timeZone = timeZone;
  }

  const startLabel = start.toLocaleString("en-US", opts);
  if (!endIso) return { startLabel, endLabel: null, daysLabel: null };

  const end = new Date(parseTripInstant(endIso));
  const endLabel = end.toLocaleString("en-US", opts);
  const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const daysLabel = `${nights} night${nights !== 1 ? "s" : ""}`;

  return { startLabel, endLabel, daysLabel };
}

function confirmDeleteTrip(tripId: string, container: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay__dialog">
      <div class="overlay__title">Delete Trip?</div>
      <div class="overlay__message">This will permanently delete the trip and all its packing data.</div>
      <div class="overlay__actions">
        <button class="btn btn--secondary" style="flex:1" id="cancel-delete">Cancel</button>
        <button class="btn btn--danger" style="flex:1" id="confirm-delete">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#cancel-delete")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#confirm-delete")?.addEventListener("click", async () => {
    await tripsDB.delete(tripId);
    await tripItemsDB.deleteByTrip(tripId);
    await cancelNotificationsForTrip(tripId);
    overlay.remove();
    showToast("Trip deleted");
    renderHomeScreen(container);
  });
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
