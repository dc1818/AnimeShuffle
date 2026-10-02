// Watchlists change slowly. Reuse fresh snapshots across timers, focus and tab
// changes; explicit Refresh and user writes remain immediate.
export const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;
