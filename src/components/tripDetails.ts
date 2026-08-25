import { Trip } from "../utils/types";
import { formatDate } from "../utils/timeEngine";
import { renderAttributeSummary } from "./attributePicker";

export function openTripDetails(trip: Trip): void {
  document.querySelector(".overlay")?.remove();

  const dates = [
    formatDate(trip.startTime, trip.timezone),
    trip.endTime ? formatDate(trip.endTime, trip.timezone) : "",
  ].filter(Boolean).join(" – ");

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay__dialog overlay__dialog--details">
      <div class="overlay__title">${escHtml(trip.name)}</div>
      <div class="details-readonly">
        <div class="details-row">
          <div class="details-row__label">Destination</div>
          <div class="details-row__value">${escHtml(trip.location)}</div>
        </div>
        <div class="details-row">
          <div class="details-row__label">Dates</div>
          <div class="details-row__value">${escHtml(dates)}</div>
        </div>
        ${renderAttributeSummary(trip)}
      </div>
      <div class="overlay__actions">
        <button class="btn btn--primary btn--full" id="details-close">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#details-close")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
