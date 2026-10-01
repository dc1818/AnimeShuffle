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
  formats: [],
  lengths: [],
  finishedOnly: false,
  includeUnknown: true,
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
  return {
    formats: clean(value?.formats, FORMAT_OPTIONS),
    lengths: clean(value?.lengths, LENGTH_OPTIONS),
    finishedOnly: value?.finishedOnly === true,
    includeUnknown: value?.includeUnknown !== false,
  };
}

export function matchesPreferences(anime, input) {
  const preferences = normalizePreferences(input);
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
