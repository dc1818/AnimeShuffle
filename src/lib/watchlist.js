import { buildTaste, scoreAnime } from "./recommend.js";
import { matchesPreferences } from "./preferences.js";
/** Unknown runtimes/dates stay last for both directions. No fabricated MAL added dates. */
export function orderWatchlist(
  entries,
  {
    reactions = {},
    list = [],
    preferences,
    sort = "match",
    query = "",
    release = "all",
  } = {},
) {
  const taste = buildTaste(reactions, list);
  const knownFirst = (a, b, direction) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : direction * (a - b);
  return entries
    .filter(
      ({ anime }) =>
        matchesPreferences(anime, preferences) &&
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
