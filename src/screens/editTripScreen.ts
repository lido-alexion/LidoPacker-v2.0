import { Trip } from "../utils/types";
import { tripsDB } from "../db/database";
import { router } from "../utils/router";
import { showToast } from "../components/toast";
import { validateTrip } from "../utils/validation";
import {
  combineDateAndTime,
  getLocalTimeZone,
  formatTimeZoneLabel,
  toDateInputValue,
  toTimeInputValue,
} from "../utils/timeEngine";
import { scheduleNotifications } from "../services/notificationService";
import { getSelectedCount, replaceTripItems } from "../services/itemService";
import { TripAttributes } from "../utils/tripAttributes";
import {
  applyAttributes,
  attributesFromTrip,
  bindAttributeFields,
  renderAttributeFields,
  validateAttributes,
} from "../components/attributePicker";
import { isTripNameTaken } from "../utils/tripNames";

export async function renderEditTripScreen(container: HTMLElement, tripId: string): Promise<void> {
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  const selectedCount = await getSelectedCount(tripId);
  const locked = selectedCount > 0;
  let attrs: TripAttributes = attributesFromTrip(trip);

  const tzLabel = formatTimeZoneLabel(trip.timezone || getLocalTimeZone());
  const startDate = toDateInputValue(trip.startTime);
  const startTime = toTimeInputValue(trip.startTime);
  const endDate = toDateInputValue(trip.endTime);
  const endTime = toTimeInputValue(trip.endTime);

  container.innerHTML = `
    <div class="screen">
      <div class="header">
        <button class="header__back" id="back-btn">←</button>
        <div class="header__title">Edit Trip</div>
      </div>
      <div class="create-trip-screen">
        <div class="form-field">
          <label>Trip Name</label>
          <input type="text" id="trip-name" value="${escHtml(trip.name)}" maxlength="80" />
        </div>
        <div class="form-field">
          <label>Destination</label>
          <input type="text" id="trip-location" value="${escHtml(trip.location)}" maxlength="100" />
        </div>
        <div class="form-field">
          <label>Departure date</label>
          <input type="date" id="trip-start-date" value="${escHtml(startDate)}" />
        </div>
        <div class="form-field">
          <label>Departure time <span class="label-optional">(optional)</span></label>
          <input type="time" id="trip-start-time" value="${escHtml(startTime)}" />
          <div class="form-hint">Times, if set, are in ${escHtml(tzLabel)}</div>
        </div>
        <div class="form-field">
          <label>Return date <span class="label-optional">(optional)</span></label>
          <input type="date" id="trip-end-date" value="${escHtml(endDate)}" min="${escHtml(startDate)}" />
        </div>
        <div class="form-field">
          <label>Return time <span class="label-optional">(optional)</span></label>
          <input type="time" id="trip-end-time" value="${escHtml(endTime)}" />
        </div>
        <div id="attr-host"></div>
        <div id="form-error" class="form-error" style="display:none"></div>
        <button class="btn btn--primary btn--full" id="save-btn">Save Changes</button>
      </div>
    </div>
  `;

  const attrHost = container.querySelector("#attr-host") as HTMLElement;
  const drawAttrs = () => {
    attrHost.innerHTML = renderAttributeFields(attrs, locked);
    bindAttributeFields(attrHost, () => attrs, (next) => { attrs = next; drawAttrs(); }, locked);
  };
  drawAttrs();

  container.querySelector("#back-btn")?.addEventListener("click", () => router.navigate({ name: "home" }, { replace: true }));

  const startDateInput = container.querySelector("#trip-start-date") as HTMLInputElement;
  const endDateInput = container.querySelector("#trip-end-date") as HTMLInputElement;
  startDateInput?.addEventListener("change", () => {
    if (startDateInput.value) {
      endDateInput.min = startDateInput.value;
      if (endDateInput.value && endDateInput.value < startDateInput.value) endDateInput.value = "";
    }
  });

  container.querySelector("#save-btn")?.addEventListener("click", async () => {
    const name = (container.querySelector("#trip-name") as HTMLInputElement).value.trim();
    const location = (container.querySelector("#trip-location") as HTMLInputElement).value.trim();
    const startDateVal = (container.querySelector("#trip-start-date") as HTMLInputElement).value;
    const startTimeVal = (container.querySelector("#trip-start-time") as HTMLInputElement).value;
    const endDateVal = (container.querySelector("#trip-end-date") as HTMLInputElement).value;
    const endTimeVal = (container.querySelector("#trip-end-time") as HTMLInputElement).value;

    const errEl = container.querySelector("#form-error") as HTMLElement;
    errEl.style.display = "none";

    if (!name) { showError(errEl, "Please enter a trip name."); return; }
    if (!location) { showError(errEl, "Please enter a destination."); return; }
    if (!startDateVal) { showError(errEl, "Please set a departure date."); return; }
    if (endTimeVal && !endDateVal) { showError(errEl, "Set a return date before adding a return time."); return; }

    const existing = await tripsDB.getAll();
    if (isTripNameTaken(name, existing, trip.id)) {
      showError(errEl, "This name is already used.");
      return;
    }

    if (!locked) {
      const attrErr = validateAttributes(attrs);
      if (attrErr) { showError(errEl, attrErr); return; }
    }

    const startTime = combineDateAndTime(startDateVal, startTimeVal);
    if (!startTime) { showError(errEl, "Invalid departure date."); return; }

    const endTime = endDateVal ? combineDateAndTime(endDateVal, endTimeVal) : "";
    let updated: Trip = {
      ...trip,
      name,
      location,
      startTime,
      timezone: trip.timezone || getLocalTimeZone(),
    };
    if (endTime) updated.endTime = endTime;
    else delete updated.endTime;
    if (!locked) updated = applyAttributes(updated, attrs);

    const validation = validateTrip(updated);
    if (validation) { showError(errEl, validation); return; }

    const btn = container.querySelector("#save-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Saving…";

    await tripsDB.put(updated);
    if (!locked) await replaceTripItems(updated);
    await scheduleNotifications(updated);
    showToast("Trip updated");
    router.navigate({ name: "home" }, { replace: true });
  });
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = "block";
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
