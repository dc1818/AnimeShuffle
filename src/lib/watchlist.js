import { buildTaste, scoreAnime } from "./recommend.js";
import { releaseLabel } from "./release.js";
import { runtimeLabel, matchesPreferences } from "./preferences.js";
/** Unknown runtimes/dates stay last for both directions. No fabricated MAL added dates. */
export function orderWatchlist(
  entries,
  {
    reactions = {},
    list = [],
    preferences,
    tastePreferences,
    genre = "all",
    sort = "match",
    query = "",
    release = "all",
  } = {},
) {
  const taste = buildTaste(reactions, list, tastePreferences);
  const knownFirst = (a, b, direction) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : direction * (a - b);
  return entries
    .filter(
      ({ anime }) =>
        matchesPreferences(anime, preferences) &&
        (genre === "all" || anime.genres?.includes(genre)) &&
        anime.title.toLowerCase().includes(query.trim().toLowerCase()) &&
        (release === "all" ||
          (release === "available"
            ? ["currently_airing", "finished_airing"].includes(anime.status)
            : anime.status === release)),
    )
    .map((entry) => ({
      ...entry,
      score: scoreAnime(entry.anime, taste),
      minutes:
        entry.anime.duration > 0 && entry.anime.episodes > 0
          ? entry.anime.duration * entry.anime.episodes
          : null,
    }))
    .sort((a, b) => {
      let result;
      if (sort === "newest" || sort === "oldest")
        result = knownFirst(a.addedAt, b.addedAt, sort === "newest" ? -1 : 1);
      else if (sort === "shortest" || sort === "longest")
        result = knownFirst(a.minutes, b.minutes, sort === "shortest" ? 1 : -1);
      else
        result =
          Number(a.anime.status === "not_yet_aired") -
            Number(b.anime.status === "not_yet_aired") || b.score - a.score;
      return (
        result ||
        a.anime.title.localeCompare(b.anime.title) ||
        a.anime.id - b.anime.id
      );
    });
}

/** Plain text stays useful outside the app and contains no account credentials. */
export function watchlistText(entries, label = "Watchlist") {
  return (
    `Anime Shuffle — ${label}\n${entries.length} anime\n\n` +
    entries
      .map(
        ({ anime, addedAt }, i) =>
          `${i + 1}. ${anime.title}\n${releaseLabel(anime)} · ${runtimeLabel(anime)}\nGenres: ${(anime.genres || []).join(", ") || "Unknown"}\nAdded: ${addedAt ? new Date(addedAt).toISOString().slice(0, 10) : "Unknown"}\nhttps://myanimelist.net/anime/${anime.id}`,
      )
      .join("\n\n") +
    "\n"
  );
}
