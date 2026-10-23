import { useEffect, useRef, useState } from "react";
import { swipeChoice } from "../lib/discover-swipe.js";

const interactive =
  'button, a, input, select, textarea, video, iframe, summary, [role="button"], .trailer-panel';

export function useDiscoverSwipe({
  identity,
  enabled,
  disabled,
  unreleased,
  onReact,
}) {
  const gesture = useRef(null),
    timer = useRef(null),
    suppressClick = useRef(false);
  const latest = useRef({ disabled, unreleased, onReact });
  latest.current = { disabled, unreleased, onReact };
  const [drag, setDrag] = useState(null);
  function reset() {
    clearTimeout(timer.current);
    timer.current = null;
    gesture.current = null;
    setDrag(null);
  }
  useEffect(() => {
    reset();
    window.addEventListener("resize", reset);
    window.addEventListener("blur", reset);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("resize", reset);
      window.removeEventListener("blur", reset);
    };
  }, [identity, enabled, disabled]);
  function available(action) {
    return (
      action &&
      !(latest.current.unreleased && (action === "good" || action === "bad"))
    );
  }
  const handlers = {
    onPointerDown(e) {
      if (e.isPrimary === false) {
        reset();
        return;
      }
      if (
        !enabled ||
        latest.current.disabled ||
        timer.current ||
        e.pointerType !== "touch" ||
        !window.matchMedia("(max-width: 700px)").matches ||
        document.querySelector("dialog[open]") ||
        (e.target.closest(interactive) && !e.target.closest(".artwork-preview"))
      )
        return;
      suppressClick.current = false;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const captureTarget = e.target.closest(".artwork-preview") || e.currentTarget;
      captureTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e) {
      const start = gesture.current;
      if (!start || start.id !== e.pointerId) return;
      const x = e.clientX - start.x,
        y = e.clientY - start.y;
      if (Math.max(Math.abs(x), Math.abs(y)) > 8) suppressClick.current = true;
      const action = swipeChoice(x, y);
      setDrag({ x, y, action, blocked: !!action && !available(action) });
    },
    onPointerUp(e) {
      const start = gesture.current;
      if (!start || start.id !== e.pointerId) return;
      gesture.current = null;
      const x = e.clientX - start.x,
        y = e.clientY - start.y;
      const action = swipeChoice(x, y);
      if (
        latest.current.disabled ||
        document.querySelector("dialog[open]") ||
        !available(action)
      ) {
        reset();
        return;
      }
      suppressClick.current = true;
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const horizontal = action === "good" || action === "bad";
      setDrag({
        x: horizontal ? Math.sign(x) * window.innerWidth : 0,
        y: horizontal ? 0 : Math.sign(y) * window.innerHeight,
        action,
        leaving: true,
      });
      timer.current = setTimeout(
        () => {
          timer.current = null;
          if (latest.current.disabled) {
            reset();
            return;
          }
          // Same store action as the buttons: saves, ranking and Undo stay shared.
          const result = latest.current.onReact(action);
          Promise.resolve(result)
            .finally(reset)
            .catch(() => {});
        },
        reduced ? 0 : 160,
      );
    },
    onPointerCancel: reset,
    onLostPointerCapture() {
      if (gesture.current) reset();
    },
    onClickCapture(e) {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
  return { drag, handlers };
}
