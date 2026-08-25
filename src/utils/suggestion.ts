export const SUGGESTION_NAME_MAX = 80;

/** Trim, collapse spaces, cap length — shared with the PHP suggestion store. */
export function sanitiseSuggestionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, SUGGESTION_NAME_MAX);
}
