import { Trip, TripBag } from "../utils/types";
import { tripsDB } from "../db/database";
import { router } from "../utils/router";
import { generateTripItems } from "../services/itemService";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  scheduleNotifications,
} from "../services/notificationService";
import { showToast } from "../components/toast";
import { validateTrip } from "../utils/validation";
import { combineDateAndTime, getLocalTimeZone } from "../utils/timeEngine";
import { defaultTripAttributes, TripAttributes } from "../utils/tripAttributes";
import {
  applyAttributes,
  bindAttributeFields,
  renderAttributeFields,
  validateAttributes,
} from "../components/attributePicker";
import { isTripNameTaken } from "../utils/tripNames";
import { bindTimePicker, renderTimePicker } from "../components/timePicker";
import { bindBagFields, renderBagFields } from "../components/bagPicker";
import { normalizeTripBags, validateTripBags } from "../utils/tripBags";

export function renderCreateTripScreen(container: HTMLElement): void {
  const tomorrow = tomorrowDate();
  const perm = getNotificationPermissionState();
  const remindersBlocked = perm === "denied" || perm === "unsupported";
  let attrs: TripAttributes = defaultTripAttributes();
  let bags: TripBag[] = [];

  container.innerHTML = `
    <div class="screen">
      <div class="header">
        <div class="pane-inner">
          <button class="header__back" id="back-btn">←</button>
          <div class="header__title">New Trip</div>
        </div>
      </div>
      <div class="create-trip-screen">
        <div class="form-field">
          <label>Trip Name</label>
          <input type="text" id="trip-name" placeholder="e.g. Weekend in Paris" maxlength="80" />
        </div>
        <div class="form-field">
          <label>Destination</label>
          <input type="text" id="trip-location" placeholder="e.g. Paris, France" maxlength="100" />
        </div>
        <div class="form-field">
          <label>Departure date</label>
          <input type="date" id="trip-start-date" value="${tomorrow}" />
        </div>
        <div class="form-field">
          <label>Departure time <span class="label-optional">(optional)</span></label>
          ${renderTimePicker("trip-start-time", "", "Departure time")}
        </div>
        <div class="form-field">
          <label>Return date <span class="label-optional">(optional)</span></label>
          <input type="date" id="trip-end-date" min="${tomorrow}" />
        </div>
        <div class="form-field">
          <label>Return time <span class="label-optional">(optional)</span></label>
          ${renderTimePicker("trip-end-time", "", "Return time")}
        </div>
        <div id="attr-host"></div>
        <div id="bag-host"></div>
        <label class="remind-row">
          <input type="checkbox" id="trip-remind" ${remindersBlocked ? "disabled" : "checked"} />
          <span>Remind me 48h before, 6h before, and at departure</span>
        </label>
        ${perm === "denied" ? `<div class="form-hint form-hint--warn">Notifications are blocked in your browser settings.</div>` : ""}
        ${perm === "unsupported" ? `<div class="form-hint form-hint--warn">This browser does not support notifications.</div>` : ""}
        <div id="form-error" class="form-error" style="display:none"></div>
        <button type="button" class="btn btn--primary btn--full" id="create-btn">Create Trip &amp; Choose Items →</button>
      </div>
    </div>
  `;

  const attrHost = container.querySelector("#attr-host") as HTMLElement;
  const drawAttrs = () => {
    attrHost.innerHTML = renderAttributeFields(attrs, false);
    bindAttributeFields(attrHost, () => attrs, (next) => { attrs = next; drawAttrs(); }, false);
  };
  drawAttrs();
  const bagHost = container.querySelector("#bag-host") as HTMLElement;
  const drawBags = () => {
    bagHost.innerHTML = renderBagFields(bags);
    bindBagFields(bagHost, () => bags, (next) => { bags = next; drawBags(); });
  };
  drawBags();
  bindTimePicker(container, "trip-start-time");
  bindTimePicker(container, "trip-end-time");

  container.querySelector("#back-btn")?.addEventListener("click", () => {
    router.navigate({ name: "home" }, { replace: true });
  });

  const startDate = container.querySelector("#trip-start-date") as HTMLInputElement;
  const endDate = container.querySelector("#trip-end-date") as HTMLInputElement;
  startDate?.addEventListener("change", () => {
    if (startDate.value) {
      endDate.min = startDate.value;
      if (endDate.value && endDate.value < startDate.value) endDate.value = "";
    }
  });

  container.querySelector("#create-btn")?.addEventListener("click", async () => {
    const name = (container.querySelector("#trip-name") as HTMLInputElement).value.trim();
    const location = (container.querySelector("#trip-location") as HTMLInputElement).value.trim();
    const startDateVal = (container.querySelector("#trip-start-date") as HTMLInputElement).value;
    const startTimeVal = (container.querySelector("#trip-start-time") as HTMLInputElement).value;
    const endDateVal = (container.querySelector("#trip-end-date") as HTMLInputElement).value;
    const endTimeVal = (container.querySelector("#trip-end-time") as HTMLInputElement).value;
    const wantRemind = (container.querySelector("#trip-remind") as HTMLInputElement)?.checked;

    const errEl = container.querySelector("#form-error") as HTMLElement;
    errEl.style.display = "none";

    const attrErr = validateAttributes(attrs);
    if (attrErr) { showError(errEl, attrErr); return; }
    const bagErr = validateTripBags(bags);
    if (bagErr) { showError(errEl, bagErr); return; }

    if (!startDateVal) { showError(errEl, "Please set a departure date."); return; }
    const startTime = combineDateAndTime(startDateVal, startTimeVal);
    if (!startTime) { showError(errEl, "Invalid departure date."); return; }
    if (endTimeVal && !endDateVal) { showError(errEl, "Set a return date before adding a return time."); return; }

    // Ask while the click is still a user gesture — after later awaits Chrome may hang.
    const permissionWork = wantRemind && getNotificationPermissionState() === "default"
      ? requestNotificationPermission()
      : Promise.resolve(getNotificationPermissionState() === "granted");

    const btn = container.querySelector("#create-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Creating…";

    try {
      const existing = await tripsDB.getAll();
      if (isTripNameTaken(name, existing)) {
        showError(errEl, "This name is already used.");
        return;
      }

      const endTime = endDateVal ? combineDateAndTime(endDateVal, endTimeVal) : "";
      const packedBags = normalizeTripBags(bags);
      const trip: Trip = applyAttributes({
        id: `trip_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name,
        location,
        startTime,
        timezone: getLocalTimeZone(),
        ...(endTime ? { endTime } : {}),
        ...(packedBags.length ? { bags: packedBags } : {}),
      }, attrs);

      const validation = validateTrip(trip);
      if (validation) { showError(errEl, validation); return; }

      await tripsDB.put(trip);
      await generateTripItems(trip);

      if (wantRemind) {
        await permissionWork;
        await scheduleNotifications(trip);
      }

      showToast("Trip created!");
      router.navigate({ name: "item-selection", tripId: trip.id }, { replace: true });
    } catch (err) {
      console.error("Create trip failed:", err);
      showError(errEl, err instanceof Error ? err.message : "Could not create the trip.");
    } finally {
      if (router.getCurrentRoute().name === "create-trip") {
        btn.disabled = false;
        btn.textContent = "Create Trip & Choose Items →";
      }
    }
  });

  setTimeout(() => {
    (container.querySelector("#trip-name") as HTMLInputElement)?.focus();
  }, 100);
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = "block";
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
