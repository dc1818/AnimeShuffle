import { canonicalGenre } from "./genres.js";
import { titleFields } from "./titles.js";
// Selected genres guide ranking and restrict Discover/Recommendations.
export const GENRES = [
  "Action",
  "Adventure",
  "Avant Garde",
  "Award Winning",
  "Comedy",
  "Drama",
  "Fantasy",
  "Gourmet",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Suspense",
];
/** Viewing preferences use complete episode ranges, not assumed broadcast cours. */
export const FORMAT_OPTIONS = [
  { id: "series", label: "Series", detail: "TV and web series" },
  { id: "movies", label: "Movies", detail: "Any movie length" },
  {
    id: "shorts",
    label: "Shorts & specials",
    detail: "Short works, OVAs, specials and music videos",
  },
];
export const LENGTH_OPTIONS = [
  {
    id: "short",
    label: "1–13 episodes",
    detail: "About 5 hours or less*",
    min: 1,
    max: 13,
  },
  {
    id: "standard",
    label: "14–26 episodes",
    detail: "About 6–10 hours*",
    min: 14,
    max: 26,
  },
  {
    id: "medium",
    label: "27–49 episodes",
    detail: "About 11–20 hours*",
    min: 27,
    max: 49,
  },
  {
    id: "long",
    label: "50–99 episodes",
    detail: "About 20–40 hours*",
    min: 50,
    max: 99,
  },
  {
    id: "very-long",
    label: "100+ episodes",
    detail: "40+ hours*",
    min: 100,
    max: Infinity,
  },
];
export const defaultPreferences = () => ({
  favoriteGenres: [],
  favoriteAnime: [],
  formats: [],
  lengths: [],
  finishedOnly: false,
  includeUnknown: true,
  childrenTitles: "hide",
  includeNonCanonMovies: false,
  scoreMin: null,
  scoreMax: null,
});

/** Shared by client and server; discard unknown keys rather than persisting arbitrary input. */
export function normalizePreferences(value = {}) {
  const clean = (items, options) =>
    Array.isArray(items)
      ? [
          ...new Set(
            items.filter((id) => options.some((option) => option.id === id)),
          ),
        ]
      : [];
  const favoriteGenres = Array.isArray(value?.favoriteGenres)
    ? [
        ...new Set(
          value.favoriteGenres
            .map(canonicalGenre)
            .filter((g) => GENRES.includes(g)),
        ),
      ]
    : [];
  const favoriteAnime = Array.isArray(value?.favoriteAnime)
    ? [
        ...new Map(
          value.favoriteAnime
            .filter(
              (a) =>
                Number.isInteger(a?.id) &&
                a.id > 0 &&
                typeof a.title === "string",
            )
            .map((a) => [
              a.id,
              {
                id: a.id,
                title: a.title.slice(0, 200),
                ...titleFields(a),
                genres: Array.isArray(a.genres)
                  ? a.genres
                      .filter((g) => typeof g === "string")
                      .slice(0, 20)
                      .map((g) => canonicalGenre(g.slice(0, 60)))
                  : [],
                format:
                  typeof a.format === "string"
                    ? a.format.slice(0, 30)
                    : "unknown",
                image:
                  typeof a.image === "string" &&
                  /^https:\/\/(cdn|api-cdn)\.myanimelist\.net\/images\/anime\/[\w/.-]+$/.test(
                    a.image,
                  )
                    ? a.image
                    : "",
              },
            ]),
        ).values(),
      ].slice(0, 3)
    : [];
  const scoreBound = (n) =>
    typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
  let scoreMin = scoreBound(value?.scoreMin),
    scoreMax = scoreBound(value?.scoreMax);
  if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax)
    [scoreMin, scoreMax] = [scoreMax, scoreMin];
  return {
    scoreMin,
    scoreMax,
    includeNonCanonMovies: value?.includeNonCanonMovies === true,
    favoriteGenres,
    favoriteAnime,
    formats: clean(value?.formats, FORMAT_OPTIONS),
    lengths: clean(value?.lengths, LENGTH_OPTIONS),
    finishedOnly: value?.finishedOnly === true,
    includeUnknown: value?.includeUnknown !== false,
    // Migrate old Automatic defaults to off; an explicit Include still opts in
    // to learning, never to an unrestricted stream of children’s shows.
    childrenTitles: value?.childrenTitles === "include" ? "include" : "hide",
  };
}

export function matchesPreferences(anime, input) {
  const preferences = normalizePreferences(input);
  // MAL's community mean is separate from the connected user's personal score.
  if (preferences.scoreMin !== null || preferences.scoreMax !== null) {
    const score = anime.score;
    if (
      !Number.isFinite(score) ||
      score <= 0 ||
      score > 10 ||
      (preferences.scoreMin !== null && score < preferences.scoreMin) ||
      (preferences.scoreMax !== null && score > preferences.scoreMax)
    )
      return false;
  }
  const format = anime.format;
  const duration = Number(anime.duration) || 0;
  const episodes = Number(anime.episodes) || 0;
  // TV shorts are still series. Single short films may appear under Movies or Shorts.
  const groups = [];
  if (["tv", "ona"].includes(format) || (format === "ova" && episodes > 1))
    groups.push("series");
  if (format === "movie") groups.push("movies");
  if (
    ["special", "tv_special", "ova", "music", "pv"].includes(format) ||
    (episodes === 1 && duration > 0 && duration < 30)
  )
    groups.push("shorts");
  if (!preferences.includeUnknown && (!groups.length || !episodes))
    return false;
  if (
    preferences.formats.length &&
    !groups.some((group) => preferences.formats.includes(group))
  ) {
    if (groups.length || !preferences.includeUnknown) return false;
  }
  if (preferences.finishedOnly && anime.status !== "finished_airing")
    return false;
  // Episode-length selection applies to episodic works; a movie should not be
  // rejected because the viewer prefers long series alongside movies.
  if (groups.includes("series") && preferences.lengths.length) {
    if (!episodes) return preferences.includeUnknown;
    return LENGTH_OPTIONS.some(
      (option) =>
        preferences.lengths.includes(option.id) &&
        episodes >= option.min &&
        episodes <= option.max,
    );
  }
  return true;
}

/** Display known title runtime, never a franchise total or a fabricated completion estimate. */
export function runtimeLabel(anime) {
  if (!anime.duration || !anime.episodes) return "Total time unknown";
  const minutes = Math.round(anime.duration * anime.episodes);
  const label =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `~${label}${anime.status === "finished_airing" ? " total" : " · listed episodes"}`;
}
