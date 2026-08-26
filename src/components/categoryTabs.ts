function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface CategoryTabRenderOpts {
  /** Plain count (`6`) or progress (`2/6`). */
  countFor?: (cat: string) => string | number;
  /** Fully packed categories get a muted style when not selected. */
  isComplete?: (cat: string) => boolean;
}

export function renderCategoryTabs(
  tabs: string[],
  active: string,
  countForOrOpts?: ((cat: string) => string | number) | CategoryTabRenderOpts
): string {
  if (!tabs.length) return "";
  const opts: CategoryTabRenderOpts =
    typeof countForOrOpts === "function" ? { countFor: countForOrOpts } : (countForOrOpts || {});

  return `
    <div class="pill-tabs" id="category-tabs">
      <div class="pane-inner">
        ${tabs.map((cat) => {
          const raw = opts.countFor?.(cat);
          const count = raw == null || raw === "" ? "" : ` (${raw})`;
          const complete = opts.isComplete?.(cat) ? " pill-tabs__tab--complete" : "";
          const activeCls = cat === active ? " pill-tabs__tab--active" : "";
          return `<button type="button" class="pill-tabs__tab${activeCls}${complete}" data-cat="${escHtml(cat)}">${escHtml(cat)}${count}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}
