import { useLayoutEffect, useRef } from "react";

/** Equalize normal cards across the whole page without including an open player.
 * Measure intrinsic content rather than the card/row height, so a taller preview
 * cannot feed back into the shared size. Keep the active card's last cover size.
 */
export function WatchlistGrid({ className, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    const view = grid.ownerDocument.defaultView;
    const heights = new Map();
    let applied = 0;
    const measure = () => {
      const cards = [...grid.children];
      for (const card of heights.keys()) {
        if (!cards.includes(card)) heights.delete(card);
      }
      for (const card of cards) {
        if (card.querySelector(".trailer-panel:not([hidden])")) continue;
        const content = card.querySelector(".saved-content");
        const cover = card.querySelector(".saved-image");
        if (!content || !cover) continue;
        const style = view.getComputedStyle(card);
        const inset = [
          "paddingTop",
          "paddingBottom",
          "borderTopWidth",
          "borderBottomWidth",
        ].reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
        heights.set(
          card,
          Math.ceil(
            Math.max(
              content.getBoundingClientRect().height,
              cover.getBoundingClientRect().height,
            ) + inset,
          ),
        );
      }
      const height = Math.max(0, ...heights.values());
      if (height !== applied) {
        applied = height;
        grid.style.setProperty("--watchlist-card-height", `${height}px`);
      }
    };
    const resize = view.ResizeObserver && new view.ResizeObserver(measure);
    const observe = () => {
      resize?.disconnect();
      resize?.observe(grid);
      grid
        .querySelectorAll(".saved-content, .saved-image")
        .forEach((el) => resize?.observe(el));
      measure();
    };
    const changes = new view.MutationObserver(observe);
    changes.observe(grid, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observe();
    view.addEventListener("resize", measure);
    return () => {
      resize?.disconnect();
      changes.disconnect();
      view.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
