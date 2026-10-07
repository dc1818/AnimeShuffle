import { normalizePreferences } from "./preferences.js";

export const GUEST_REACTION_LIMIT = 1000;
export const validGuestToken = (value) => /^[a-f0-9]{32}$/.test(value || "");

// The browser owns this random identity and its full local profile. This copy
// contains only fields needed for owner diagnostics, never MAL lists or tokens.
export function guestAnalyticsSnapshot(state) {
  const rows = Object.values(state.reactions || {}).sort(
    (a, b) => (b.at || 0) - (a.at || 0),
  );
  const anime = (a) => ({
    id: a.id,
    title: a.title,
    englishTitle: a.englishTitle,
    genres: a.genres,
    format: a.format,
    episodes: a.episodes,
    status: a.status,
  });
  const preferences = normalizePreferences(state.preferences);
  preferences.favoriteAnime = preferences.favoriteAnime.map(anime);
  return {
    reactions: rows.slice(0, GUEST_REACTION_LIMIT).map((r) => ({
      anime: anime(r.anime),
      action: r.action,
      at: r.at,
      reason: r.reason,
    })),
    totalReactions: rows.length,
    preferences,
    onboardingComplete: state.onboardingComplete === true,
  };
}
