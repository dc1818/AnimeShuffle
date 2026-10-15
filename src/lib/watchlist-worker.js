import { buildTaste, scoreAnime } from "./recommend.js";
import { combinedWatchlist } from "./watchlist.js";

// Ranking stays local, but never trains the taste model on the UI thread.
self.onmessage = ({ data: { reactions, list, preferences } }) => {
  const entries = combinedWatchlist(reactions, list);
  const taste = entries.length
    ? buildTaste(reactions, list, preferences)
    : null;
  self.postMessage(
    Object.fromEntries(
      entries.map(({ anime }) => [anime.id, scoreAnime(anime, taste)]),
    ),
  );
};
