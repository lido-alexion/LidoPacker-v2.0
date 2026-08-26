import { clockPartsToHhmm, hhmmToClockParts, ClockPeriod } from "../utils/timeEngine";

const HOURS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const MINUTES = ["00", "15", "30", "45"];
const PERIODS: ClockPeriod[] = ["AM", "PM"];

type ClockMode = "hour" | "minute";

interface Draft {
  hour: string;
  minute: string;
  period: ClockPeriod;
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function draftFromHhmm(hhmm: string): Draft {
  const parts = hhmm ? hhmmToClockParts(hhmm) : null;
  return {
    hour: parts?.hour ?? "12",
    minute: parts?.minute ?? "00",
    period: parts?.period ?? "AM",
  };
}

function formatDraft(draft: Draft): string {
  return `${draft.hour}:${draft.minute} ${draft.period}`;
}

function clockNums(mode: ClockMode, selected: string): string {
  const values = mode === "hour" ? HOURS : MINUTES;
  return values.map((v, i) => {
    const step = mode === "hour" ? i : i * 3;
    const on = v === selected;
    return `<button type="button" class="time-clock__num${on ? " time-clock__num--on" : ""}" data-clock-val="${v}" style="--i:${step}" aria-label="${mode === "hour" ? `Hour ${v}` : `Minutes ${v}`}" aria-pressed="${on ? "true" : "false"}">${v}</button>`;
  }).join("");
}

function handDeg(mode: ClockMode, draft: Draft): number {
  if (mode === "hour") {
    const h = Number(draft.hour);
    return (h % 12) * 30;
  }
  return (Number(draft.minute) / 15) * 90;
}

function dialogHtml(title: string, draft: Draft, mode: ClockMode): string {
  return `
    <div class="overlay__dialog overlay__dialog--time" role="dialog" aria-label="${esc(title)}">
      <div class="overlay__title">${esc(title)}</div>
      <div class="time-clock-readout" aria-live="polite">
        <button type="button" class="time-clock-readout__part${mode === "hour" ? " time-clock-readout__part--on" : ""}" data-clock-mode="hour" aria-pressed="${mode === "hour" ? "true" : "false"}">${esc(draft.hour)}</button>
        <span class="time-clock-readout__colon" aria-hidden="true">:</span>
        <button type="button" class="time-clock-readout__part${mode === "minute" ? " time-clock-readout__part--on" : ""}" data-clock-mode="minute" aria-pressed="${mode === "minute" ? "true" : "false"}">${esc(draft.minute)}</button>
      </div>
      <div class="time-clock-body">
        <div class="time-clock" data-clock-face style="--hand:${handDeg(mode, draft)}deg">
          <div class="time-clock__face">
            <div class="time-clock__hand" aria-hidden="true"></div>
            <div class="time-clock__hub" aria-hidden="true"></div>
            ${clockNums(mode, mode === "hour" ? draft.hour : draft.minute)}
          </div>
        </div>
        <div class="time-clock-period" role="radiogroup" aria-label="AM or PM">
          ${PERIODS.map((p) => `
            <button type="button" class="time-clock-period__btn${p === draft.period ? " time-clock-period__btn--on" : ""}" data-period="${p}" role="radio" aria-checked="${p === draft.period ? "true" : "false"}">${p}</button>
          `).join("")}
        </div>
      </div>
      <div class="overlay__actions">
        <button type="button" class="btn btn--secondary" style="flex:1" data-clock-clear>Clear</button>
        <button type="button" class="btn btn--primary" style="flex:1" data-clock-done>Done</button>
      </div>
    </div>
  `;
}

function closeOpenPicker(): void {
  document.querySelector(".overlay--time")?.remove();
}

/** Single field that opens a 12-hour clock. Minutes 00/15/30/45; AM then PM. Hidden input keeps HH:mm. */
export function renderTimePicker(hiddenId: string, hhmm: string, ariaLabel = "Choose time"): string {
  const label = hhmm ? formatDraft(draftFromHhmm(hhmm)) : "";
  return `
    <div class="time-picker" data-time-for="${esc(hiddenId)}">
      <input type="hidden" id="${esc(hiddenId)}" value="${esc(hhmm || "")}" />
      <button type="button" class="time-picker__field" aria-haspopup="dialog" aria-label="${esc(ariaLabel)}">
        <span class="time-picker__value${label ? "" : " time-picker__value--empty"}">${label || "hh:mm"}</span>
        <span class="time-picker__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M12 7.5v5l3.5 2"/>
          </svg>
        </span>
      </button>
    </div>
  `;
}

export function bindTimePicker(container: HTMLElement, hiddenId: string): void {
  const wrap = container.querySelector(`[data-time-for="${hiddenId}"]`) as HTMLElement | null;
  const hidden = container.querySelector(`#${hiddenId}`) as HTMLInputElement | null;
  const field = wrap?.querySelector(".time-picker__field") as HTMLButtonElement | null;
  const valueEl = wrap?.querySelector(".time-picker__value") as HTMLElement | null;
  if (!wrap || !hidden || !field || !valueEl) return;

  const paintField = (hhmm: string): void => {
    hidden.value = hhmm;
    if (hhmm) {
      valueEl.textContent = formatDraft(draftFromHhmm(hhmm));
      valueEl.classList.remove("time-picker__value--empty");
    } else {
      valueEl.textContent = "hh:mm";
      valueEl.classList.add("time-picker__value--empty");
    }
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };

  field.addEventListener("click", () => {
    closeOpenPicker();
    let draft = draftFromHhmm(hidden.value);
    let mode: ClockMode = "hour";
    const title = field.getAttribute("aria-label") || "Choose time";

    const overlay = document.createElement("div");
    overlay.className = "overlay overlay--time";

    const close = (): void => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      field.focus();
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };

    const bindSheet = (): void => {
      overlay.querySelectorAll<HTMLButtonElement>("[data-clock-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          mode = btn.dataset.clockMode === "minute" ? "minute" : "hour";
          draw();
        });
      });
      overlay.querySelectorAll<HTMLButtonElement>("[data-clock-val]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.clockVal || "";
          if (mode === "hour") {
            draft = { ...draft, hour: val };
            mode = "minute";
          } else {
            draft = { ...draft, minute: val };
          }
          draw();
        });
      });
      overlay.querySelectorAll<HTMLButtonElement>("[data-period]").forEach((btn) => {
        btn.addEventListener("click", () => {
          draft = { ...draft, period: btn.dataset.period === "PM" ? "PM" : "AM" };
          draw();
        });
      });
      overlay.querySelector("[data-clock-clear]")?.addEventListener("click", () => {
        paintField("");
        close();
      });
      overlay.querySelector("[data-clock-done]")?.addEventListener("click", () => {
        paintField(clockPartsToHhmm(draft.hour, draft.minute, draft.period));
        close();
      });
    };

    const draw = (): void => {
      overlay.innerHTML = dialogHtml(title, draft, mode);
      bindSheet();
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    draw();
  });
}
