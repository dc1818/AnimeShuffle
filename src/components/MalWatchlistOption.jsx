/** Shared, explicit consent control for first-time setup and account settings. */
export function MalWatchlistOption({ enabled, onChange, disabled }) {
  return (
    <div className="setting-row">
      <div>
        <strong>Auto-add watchlist to MyAnimeList</strong>
        <p>
          Add existing site saves, future “Would watch” choices, and imports to
          MAL Plan to Watch. Existing MAL statuses are kept. Off by default.
        </p>
      </div>
      <input
        type="checkbox"
        role="switch"
        aria-label="Auto-add watchlist to MyAnimeList"
        checked={!!enabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
