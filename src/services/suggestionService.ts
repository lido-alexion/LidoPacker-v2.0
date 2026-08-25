import { sanitiseSuggestionName } from "../utils/suggestion";
import { assetPath } from "../utils/basePath";

/** Best-effort copy to the server suggestion list. Never blocks packing. */
export function suggestItemToServer(name: string, category = "Custom"): void {
  const clean = sanitiseSuggestionName(name);
  if (!clean) return;
  const url = assetPath("/api/suggest-item.php");
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name: clean, category }),
  }).catch((err) => {
    console.warn("Item suggestion was not sent:", err);
  });
}
