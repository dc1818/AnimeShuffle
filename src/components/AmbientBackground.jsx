import { supportsBackgroundMotion } from "../lib/background-performance.js";
import { useEffect, useId, useState } from "react";

export const BACKGROUND_STYLES = [
  ["aurora", "Aurora ribbons"],
  ["liquid", "Liquid light"],
  ["comet", "Comet drift"],
  ["sakura", "Sakura breeze"],
  ["skyline", "Moonlit skyline"],
  ["mountains", "Ink mountains"],
];

let accelerated;
/** Decorative motion is optional; static anime colors remain on slower devices. */
export function AmbientBackground({
  enabled = true,
  style = "aurora",
  preview = false,
  animated = true,
  matchAnime = true,
}) {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    if (
      preview ||
      !enabled ||
      !animated ||
      typeof window.matchMedia !== "function"
    ) {
      setMotion(false);
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    accelerated ??= supportsBackgroundMotion();
    const update = () => setMotion(accelerated && !media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [enabled, preview, animated]);
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
  const showLayers = enabled;
  return (
    <div
      className="ambient"
      data-style={mode}
      style={
        !matchAnime
          ? {
              "--anime-cover": "none",
              "--cool": "90, 140, 190",
              "--warm": "190, 110, 155",
            }
          : undefined
      }
      data-enabled={enabled}
      data-paused={paused}
      data-motion={motion && !preview}
      aria-hidden="true"
    >
      {showLayers && ["sakura", "skyline", "mountains"].includes(mode) && (
        <svg
          className={`anime-scene scene-${mode}`}
          viewBox="0 0 1440 1000"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <circle className="scene-moon" cx="1110" cy="235" r="100" />
          {mode === "sakura" && (
            <>
              <path
                className="sakura-branch"
                d="M-30 780 Q170 580 210 280 Q250 190 420 100 M180 470 Q320 400 430 230 M205 300 Q90 220 30 80"
              />
              {Array.from({ length: 18 }, (_, n) => (
                <ellipse
                  key={n}
                  className="sakura-petal"
                  cx={80 + ((n * 173) % 1300)}
                  cy={80 + ((n * 107) % 780)}
                  rx="12"
                  ry="6"
                  style={{ "--n": n }}
                />
              ))}
            </>
          )}
          {mode === "skyline" && (
            <>
              <g className="scene-cloud">
                <path d="M80 280 Q290 200 520 270 T920 250" />
                <path d="M600 420 Q850 350 1300 390" />
              </g>
              <path
                className="scene-distant"
                d="M0 1000V670H100V570H170V690H300V520H360V650H470V590H600V700H720V560H810V660H940V500H1010V620H1120V580H1260V670H1440V1000Z"
              />
              <path
                className="scene-near"
                d="M0 1000V820H160V750H300V880H450V710H570V790H720V850H850V740H1000V800H1140V690H1240V830H1440V1000Z"
              />
              <path
                className="skyline-wire"
                d="M0 550 Q400 800 850 540 T1440 550 M180 500V1000 M1180 500V1000"
              />
            </>
          )}
          {mode === "mountains" && (
            <>
              <path
                className="scene-distant"
                d="M-100 1000L260 330 460 620 790 240 1200 760 1460 480V1000Z"
              />
              <path
                className="mountain-snow"
                d="M650 425L790 240 935 425 815 370 770 400 740 360Z M170 490L260 330 360 480 270 440 235 460Z"
              />
              <path
                className="scene-near"
                d="M-100 1000L170 690 390 860 720 540 1060 880 1320 660 1540 900V1000Z"
              />
              <g className="scene-cloud">
                <path d="M-80 710 Q300 600 650 720 T1500 720" />
                <path d="M-100 890 Q400 800 900 880 T1500 850" />
              </g>
            </>
          )}
        </svg>
      )}
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
