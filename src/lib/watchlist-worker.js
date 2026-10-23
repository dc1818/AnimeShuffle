import { buildTaste, scoreAnime } from "./recommend.js";
import { combinedWatchlist } from "./watchlist.js";

// Ranking stays local, but never trains the taste model on the UI thread.
self.onmessage = ({ data: { reactions, list, preferences } }) => {
  const entries = combinedWatchlist(reactions, list);
  const taste = entries.length
    ? buildTaste(reactions, list, preferences)
    : null;
  const scores = Object.fromEntries(
    entries.map(({ anime }) => [anime.id, scoreAnime(anime, taste)]),
  );
  // Explain only leading picks, using the same positive model contributions.
  // No fabricated percentages and no extra model training on the main thread.
  const reasons = {};
  const leading = [...entries]
    .sort(
      (a, b) =>
        Number(a.anime.status === "not_yet_aired") -
          Number(b.anime.status === "not_yet_aired") ||
        scores[b.anime.id] - scores[a.anime.id],
    )
    .slice(0, 12);
  for (const { anime } of leading) {
    const genres = (taste.model.explain(anime).contributions || [])
      .filter((c) => c.key.startsWith("genre:") && c.contribution > 0.00001)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)
      .map((c) => c.key.slice(6));
    if (genres.length)
      reasons[anime.id] = `Matches your interest in ${genres.join(" and ")}.`;
  }
  self.postMessage({ scores, reasons });
};
