import { useId } from "react";

export const SCENE_STYLES = [
  ["rail", "Evening express"],
  ["observatory", "Sky observatory"],
  ["hangar", "Orbital hangar"],
];
export function resolveBackgroundStyle(style) {
  return (
    {
      sakura: "rail",
      skyline: "rail",
      mountains: "observatory",
      skyislands: "observatory",
      orbit: "hangar",
    }[style] || style
  );
}

// All moving objects are independent SVG groups. The painting is never transformed,
// recolored or distorted. One shared viewBox keeps objects aligned at every crop.
export function SceneEnvironment({ mode, preview = false }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`scene-environment scene-${mode}`}
      viewBox="0 0 1672 941"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x2="0" y2="1">
          <stop stopColor="#71818c" />
          <stop offset=".35" stopColor="#384851" />
          <stop offset=".55" stopColor="#192832" />
          <stop offset="1" stopColor="#0b1722" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x2="0" y2="1">
          <stop stopColor="#102734" />
          <stop offset="1" stopColor="#254454" />
        </linearGradient>
        <clipPath id={`${id}-sign`}>
          <rect x="78" y="95" width="548" height="111" rx="3" />
        </clipPath>
      </defs>
      <image
        href={`/backgrounds/${mode}-${preview ? "preview" : "scene"}.webp`}
        width="1672"
        height="941"
      />
      {mode === "rail" && (
        <>
          <g clipPath={`url(#${id}-sign)`}>
            <rect x="78" y="95" width="548" height="111" fill="#102129" />
            <path
              d="M92 192H608M92 110H608"
              className="scene-accent-stroke"
              strokeWidth="4"
              opacity=".9"
            />
            <g
              className="scene-sign-scroll"
              fill="rgb(var(--scene-cool))"
              fontFamily="sans-serif"
              fontSize="32"
              letterSpacing="6"
            >
              <text x="102" y="163">
                ANIME SHUFFLE • NEXT DEPARTURE
              </text>
            </g>
            <rect
              x="78"
              y="95"
              width="548"
              height="111"
              className="scene-accent-fill"
              opacity=".07"
            />
          </g>
          <g className="scene-train">
            {[0, 1, 2].map((n) => (
              <g key={n} transform={`translate(${n * 510} 0)`}>
                <path
                  d="M-500 796V647Q-500 620-471 620H-35Q-5 620 0 654V796Z"
                  fill={`url(#${id}-metal)`}
                  stroke="#0b1721"
                  strokeWidth="4"
                />
                <path
                  d="M-491 640H-21M-490 775H-10"
                  stroke="#b0bac1"
                  strokeWidth="3"
                  opacity=".55"
                />
                <path
                  d="M-492 739H-8"
                  className="scene-accent-stroke"
                  strokeWidth="12"
                />
                {[0, 1, 2, 3, 4].map((w) => (
                  <g key={w}>
                    <rect
                      x={-476 + w * 92}
                      y="656"
                      width="72"
                      height="58"
                      rx="5"
                      fill={`url(#${id}-glass)`}
                      stroke="#92a8b1"
                      strokeWidth="2"
                    />
                    <path
                      d={`M${-472 + w * 92} 662h64`}
                      stroke="#d1d8ce"
                      opacity=".6"
                    />
                    <rect
                      x={-474 + w * 92}
                      y="707"
                      width="68"
                      height="5"
                      className="scene-warm-fill"
                      opacity=".7"
                    />
                  </g>
                ))}
                <path
                  d="M-302 645v130M-290 645v130M-110 645v130M-98 645v130"
                  stroke="#101d28"
                  strokeWidth="3"
                />
                <circle
                  cx="-405"
                  cy="797"
                  r="19"
                  fill="#0c121c"
                  stroke="#53616b"
                  strokeWidth="5"
                />
                <circle
                  cx="-85"
                  cy="797"
                  r="19"
                  fill="#0c121c"
                  stroke="#53616b"
                  strokeWidth="5"
                />
              </g>
            ))}
          </g>
        </>
      )}
      {mode === "observatory" && (
        <>
          <g
            className="scene-instrument-position"
            transform="translate(198 320) scale(1.65)"
          >
            <g className="scene-orrery">
              <circle
                r="80"
                fill="none"
                className="scene-accent-stroke"
                strokeWidth="3"
              />
              <ellipse
                rx="80"
                ry="26"
                fill="none"
                stroke="#c6ab78"
                strokeWidth="5"
                transform="rotate(35)"
              />
              <ellipse
                rx="80"
                ry="26"
                fill="none"
                stroke="#c6ab78"
                strokeWidth="5"
                transform="rotate(-35)"
              />
              <path d="M-72 0H72M0-72V72" stroke="#ad9163" strokeWidth="3" />
              <circle r="12" className="scene-warm-fill" />
              <circle cx="80" r="8" className="scene-accent-fill" />
            </g>
          </g>
          <g transform="translate(0 -260)">
            <g className="scene-skyship">
              <path
                d="M-185 822Q-105 850-25 822L-58 850H-153Z"
                fill="#443c38"
                stroke="#a7977c"
                strokeWidth="2"
              />
              <path
                d="M-160 815L-110 757L-52 815Z"
                fill="#d3c6a9"
                stroke="#7c7469"
                strokeWidth="2"
              />
              <path d="M-110 758v78" stroke="#5d5140" strokeWidth="3" />
              <path
                d="M-152 840h94"
                className="scene-accent-stroke"
                strokeWidth="4"
              />
            </g>
          </g>
        </>
      )}
      {mode === "hangar" && (
        <>
          <g className="scene-shuttle">
            <path
              d="M-225 783L-160 753L-80 757L-22 786L-65 807H-180Z"
              fill={`url(#${id}-metal)`}
              stroke="#101c28"
              strokeWidth="4"
            />
            <path
              d="M-153 760L-82 765L-58 780H-167Z"
              fill="#203e51"
              stroke="#92a7af"
              strokeWidth="2"
            />
            <path
              d="M-180 786l-72 31h80l30-20M-75 787l50 32h-72l-26-20"
              fill="#394750"
              stroke="#101c28"
              strokeWidth="3"
            />
            <path
              d="M-218 791H-275"
              className="scene-engine scene-accent-stroke"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M-195 783H-170M-95 795H-65"
              className="scene-warm-stroke"
              strokeWidth="5"
            />
          </g>
          <g className="scene-dock-lights">
            {[52, 438, 1226, 1608].map((x, n) => (
              <path
                key={n}
                d={`M${x - 20} 818h40`}
                className="scene-accent-stroke scene-runway-light"
                style={{ "--lamp": n }}
                strokeWidth="5"
              />
            ))}
          </g>
        </>
      )}
      <rect width="1672" height="941" fill="#06101c" opacity=".15" />
    </svg>
  );
}
