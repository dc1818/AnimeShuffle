/** Progress measures completed work, never a timer pretending to know network speed. */
export function LoadingIndicator({ progress, label, detail, compact = false }) {
  const measured = Number.isFinite(progress);
  return (
    <div
      className={`loading-state${compact ? " loading-state-compact" : ""}`}
      aria-busy="true"
    >
      <div
        className="loading-ring"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={measured ? progress : undefined}
        aria-valuetext={
          measured ? `${progress}% of this loading stage completed` : "Loading"
        }
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="loading-track" cx="60" cy="60" r="50" />
          <circle
            className="loading-arc"
            cx="60"
            cy="60"
            r="50"
            style={
              measured
                ? {
                    animation: "none",
                    strokeDasharray: 314.159,
                    strokeDashoffset:
                      314.159 *
                      (1 - Math.max(0, Math.min(100, progress)) / 100),
                  }
                : undefined
            }
          />
        </svg>
        {measured && <strong>{progress}%</strong>}
      </div>
      <h2 role="status">{label}</h2>
      <p>{detail}</p>
    </div>
  );
}

/** Describe the actual shared task when the other feed already has a pick. */
export function pendingWorkLabel(state) {
  if (state.discoveryLoading) return "Finding your next Discover pick…";
  if (state.recommendationsLoading) return "Calculating your recommendations…";
  return state.busyMessage || "Saving your changes…";
}
