import { tripsDB, tripItemsDB } from "../db/database";
import { router } from "../utils/router";
import { showToast } from "../components/toast";
import { validateTrip } from "../utils/validation";
import { isTripNameTaken, uniqueCloneName } from "../utils/tripNames";

export async function renderCloneTripScreen(container: HTMLElement, tripId: string): Promise<void> {
  container.innerHTML = `<div class="screen"><div class="loading"><div class="loading__spinner"></div></div></div>`;

  const trip = await tripsDB.getById(tripId);
  if (!trip) { router.navigate({ name: "home" }, { replace: true }); return; }

  const existing = await tripsDB.getAll();
  const suggested = uniqueCloneName(trip.name, existing);

  container.innerHTML = `
    <div class="screen">
      <div class="header">
        <div class="pane-inner">
          <button class="header__back" id="back-btn">←</button>
          <div class="header__title">Clone trip</div>
        </div>
      </div>
      <div class="create-trip-screen">
        <div class="form-hint">Copies destination, dates, attributes, bags, and packing items from ${escHtml(trip.name)}.</div>
        <div class="form-field">
          <label>New trip name</label>
          <input type="text" id="trip-name" value="${escHtml(suggested)}" maxlength="80" />
        </div>
        <div id="form-error" class="form-error" style="display:none"></div>
        <button class="btn btn--primary btn--full" id="clone-btn">Clone Trip</button>
      </div>
    </div>
  `;

  container.querySelector("#back-btn")?.addEventListener("click", () => {
    router.navigate({ name: "home" }, { replace: true });
  });

  container.querySelector("#clone-btn")?.addEventListener("click", async () => {
    const name = (container.querySelector("#trip-name") as HTMLInputElement).value.trim();
    const errEl = container.querySelector("#form-error") as HTMLElement;
    errEl.style.display = "none";

    const trips = await tripsDB.getAll();
    if (!name) { showError(errEl, "Please enter a trip name."); return; }
    if (isTripNameTaken(name, trips)) { showError(errEl, "This name is already used."); return; }

    const clone = {
      ...trip,
      id: `trip_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      isArchived: false,
    };
    const validation = validateTrip(clone);
    if (validation) { showError(errEl, validation); return; }

    const btn = container.querySelector("#clone-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Cloning…";

    const items = await tripItemsDB.getByTrip(trip.id);
    await tripsDB.put(clone);
    await tripItemsDB.putMany(items.map((ti) => ({ ...ti, tripId: clone.id })));

    showToast("Trip cloned");
    router.navigate({ name: "home" }, { replace: true });
  });

  setTimeout(() => {
    const input = container.querySelector("#trip-name") as HTMLInputElement;
    input?.focus();
    input?.select();
  }, 100);
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = "block";
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
