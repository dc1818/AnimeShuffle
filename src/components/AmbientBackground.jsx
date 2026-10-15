import { useEffect, useId, useState } from "react";

export const BACKGROUND_STYLES = [
  ["aurora", "Aurora ribbons"],
  ["liquid", "Liquid light"],
  ["comet", "Comet drift"],
];

/** Decorative only: bounded layers, compositor animation, no requests or timers. */
export function AmbientBackground({ enabled = true, style = "aurora" }) {
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
  return (
    <div
      className="ambient"
      data-style={mode}
      data-enabled={enabled}
      data-paused={paused}
      aria-hidden="true"
    >
      {enabled && mode === "aurora" && (
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
      {enabled && mode === "liquid" && (
        <div className="liquid-field">
          {[0, 1, 2, 3].map((n) => (
            <i className={`liquid-ring ring-${n}`} key={n} />
          ))}
        </div>
      )}
      {enabled && mode === "comet" && (
        <div className="comet-field">
          <span className="comet-stars" />
          {Array.from({ length: 10 }, (_, n) => (
            <i className="comet-trail" key={n} style={{ "--n": n }} />
          ))}
        </div>
      )}
    </div>
  );
}
