import { TripBag } from "../utils/types";
import {
  BAG_COUNT_MAX,
  BAG_TYPES,
  normalizeTripBags,
  unusedBagTypes,
} from "../utils/tripBags";

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderBagFields(bags: TripBag[]): string {
  const rows = normalizeTripBags(bags);
  const unused = unusedBagTypes(rows);
  const body = rows.length
    ? rows.map((row, idx) => {
      const typeOptions = BAG_TYPES
        .filter((t) => t.id === row.type || unused.some((u) => u.id === t.id))
        .map((t) => `<option value="${esc(t.id)}"${t.id === row.type ? " selected" : ""}>${esc(t.label)}</option>`)
        .join("");
      return `
        <div class="bag-row" data-bag-row="${idx}">
          <select data-bag-type aria-label="Bag type">${typeOptions}</select>
          <input data-bag-count type="number" min="1" max="${BAG_COUNT_MAX}" step="1" value="${row.count}" aria-label="How many" />
          <button type="button" class="bag-row__remove" data-bag-remove aria-label="Remove bag">×</button>
        </div>
      `;
    }).join("")
    : `<div class="form-hint">None yet — packing will not ask which bag an item goes in.</div>`;

  return `
    <div class="form-field" id="bag-host-inner">
      <label>Bags you're taking <span class="label-optional">(optional)</span></label>
      <div class="form-hint">Example: 2 Luggage and 1 Carry. Items default to Carry. A dropdown appears when packing only if you have more than one bag.</div>
      <div class="bag-rows">${body}</div>
      ${unused.length ? `<button type="button" class="text-btn" id="add-bag-btn">+ Add a bag</button>` : ""}
    </div>
  `;
}

export function bindBagFields(
  container: HTMLElement,
  getBags: () => TripBag[],
  setBags: (next: TripBag[]) => void
): void {
  container.querySelectorAll<HTMLElement>("[data-bag-row]").forEach((row) => {
    const idx = Number(row.dataset.bagRow);
    row.querySelector("[data-bag-type]")?.addEventListener("change", (e) => {
      const next = [...getBags()];
      if (!next[idx]) return;
      next[idx] = { ...next[idx], type: (e.target as HTMLSelectElement).value };
      setBags(normalizeTripBags(next));
    });
    row.querySelector("[data-bag-count]")?.addEventListener("change", (e) => {
      const next = [...getBags()];
      if (!next[idx]) return;
      next[idx] = { ...next[idx], count: Number((e.target as HTMLInputElement).value) };
      setBags(normalizeTripBags(next));
    });
    row.querySelector("[data-bag-remove]")?.addEventListener("click", () => {
      setBags(getBags().filter((_, i) => i !== idx));
    });
  });

  container.querySelector("#add-bag-btn")?.addEventListener("click", () => {
    const current = normalizeTripBags(getBags());
    const nextType = unusedBagTypes(current)[0];
    if (!nextType) return;
    setBags([...current, { type: nextType.id, count: 1 }]);
  });
}
