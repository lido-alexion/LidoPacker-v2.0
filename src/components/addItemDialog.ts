import { Trip } from "../utils/types";
import { TripAttributes } from "../utils/tripAttributes";
import {
  CustomItemDraft,
  ITEM_STAGE_OPTIONS,
  ITEM_TYPE_OPTIONS,
  LUGGAGE_OPTIONS,
  draftFromTrip,
  uniqueExistingLabels,
} from "../utils/customItem";
import { bindItemTagFields, renderItemTagFields } from "./attributePicker";
import { showToast } from "./toast";

export interface AddItemDialogHandle {
  close(): void;
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function radioChips(group: string, options: string[], selected: string): string {
  if (!options.length) {
    return `<div class="form-hint">No options on this trip’s items.</div>`;
  }
  return `<div class="chip-row" data-radio="${esc(group)}" role="radiogroup">
    ${options.map((opt) => {
      const on = opt === selected;
      return `<button type="button" class="chip${on ? " chip--selected" : ""}" role="radio" aria-checked="${on ? "true" : "false"}" data-chip="${esc(opt)}">${esc(opt)}</button>`;
    }).join("")}
  </div>`;
}

function bindRadio(host: HTMLElement, group: string, get: () => string, set: (value: string) => void): void {
  host.querySelectorAll<HTMLButtonElement>(`[data-radio="${group}"] [data-chip]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      set(btn.dataset.chip || "");
      host.querySelectorAll<HTMLButtonElement>(`[data-radio="${group}"] [data-chip]`).forEach((other) => {
        const on = other.dataset.chip === get();
        other.classList.toggle("chip--selected", on);
        other.setAttribute("aria-checked", on ? "true" : "false");
      });
    });
  });
}

export function openAddItemDialog(opts: {
  trip: Trip;
  presetName: string;
  categories: string[];
  subcategories: string[];
  onSave: (draft: CustomItemDraft) => Promise<void>;
  onDone: () => void;
}): AddItemDialogHandle {
  const draft = draftFromTrip(opts.presetName, opts.trip);
  const categories = uniqueExistingLabels(opts.categories);
  const subcategories = uniqueExistingLabels(opts.subcategories);
  let selectedCategory = draft.category && categories.includes(draft.category) ? draft.category : "";
  let selectedSubcategory = draft.subcategory && subcategories.includes(draft.subcategory) ? draft.subcategory : "";
  let tags: TripAttributes = {
    travellers: [...draft.travellers],
    vehicles: [...draft.vehicles],
    weathers: [...draft.weathers],
    types: [...draft.types],
  };

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay__dialog overlay__dialog--add-item" role="dialog" aria-labelledby="add-item-title">
      <div class="overlay__title" id="add-item-title">Add item</div>
      <div class="overlay__message">Saved on this device and selected for this trip. A copy of the name is sent as a suggestion for the shared list.</div>
      <div class="overlay__body">
        <div class="form-field">
          <label for="new-item-name">Item name</label>
          <input id="new-item-name" type="text" maxlength="80" autocomplete="off" value="${esc(draft.name)}" placeholder="e.g. Travel pillow" />
        </div>
        <div class="form-field item-tag-fields__group">
          <label>Category</label>
          ${radioChips("category", categories, selectedCategory)}
        </div>
        <div class="form-field item-tag-fields__group">
          <label>Subcategory</label>
          ${radioChips("subcategory", subcategories, selectedSubcategory)}
        </div>
        <div class="form-field">
          <label for="new-item-type">Item type</label>
          <select id="new-item-type">
            ${ITEM_TYPE_OPTIONS.map((o) => `<option value="${o.id}"${o.id === draft.type ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="new-item-stage">Packing time</label>
          <select id="new-item-stage">
            ${ITEM_STAGE_OPTIONS.map((o) => `<option value="${o.id}"${o.id === draft.stage ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="new-item-count">Preferred quantity</label>
          <div class="qty-row">
            <input id="new-item-count" type="number" min="1" max="99" step="1" value="${draft.defaultCount}" />
            <label class="qty-na">
              <input id="new-item-count-na" type="checkbox" />
              N/A
            </label>
          </div>
          <div class="form-hint">Use N/A for tasks that are not counted.</div>
        </div>
        <div class="form-field">
          <label for="new-item-luggage">Default luggage</label>
          <select id="new-item-luggage">
            ${LUGGAGE_OPTIONS.map((o) => `<option value="${esc(o.id)}"${o.id === draft.luggage ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div id="new-item-tags"></div>
      </div>
      <div class="overlay__actions overlay__actions--triple">
        <button class="btn btn--secondary" type="button" id="cancel-add-item">Cancel</button>
        <button class="btn btn--secondary" type="button" id="add-another-item" disabled>Add another</button>
        <button class="btn btn--primary" type="button" id="confirm-add-item" disabled>Add</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector("#new-item-name") as HTMLInputElement;
  const typeSelect = overlay.querySelector("#new-item-type") as HTMLSelectElement;
  const stageSelect = overlay.querySelector("#new-item-stage") as HTMLSelectElement;
  const countInput = overlay.querySelector("#new-item-count") as HTMLInputElement;
  const naCheck = overlay.querySelector("#new-item-count-na") as HTMLInputElement;
  const luggageSelect = overlay.querySelector("#new-item-luggage") as HTMLSelectElement;
  const tagsHost = overlay.querySelector("#new-item-tags") as HTMLElement;
  const confirmBtn = overlay.querySelector("#confirm-add-item") as HTMLButtonElement;
  const addAnotherBtn = overlay.querySelector("#add-another-item") as HTMLButtonElement;
  const body = overlay.querySelector(".overlay__body") as HTMLElement;

  const drawTags = () => {
    tagsHost.innerHTML = renderItemTagFields(tags);
    bindItemTagFields(tagsHost, () => tags, (next) => { tags = next; drawTags(); });
  };
  drawTags();

  bindRadio(body, "category", () => selectedCategory, (v) => { selectedCategory = v; syncActions(); });
  bindRadio(body, "subcategory", () => selectedSubcategory, (v) => { selectedSubcategory = v; syncActions(); });

  const canSubmit = (): boolean => {
    if (!nameInput.value.trim() || !selectedCategory || !selectedSubcategory) return false;
    if (naCheck.checked) return true;
    const qty = Math.floor(Number(countInput.value));
    return Number.isFinite(qty) && qty >= 1;
  };

  const syncActions = (): void => {
    const ok = canSubmit();
    confirmBtn.disabled = !ok;
    addAnotherBtn.disabled = !ok;
  };

  const setNa = (on: boolean) => {
    naCheck.checked = on;
    countInput.disabled = on;
    if (on) countInput.value = "";
    else if (!countInput.value || Number(countInput.value) < 1) countInput.value = "1";
  };

  typeSelect.addEventListener("change", () => {
    if (typeSelect.value === "TODO") setNa(true);
    else if (naCheck.checked) setNa(false);
    syncActions();
  });
  naCheck.addEventListener("change", () => {
    setNa(naCheck.checked);
    syncActions();
  });
  countInput.addEventListener("input", syncActions);
  nameInput.addEventListener("input", syncActions);

  nameInput.focus();
  if (draft.name) nameInput.select();
  syncActions();

  const dismiss = (notify: boolean) => {
    overlay.remove();
    if (notify) opts.onDone();
  };

  const readDraft = (): CustomItemDraft | null => {
    const name = nameInput.value.trim();
    if (!name || !selectedCategory || !selectedSubcategory) {
      showToast("Enter a name and pick category and subcategory");
      nameInput.focus();
      return null;
    }
    const qty = naCheck.checked ? 0 : Math.floor(Number(countInput.value));
    if (!naCheck.checked && (!Number.isFinite(qty) || qty < 1)) {
      showToast("Enter a quantity or choose N/A");
      countInput.focus();
      return null;
    }
    return {
      name,
      category: selectedCategory,
      subcategory: selectedSubcategory,
      type: typeSelect.value as CustomItemDraft["type"],
      stage: stageSelect.value as CustomItemDraft["stage"],
      defaultCount: naCheck.checked ? 0 : qty,
      luggage: luggageSelect.value,
      travellers: [...tags.travellers],
      vehicles: [...tags.vehicles],
      weathers: [...tags.weathers],
      types: [...tags.types],
    };
  };

  const submit = async (addAnother: boolean) => {
    const next = readDraft();
    if (!next) return;
    confirmBtn.disabled = true;
    addAnotherBtn.disabled = true;
    try {
      await opts.onSave(next);
      if (addAnother) {
        nameInput.value = "";
        syncActions();
        nameInput.focus();
        return;
      }
      dismiss(true);
    } catch (err) {
      console.warn("Add item failed:", err);
      syncActions();
      showToast("Could not add item");
    }
  };

  overlay.querySelector("#cancel-add-item")?.addEventListener("click", () => dismiss(true));
  confirmBtn.addEventListener("click", () => { void submit(false); });
  addAnotherBtn.addEventListener("click", () => { void submit(true); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismiss(true);
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canSubmit()) void submit(false);
    }
  });

  return { close: () => dismiss(false) };
}
