import { useLayoutEffect, useRef } from "react";

/** Native top-layer dialog: never inserts height or scrolls the category list. */
export function CategoryPopover({ id, title, anchor, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const dialog = ref.current;
    const position = () => {
      const view = window.visualViewport;
      const width = view?.width || window.innerWidth;
      const height = view?.height || window.innerHeight;
      const vx = view?.offsetLeft || 0,
        vy = view?.offsetTop || 0;
      const outer = anchor?.closest("dialog");
      const bounds = outer?.getBoundingClientRect();
      const left = Math.max(vx + 12, bounds?.left + 12 || 0);
      const right = Math.min(vx + width - 12, bounds?.right - 12 || Infinity);
      const top = Math.max(vy + 12, bounds?.top + 12 || 0);
      const bottom = Math.min(
        vy + height - 12,
        bounds?.bottom - 12 || Infinity,
      );
      const w = Math.min(360, right - left);
      dialog.style.width = `${w}px`;
      dialog.style.maxHeight = `${bottom - top}px`;
      const rect = anchor?.getBoundingClientRect();
      const h = Math.min(dialog.scrollHeight, bottom - top);
      const centered = width <= 700 || !rect;
      let x = centered ? left + (right - left - w) / 2 : rect.right + 10;
      if (x + w > right) x = rect.left - w - 10;
      x = Math.max(left, Math.min(x, right - w));
      let y = centered ? top + (bottom - top - h) / 2 : rect.top - 16;
      y = Math.max(top, Math.min(y, bottom - h));
      dialog.style.left = `${x}px`;
      dialog.style.top = `${y}px`;
    };
    // Position first, then show: no visible downward travel or auto-scroll.
    position();
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    position();
    dialog.querySelector("h4")?.focus({ preventScroll: true });
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      if (dialog.close) dialog.close();
      else dialog.removeAttribute("open");
    };
  }, [anchor]);
  useLayoutEffect(() => {
    if (ref.current?.open) {
      ref.current.scrollTop = 0;
      ref.current.querySelector("h4")?.focus({ preventScroll: true });
    }
  }, [title]);
  return (
    <dialog
      ref={ref}
      id={id}
      className="category-popover interest-reader"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          close.current();
      }}
    >
      <div className="interest-reader-heading">
        <h4 tabIndex={-1} id={`${id}-title`}>
          {title}
        </h4>
        <button
          type="button"
          className="interest-reader-close"
          onClick={onClose}
          aria-label="Close category details"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
