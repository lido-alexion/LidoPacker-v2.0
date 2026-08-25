import { clockPartsToHhmm, hhmmToClockParts } from "../utils/timeEngine";

const HOURS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const MINUTES = ["00", "15", "30", "45"];
const PERIODS = ["AM", "PM"] as const;

function options(values: string[], selected: string, blankLabel: string): string {
  const blank = `<option value="">${blankLabel}</option>`;
  const rest = values.map((v) =>
    `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`
  ).join("");
  return blank + rest;
}

/** Optional 12-hour picker: hours, quarter minutes, AM then PM. Hidden input keeps HH:mm for forms. */
export function renderTimePicker(hiddenId: string, hhmm: string): string {
  const parts = hhmm ? hhmmToClockParts(hhmm) : null;
  const hour = parts?.hour ?? "";
  const minute = parts?.minute ?? "";
  const period = parts?.period ?? "";
  return `
    <div class="time-picker" data-time-for="${hiddenId}">
      <input type="hidden" id="${hiddenId}" value="${hhmm || ""}" />
      <select class="time-picker__hour" aria-label="Hour">
        ${options(HOURS, hour, "Hour")}
      </select>
      <select class="time-picker__minute" aria-label="Minutes">
        ${options(MINUTES, minute, "Min")}
      </select>
      <select class="time-picker__period" aria-label="AM or PM">
        ${options([...PERIODS], period, "—")}
      </select>
    </div>
  `;
}

export function bindTimePicker(container: HTMLElement, hiddenId: string): void {
  const wrap = container.querySelector(`[data-time-for="${hiddenId}"]`) as HTMLElement | null;
  const hidden = container.querySelector(`#${hiddenId}`) as HTMLInputElement | null;
  if (!wrap || !hidden) return;

  const hourSel = wrap.querySelector(".time-picker__hour") as HTMLSelectElement;
  const minSel = wrap.querySelector(".time-picker__minute") as HTMLSelectElement;
  const periodSel = wrap.querySelector(".time-picker__period") as HTMLSelectElement;

  const sync = (): void => {
    hidden.value = clockPartsToHhmm(hourSel.value, minSel.value, periodSel.value);
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };

  hourSel.addEventListener("change", () => {
    if (hourSel.value) {
      if (!minSel.value) minSel.value = "00";
      if (!periodSel.value) periodSel.value = "AM";
    } else {
      minSel.value = "";
      periodSel.value = "";
    }
    sync();
  });
  minSel.addEventListener("change", () => {
    if (minSel.value && !hourSel.value) hourSel.value = "12";
    if (minSel.value && !periodSel.value) periodSel.value = "AM";
    if (!minSel.value && !hourSel.value) periodSel.value = "";
    sync();
  });
  periodSel.addEventListener("change", () => {
    if (periodSel.value && !hourSel.value) hourSel.value = "12";
    if (periodSel.value && !minSel.value) minSel.value = "00";
    if (!periodSel.value && !hourSel.value) minSel.value = "";
    sync();
  });
}
