import {
  matchesTitle,
  titleFields,
  primaryTitle,
  englishTitle,
} from "./titles.js";
import { buildTaste, scoreAnime } from "./recommend.js";
import { releaseLabel } from "./release.js";
import { runtimeLabel, matchesPreferences } from "./preferences.js";
/** One visible watchlist, merged by MAL ID without fabricating local reactions.
 * MAL progress removes stale planned saves; explicit seen/dislike reactions hide plans.
 */
export function combinedWatchlist(reactions = {}, list = []) {
  const mal = new Map(list.map((anime) => [anime.id, anime]));
  const entries = new Map();
  for (const anime of list) {
    const reaction = reactions[anime.id];
    if (
      anime.listStatus?.status === "plan_to_watch" &&
      (!reaction || reaction.action === "watch")
    )
      entries.set(anime.id, { anime, addedAt: null, site: false, mal: true });
  }
  for (const reaction of Object.values(reactions)) {
    if (reaction.action !== "watch") continue;
    const anime = mal.get(reaction.anime.id);
    if (
      anime?.listStatus?.status &&
      anime.listStatus.status !== "plan_to_watch"
    )
      continue;
    entries.set(reaction.anime.id, {
      anime: anime ? { ...reaction.anime, ...anime } : reaction.anime,
      addedAt: reaction.at || null,
      site: true,
      mal: anime?.listStatus?.status === "plan_to_watch",
    });
  }
  return [...entries.values()];
}
export function missingMalPlans(reactions = {}, list = []) {
  const known = new Set(list.map((anime) => anime.id));
  return combinedWatchlist(reactions, list).filter(
    (entry) => entry.site && !known.has(entry.anime.id),
  );
}

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
        matchesTitle(anime, query) &&
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
          `${i + 1}. ${primaryTitle(anime)}${englishTitle(anime) ? " — " + englishTitle(anime) : ""}\n${releaseLabel(anime)} · ${runtimeLabel(anime)}\nGenres: ${(anime.genres || []).join(", ") || "Unknown"}\nAdded: ${addedAt ? new Date(addedAt).toISOString().slice(0, 10) : "Unknown"}\nhttps://myanimelist.net/anime/${anime.id}`,
      )
      .join("\n\n") +
    "\n"
  );
}

/** Versioned, account-free backup. JSON is the round-trip format; text is for reading. */
export function watchlistBackup(entries) {
  return JSON.stringify(
    {
      app: "anime-shuffle",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: entries.map(({ anime, addedAt }) => ({ anime, addedAt })),
    },
    null,
    2,
  );
}

/** Treat uploaded files as untrusted data. Reject malformed backups before changing state. */
export function parseWatchlistBackup(text) {
  if (typeof text !== "string" || text.length > 5 * 1024 * 1024)
    throw new Error("Choose a JSON backup smaller than 5 MB.");
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(
      "This is not a valid JSON backup. Choose an Anime Shuffle .json export.",
    );
  }
  if (
    file?.app !== "anime-shuffle" ||
    file.version !== 1 ||
    !Array.isArray(file.entries) ||
    file.entries.length > 10000 ||
    (file.exportedAt !== undefined &&
      (typeof file.exportedAt !== "string" ||
        !Number.isFinite(Date.parse(file.exportedAt))))
  )
    throw new Error(
      "Unsupported backup. Use an Anime Shuffle version 1 JSON export (up to 10,000 titles).",
    );
  return file.entries.map((entry) => {
    const a = entry?.anime;
    if (
      !Number.isSafeInteger(a?.id) ||
      a.id <= 0 ||
      a.id > 10000000 ||
      (a.genres !== undefined &&
        (!Array.isArray(a.genres) ||
          a.genres.some((g) => typeof g !== "string"))) ||
      typeof a.title !== "string" ||
      !a.title.trim()
    )
      throw new Error(
        "The backup contains an invalid anime entry. Nothing was imported.",
      );
    const cleanText = (value, max) =>
      typeof value === "string" ? value.slice(0, max) : "";
    const positive = (value) =>
      Number.isFinite(value) && value > 0 ? value : 0;
    return {
      addedAt:
        Number.isFinite(entry.addedAt) &&
        entry.addedAt > 0 &&
        entry.addedAt <= Date.now()
          ? entry.addedAt
          : null,
      anime: {
        id: a.id,
        title: a.title.trim().slice(0, 200),
        ...titleFields(a),
        genres: Array.isArray(a.genres)
          ? a.genres
              .filter((g) => typeof g === "string")
              .slice(0, 20)
              .map((g) => g.slice(0, 60))
          : [],
        image:
          typeof a.image === "string" &&
          /^https:\/\/(cdn|api-cdn)\.myanimelist\.net\/images\/anime\/[\w/.-]+\.(jpg|jpeg|png|webp)$/i.test(
            a.image,
          )
            ? a.image
            : "",
        format: cleanText(a.format, 30),
        status: [
          "finished_airing",
          "currently_airing",
          "not_yet_aired",
        ].includes(a.status)
          ? a.status
          : "",
        duration: positive(a.duration),
        episodes: Math.floor(positive(a.episodes)),
        synopsis: cleanText(a.synopsis, 10000),
        nsfw: ["white", "gray", "black"].includes(a.nsfw) ? a.nsfw : "",
        score:
          Number.isFinite(a.score) && a.score > 0 && a.score <= 10
            ? a.score
            : null,
        ageRating: cleanText(a.ageRating, 20),
        scoreVotes:
          Number.isSafeInteger(a.scoreVotes) && a.scoreVotes > 0
            ? a.scoreVotes
            : null,
      },
    };
  });
}

/** Keep current choices and MAL progress; importing never overwrites a reaction. */
export function newWatchlistEntries(entries, reactions = {}, list = []) {
  const known = new Set([
    ...Object.keys(reactions).map(Number),
    ...list
      .filter((a) => a.listStatus?.status !== "plan_to_watch")
      .map((a) => a.id),
  ]);
  return entries.filter(({ anime }) => {
    if (known.has(anime.id)) return false;
    known.add(anime.id);
    return true;
  });
}
