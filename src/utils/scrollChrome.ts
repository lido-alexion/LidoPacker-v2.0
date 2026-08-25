/**
 * Auto-hide chrome on scroll (design-doc issues: real-estate optimisation on
 * the item-selection and packing screens).
 *
 * On small/short viewports, static bars above the item list eat up most of
 * the visible height. This utility progressively collapses a priority-ordered
 * list of "chrome" elements as the user scrolls the *page*, and restores them
 * near the top.
 *
 * The global site header (and offline banner) is always the first thing to
 * collapse. Callers add their own screen-local elements after that.
 *
 * Scroll lives on the document (html/body), not an inner pane, so the
 * browser scrollbar sits on the window edge.
 */

const GLOBAL_CHROME_SELECTOR = ".site-header, #offline-bar";

export interface AutoHideChromeHandle {
  /** Detach the scroll listener and restore every stage to its expanded state. */
  destroy(): void;
}

export function getPageScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function setPageScrollTop(y: number): void {
  window.scrollTo(0, y);
}

/**
 * @param localStages Screen-local elements to collapse, in the order they should hide.
 */
export function initAutoHideOnScroll(localStages: (HTMLElement | null)[]): AutoHideChromeHandle {
  const globalStages = Array.from(document.querySelectorAll<HTMLElement>(GLOBAL_CHROME_SELECTOR));
  const stages = [...globalStages, ...localStages].filter((el): el is HTMLElement => !!el);

  if (stages.length === 0) return { destroy(): void {} };

  const heights = stages.map((el) => el.scrollHeight);
  stages.forEach((el, i) => {
    el.classList.add("chrome-collapsible");
    el.style.maxHeight = `${heights[i]}px`;
  });

  const HIDE_AT = 16;

  function apply(instant: boolean): void {
    const scrolled = getPageScrollTop();
    let threshold = HIDE_AT;
    stages.forEach((el, i) => {
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
  window.addEventListener("scroll", onScroll, { passive: true });
  apply(true);

  return {
    destroy(): void {
      window.removeEventListener("scroll", onScroll);
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
