import { supportsBackgroundMotion } from "../lib/background-performance.js";
import { useEffect, useId, useState } from "react";

export const BACKGROUND_STYLES = [
  ["aurora", "Aurora ribbons"],
  ["liquid", "Liquid light"],
  ["comet", "Comet drift"],
];

let accelerated;
/** Decorative motion is optional; static anime colors remain on slower devices. */
export function AmbientBackground({
  enabled = true,
  style = "aurora",
  preview = false,
}) {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    if (preview || !enabled || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    accelerated ??= supportsBackgroundMotion();
    const update = () => setMotion(accelerated && !media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [enabled, preview]);
  const id = useId().replace(/:/g, "");
  const mode = BACKGROUND_STYLES.some(([key]) => key === style)
    ? style
    : "aurora";
  const [paused, setPaused] = useState(
    () => document.visibilityState === "hidden",
  );
  useEffect(() => {
    const update = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!motion || paused || preview || !enabled) return;
    let frame,
      previous = 0,
      start = 0,
      frames = 0,
      slow = 0,
      badWindows = 0;
    const sample = (time) => {
      if (previous) {
        frames++;
        if (time - previous > 28) slow++;
      }
      previous = time;
      start ||= time;
      if (time - start >= 2000) {
        badWindows = slow / Math.max(1, frames) > 0.35 ? badWindows + 1 : 0;
        if (badWindows >= 2) {
          accelerated = false;
          setMotion(false);
          return;
        }
        start = time;
        frames = 0;
        slow = 0;
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [motion, paused, preview, enabled]);
  const showLayers = enabled && (motion || preview);
  return (
    <div
      className="ambient"
      data-style={mode}
      data-enabled={enabled}
      data-paused={paused}
      data-motion={motion && !preview}
      aria-hidden="true"
    >
      {showLayers && mode === "aurora" && (
        <svg
          className="aurora-ribbons"
          viewBox="0 0 1440 1000"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <defs>
            <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="rgb(var(--cool))" stopOpacity="0" />
              <stop
                offset=".3"
                stopColor="rgb(var(--cool))"
                stopOpacity=".95"
              />
              <stop
                offset=".55"
                stopColor="rgb(var(--warm))"
                stopOpacity=".85"
              />
              <stop
                offset=".72"
                stopColor="rgb(var(--cool))"
                stopOpacity=".75"
              />
              <stop offset="1" stopColor="rgb(var(--warm))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map((n) => (
            <g className={`aurora-ribbon ribbon-${n}`} key={n}>
              <path
                className="ribbon-halo"
                d="M-180 860 C160 890 420 300 740 440 S1160 1160 1660 50"
                stroke={`url(#${id}-ribbon)`}
              />
              <path
                className="ribbon-core"
                d="M-180 860 C160 890 420 300 740 440 S1160 1160 1660 50"
                stroke={`url(#${id}-ribbon)`}
              />
              <path
                className="ribbon-edge"
                d="M-180 848 C160 878 420 288 740 428 S1160 1148 1660 38"
              />
            </g>
          ))}
        </svg>
      )}
      {showLayers && mode === "liquid" && (
        <div className="liquid-field">
          {[0, 1, 2, 3].map((n) => (
            <i className={`liquid-ring ring-${n}`} key={n} />
          ))}
        </div>
      )}
      {showLayers && mode === "comet" && (
        <div className="comet-field">
          <span className="comet-stars" />
          {Array.from({ length: 6 }, (_, n) => (
            <i className="comet-trail" key={n} style={{ "--n": n }} />
          ))}
        </div>
      )}
    </div>
  );
}
