/**
 * Auto-hide chrome on scroll (design-doc issues: real-estate optimisation on
 * the item-selection and packing screens).
 *
 * On small/short viewports, static bars above the scrollable item list eat
 * up most of the visible height. This utility progressively collapses a
 * priority-ordered list of "chrome" elements as the user scrolls down, and
 * restores them as soon as they scroll back near the top — so the list gets
 * the room it needs without permanently removing any controls.
 *
 * The global site header (and offline banner) is always the first thing to
 * collapse, since it's shared across every screen and never contains input
 * a user is mid-interaction with. Callers add their own screen-local
 * elements (e.g. the search/select-all toolbar) after that.
 */

const GLOBAL_CHROME_SELECTOR = ".site-header, #offline-bar";

export interface AutoHideChromeHandle {
  /** Detach the scroll listener and restore every stage to its expanded state. */
  destroy(): void;
}

/**
 * @param scrollEl The element that actually scrolls (the screen's `.screen` container).
 * @param localStages Screen-local elements to collapse, in the order they should hide.
 */
export function initAutoHideOnScroll(scrollEl: HTMLElement, localStages: (HTMLElement | null)[]): AutoHideChromeHandle {
  const globalStages = Array.from(document.querySelectorAll<HTMLElement>(GLOBAL_CHROME_SELECTOR));
  const stages = [...globalStages, ...localStages].filter((el): el is HTMLElement => !!el);

  if (stages.length === 0) return { destroy(): void {} };

  // Measure each stage's natural height before collapsing anything, so the
  // collapse animation shrinks from its real height instead of a guess.
  const heights = stages.map((el) => el.scrollHeight);
  stages.forEach((el, i) => {
    el.classList.add("chrome-collapsible");
    el.style.maxHeight = `${heights[i]}px`;
  });

  const HIDE_AT = 16; // px of scroll before the first stage starts collapsing

  function apply(instant: boolean): void {
    const scrolled = scrollEl.scrollTop;
    let threshold = HIDE_AT;
    stages.forEach((el, i) => {
      // Every screen re-render creates fresh stage elements (they start
      // expanded). Reading scrollHeight above forces a layout flush, so
      // immediately toggling the class afterward would otherwise animate a
      // spurious expand→collapse flash on load — which, combined with the
      // scrollTop already being restored to a scrolled position, looked
      // like the list "jumping" every time the screen re-rendered. Applying
      // the correct state with transitions disabled avoids that; only
      // real scroll events (below) animate smoothly.
      if (instant) el.style.transitionDuration = "0s";
      el.classList.toggle("chrome-collapsed", scrolled > threshold);
      threshold += heights[i];
    });
    if (instant) {
      requestAnimationFrame(() => {
        stages.forEach((el) => { el.style.transitionDuration = ""; });
      });
    }
  }

  const onScroll = () => apply(false);
  scrollEl.addEventListener("scroll", onScroll, { passive: true });
  apply(true);

  return {
    destroy(): void {
      scrollEl.removeEventListener("scroll", onScroll);
      stages.forEach((el) => {
        el.classList.remove("chrome-collapsed");
        el.style.maxHeight = "";
      });
    },
  };
}

/** Reset the shared global chrome (site header / offline bar) back to fully
 *  visible. Call this on every navigation so a screen that used auto-hide
 *  never leaves it collapsed for a screen that doesn't. */
export function resetGlobalChrome(): void {
  document.querySelectorAll<HTMLElement>(GLOBAL_CHROME_SELECTOR).forEach((el) => {
    el.classList.remove("chrome-collapsed");
    el.style.maxHeight = "";
  });
}
