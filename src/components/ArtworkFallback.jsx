/** Native artwork stays available offline and needs no image download. */
export function ArtworkFallback() {
  return (
    <svg
      className="artwork-fallback"
      viewBox="0 0 300 450"
      role="img"
      aria-label="Anime artwork placeholder"
    >
      <rect width="300" height="450" fill="#10212d" />
      <path d="M0 340 105 210 190 310 247 255 300 320V450H0Z" fill="#193544" />
      <circle cx="208" cy="129" r="36" fill="#284956" />
      <rect
        x="49"
        y="60"
        width="202"
        height="330"
        rx="16"
        fill="none"
        stroke="#436574"
        strokeWidth="2"
      />
    </svg>
  );
}
