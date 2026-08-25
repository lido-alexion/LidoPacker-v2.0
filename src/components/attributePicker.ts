import { Trip } from "../utils/types";
import {
  PERSONAS,
  VEHICLES,
  WEATHERS,
  TRIP_TYPES,
  TripAttributes,
  defaultTripAttributes,
} from "../utils/tripAttributes";

export function attributesFromTrip(trip: Partial<Trip> | null | undefined): TripAttributes {
  if (!trip) return defaultTripAttributes();
  const hasAny =
    (trip.travellers && trip.travellers.length) ||
    (trip.vehicles && trip.vehicles.length) ||
    (trip.weathers && trip.weathers.length) ||
    (trip.types && trip.types.length);
  if (!hasAny) return defaultTripAttributes();
  return {
    travellers: [...(trip.travellers || [])],
    vehicles: [...(trip.vehicles || [])],
    weathers: [...(trip.weathers || [])],
    types: [...(trip.types || [])],
  };
}

export function applyAttributes<T extends Partial<Trip>>(trip: T, attrs: TripAttributes): T {
  return {
    ...trip,
    travellers: [...attrs.travellers],
    vehicles: [...attrs.vehicles],
    weathers: [...attrs.weathers],
    types: [...attrs.types],
  };
}

function toggleValue(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((x) => x !== id);
}

export function togglePersona(attrs: TripAttributes, id: string): TripAttributes {
  const on = !attrs.travellers.includes(id);
  return { ...attrs, travellers: toggleValue(attrs.travellers, id, on) };
}

export function toggleWeather(attrs: TripAttributes, id: string): TripAttributes {
  const on = !attrs.weathers.includes(id);
  return { ...attrs, weathers: toggleValue(attrs.weathers, id, on) };
}

export function toggleVehicle(attrs: TripAttributes, id: string): TripAttributes {
  const on = !attrs.vehicles.includes(id);
  const vehicles = toggleValue(attrs.vehicles, id, on);
  let types = attrs.types;
  if (on) types = toggleValue(types, id, true);
  else types = types.filter((t) => t !== id);
  return { ...attrs, vehicles, types };
}

export function toggleType(attrs: TripAttributes, id: string): TripAttributes {
  if (attrs.vehicles.includes(id)) return attrs;
  const on = !attrs.types.includes(id);
  return { ...attrs, types: toggleValue(attrs.types, id, on) };
}

export function validateAttributes(attrs: TripAttributes): string | null {
  if (attrs.travellers.length === 0) return "Select at least one traveller.";
  if (attrs.types.length === 0) return "Select at least one trip type.";
  return null;
}

function chip(id: string, label: string, selected: boolean, disabled: boolean): string {
  const cls = [
    "chip",
    selected ? "chip--selected" : "",
    disabled ? "chip--disabled" : "",
  ].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-chip="${esc(id)}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
}

function chipRow(options: { id: string; label: string }[], selected: string[], disabledIds: string[] = []): string {
  return `<div class="chip-row">${options.map((o) => chip(o.id, o.label, selected.includes(o.id), disabledIds.includes(o.id))).join("")}</div>`;
}

export function renderAttributeFields(attrs: TripAttributes, locked: boolean): string {
  const typeOptions = TRIP_TYPES.map((t) => ({ id: t, label: t }));
  const typeSelected = attrs.types;
  const lockNote = locked ? `
    <div class="banner banner--warning attr-lock-banner">
      <div class="banner__icon">🔒</div>
      <div class="banner__content">
        <div class="banner__title">Trip tags are locked</div>
        <div class="banner__subtitle">
          Traveller, transport, weather and trip type can't be changed while items are on this trip.
          Remove all items first if you want to edit these.
        </div>
      </div>
    </div>
  ` : "";

  return `
    ${lockNote}
    <fieldset class="attr-fieldset" ${locked ? "disabled" : ""}>
      <div class="form-field" data-attr-group="travellers">
        <label>Who is travelling?</label>
        ${chipRow(PERSONAS, attrs.travellers)}
      </div>
      <div class="form-field" data-attr-group="vehicles">
        <label>How are you travelling?</label>
        ${chipRow(VEHICLES, attrs.vehicles)}
      </div>
      <div class="form-field" data-attr-group="weathers">
        <label>What will the weather be like?</label>
        ${chipRow(WEATHERS, attrs.weathers)}
      </div>
      <div class="form-field" data-attr-group="types">
        <label>What are you packing for?</label>
        ${chipRow(typeOptions, typeSelected)}
      </div>
    </fieldset>
  `;
}

export function bindAttributeFields(
  container: HTMLElement,
  getAttrs: () => TripAttributes,
  setAttrs: (next: TripAttributes) => void,
  locked: boolean
): void {
  if (locked) return;
  container.querySelectorAll<HTMLElement>("[data-attr-group]").forEach((field) => {
    const group = field.dataset.attrGroup!;
    field.querySelectorAll<HTMLButtonElement>("[data-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.chip!;
        const current = getAttrs();
        let next = current;
        if (group === "travellers") next = togglePersona(current, id);
        else if (group === "vehicles") next = toggleVehicle(current, id);
        else if (group === "weathers") next = toggleWeather(current, id);
        else next = toggleType(current, id);
        setAttrs(next);
      });
    });
  });
}

export function renderItemTagFields(attrs: TripAttributes): string {
  const typeOptions = TRIP_TYPES.map((t) => ({ id: t, label: t }));
  return `
    <div class="item-tag-fields">
      <div class="item-tag-fields__title">Tags</div>
      <div class="form-hint">Choose who, how, weather and trip types this item belongs to. Leave a group empty to match any trip.</div>
      <div class="form-field" data-item-attr-group="travellers">
        <label>Who is this for?</label>
        ${chipRow(PERSONAS, attrs.travellers)}
      </div>
      <div class="form-field" data-item-attr-group="vehicles">
        <label>Travel mode</label>
        ${chipRow(VEHICLES, attrs.vehicles)}
      </div>
      <div class="form-field" data-item-attr-group="weathers">
        <label>Weather</label>
        ${chipRow(WEATHERS, attrs.weathers)}
      </div>
      <div class="form-field" data-item-attr-group="types">
        <label>Trip types</label>
        ${chipRow(typeOptions, attrs.types)}
      </div>
    </div>
  `;
}

export function bindItemTagFields(
  container: HTMLElement,
  getAttrs: () => TripAttributes,
  setAttrs: (next: TripAttributes) => void
): void {
  container.querySelectorAll<HTMLElement>("[data-item-attr-group]").forEach((field) => {
    const group = field.dataset.itemAttrGroup!;
    field.querySelectorAll<HTMLButtonElement>("[data-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.chip!;
        const current = getAttrs();
        const list =
          group === "travellers" ? current.travellers
          : group === "vehicles" ? current.vehicles
          : group === "weathers" ? current.weathers
          : current.types;
        const nextList = toggleValue(list, id, !list.includes(id));
        if (group === "travellers") setAttrs({ ...current, travellers: nextList });
        else if (group === "vehicles") setAttrs({ ...current, vehicles: nextList });
        else if (group === "weathers") setAttrs({ ...current, weathers: nextList });
        else setAttrs({ ...current, types: nextList });
      });
    });
  });
}

export function renderAttributeSummary(trip: Trip): string {
  const attrs = attributesFromTrip(trip);
  const who = PERSONAS.filter((p) => attrs.travellers.includes(p.id)).map((p) => p.label);
  const how = VEHICLES.filter((v) => attrs.vehicles.includes(v.id)).map((v) => v.label);
  const weather = WEATHERS.filter((w) => attrs.weathers.includes(w.id)).map((w) => w.label);
  const types = attrs.types.filter((t) => !attrs.vehicles.includes(t));
  const row = (label: string, values: string[]) => `
    <div class="details-row">
      <div class="details-row__label">${esc(label)}</div>
      <div class="details-row__value">${values.length ? values.map((v) => `<span class="chip chip--static">${esc(v)}</span>`).join("") : "—"}</div>
    </div>
  `;
  return `
    ${row("Travellers", who)}
    ${row("Transport", how)}
    ${row("Weather", weather)}
    ${row("Packing for", types.length ? types : attrs.types)}
  `;
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
