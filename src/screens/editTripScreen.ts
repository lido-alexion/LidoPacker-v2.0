import { Trip, TripBag } from "../utils/types";
import { tripsDB } from "../db/database";
import { router } from "../utils/router";
import { showToast } from "../components/toast";
import { validateTrip } from "../utils/validation";
import {
  combineDateAndTime,
  getLocalTimeZone,
  toDateInputValue,
  toTimeInputValue,
} from "../utils/timeEngine";
import { scheduleNotifications } from "../services/notificationService";
import { getSelectedCount, replaceTripItems, reassignTripItemBags } from "../services/itemService";
import { TripAttributes } from "../utils/tripAttributes";
import {
  applyAttributes,
  attributesFromTrip,
  bindAttributeFields,
  renderAttributeFields,
  validateAttributes,
} from "../components/attributePicker";
import { isTripNameTaken } from "../utils/tripNames";
import { bindTimePicker, renderTimePicker } from "../components/timePicker";
import { bindBagFields, renderBagFields } from "../components/bagPicker";
import { normalizeTripBags, validateTripBags } from "../utils/tripBags";

export async function renderEditTripScreen(container: HTMLElement, tripId: string): Promise<void> {
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  const selectedCount = await getSelectedCount(tripId);
  const locked = selectedCount > 0;
  let attrs: TripAttributes = attributesFromTrip(trip);
  let bags: TripBag[] = normalizeTripBags(trip.bags);

  const startDate = toDateInputValue(trip.startTime);
  const startTime = toTimeInputValue(trip.startTime);
  const endDate = toDateInputValue(trip.endTime);
  const endTime = toTimeInputValue(trip.endTime);

  // Snapshot of the form's initial values, used to keep "Save Changes"
  // disabled until the traveller actually edits something.
  const initialSnapshot = formSnapshot(trip.name, trip.location, startDate, startTime, endDate, endTime, attrs, bags);

  container.innerHTML = `
    <div class="screen">
      <div class="header">
        <div class="pane-inner">
          <button class="header__back" id="back-btn">←</button>
          <div class="header__title">Edit Trip</div>
        </div>
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
          ${renderTimePicker("trip-start-time", startTime, "Departure time")}
        </div>
        <div class="form-field">
          <label>Return date <span class="label-optional">(optional)</span></label>
          <input type="date" id="trip-end-date" value="${escHtml(endDate)}" min="${escHtml(startDate)}" />
        </div>
        <div class="form-field">
          <label>Return time <span class="label-optional">(optional)</span></label>
          ${renderTimePicker("trip-end-time", endTime, "Return time")}
        </div>
        <div id="attr-host"></div>
        <div id="bag-host"></div>
        ${locked ? `<button type="button" class="btn btn--secondary btn--full" id="remove-items-btn">🧹 Remove all items to edit tags</button>` : ""}
        <div id="form-error" class="form-error" style="display:none"></div>
        <button class="btn btn--primary btn--full" id="save-btn" disabled>Save Changes</button>
      </div>
    </div>
  `;

  const attrHost = container.querySelector("#attr-host") as HTMLElement;
  const saveBtn = container.querySelector("#save-btn") as HTMLButtonElement;

  const refreshSaveState = (): void => {
    const dirty = initialSnapshot !== currentFormSnapshot(container, attrs, bags);
    saveBtn.disabled = !dirty;
  };

  const drawAttrs = () => {
    attrHost.innerHTML = renderAttributeFields(attrs, locked);
    bindAttributeFields(attrHost, () => attrs, (next) => { attrs = next; drawAttrs(); refreshSaveState(); }, locked);
  };
  drawAttrs();
  const bagHost = container.querySelector("#bag-host") as HTMLElement;
  const drawBags = () => {
    bagHost.innerHTML = renderBagFields(bags);
    bindBagFields(bagHost, () => bags, (next) => { bags = next; drawBags(); refreshSaveState(); });
  };
  drawBags();
  bindTimePicker(container, "trip-start-time");
  bindTimePicker(container, "trip-end-time");

  container.querySelector("#back-btn")?.addEventListener("click", () => router.navigate({ name: "home" }, { replace: true }));

  container.querySelector("#remove-items-btn")?.addEventListener("click", () => {
    confirmRemoveItems(trip, container, tripId);
  });

  container.querySelectorAll<HTMLInputElement>(
    "#trip-name, #trip-location, #trip-start-date, #trip-start-time, #trip-end-date, #trip-end-time"
  ).forEach((input) => {
    input.addEventListener("input", refreshSaveState);
    input.addEventListener("change", refreshSaveState);
  });

  const startDateInput = container.querySelector("#trip-start-date") as HTMLInputElement;
  const endDateInput = container.querySelector("#trip-end-date") as HTMLInputElement;
  startDateInput?.addEventListener("change", () => {
    if (startDateInput.value) {
      endDateInput.min = startDateInput.value;
      if (endDateInput.value && endDateInput.value < startDateInput.value) endDateInput.value = "";
    }
    refreshSaveState();
  });

  refreshSaveState();

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
    const bagErr = validateTripBags(bags);
    if (bagErr) { showError(errEl, bagErr); return; }

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
    const packedBags = normalizeTripBags(bags);
    if (packedBags.length) updated.bags = packedBags;
    else delete updated.bags;

    const validation = validateTrip(updated);
    if (validation) { showError(errEl, validation); return; }

    const btn = container.querySelector("#save-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Saving…";

    await tripsDB.put(updated);
    if (!locked) await replaceTripItems(updated);
    else await reassignTripItemBags(updated);
    await scheduleNotifications(updated);
    showToast("Trip updated");
    router.navigate({ name: "home" }, { replace: true });
  });
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = "block";
}

/** Stable snapshot of the editable form state, used to detect real changes
 *  (array order from toggling tags on/off is normalised so re-selecting the
 *  same tags doesn't falsely look "dirty"). */
function formSnapshot(
  name: string,
  location: string,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attrs: TripAttributes,
  bags: TripBag[]
): string {
  return JSON.stringify({
    name: name.trim(),
    location: location.trim(),
    startDate,
    startTime,
    endDate,
    endTime,
    travellers: [...attrs.travellers].sort(),
    vehicles: [...attrs.vehicles].sort(),
    weathers: [...attrs.weathers].sort(),
    types: [...attrs.types].sort(),
    bags: normalizeTripBags(bags),
  });
}

function currentFormSnapshot(container: HTMLElement, attrs: TripAttributes, bags: TripBag[]): string {
  const val = (id: string) => (container.querySelector(`#${id}`) as HTMLInputElement)?.value ?? "";
  return formSnapshot(
    val("trip-name"),
    val("trip-location"),
    val("trip-start-date"),
    val("trip-start-time"),
    val("trip-end-date"),
    val("trip-end-time"),
    attrs,
    bags
  );
}

function confirmRemoveItems(trip: Trip, container: HTMLElement, tripId: string): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay__dialog">
      <div class="overlay__title">Remove all items?</div>
      <div class="overlay__message">This clears your item selections for this trip so you can change traveller, transport, weather and trip type tags. You'll pick items again afterwards.</div>
      <div class="overlay__actions">
        <button class="btn btn--secondary" style="flex:1" id="cancel-remove">Cancel</button>
        <button class="btn btn--danger" style="flex:1" id="confirm-remove">Remove items</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#cancel-remove")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#confirm-remove")?.addEventListener("click", async () => {
    await replaceTripItems(trip);
    overlay.remove();
    showToast("All items removed — tags unlocked");
    renderEditTripScreen(container, tripId);
  });
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
