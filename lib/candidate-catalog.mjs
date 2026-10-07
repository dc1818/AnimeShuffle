import { regionAllows } from "./media-region.mjs";
import { validVideoId } from "../src/lib/media-data.js";
import { AppError, normalize } from "./mal.mjs";
import { normalizePreferences } from "../src/lib/preferences.js";

const genreIds = {
  Action: 1,
  Adventure: 2,
  "Avant Garde": 5,
  "Award Winning": 46,
  Comedy: 4,
  Drama: 8,
  Fantasy: 10,
  Gourmet: 47,
  Horror: 14,
  Mystery: 7,
  Romance: 22,
  "Sci-Fi": 24,
  "Slice of Life": 36,
  Sports: 30,
  Supernatural: 37,
  Suspense: 41,
};
const ratings = {
  "G - All Ages": "g",
  "PG - Children": "pg",
  "PG-13 - Teens 13 or older": "pg_13",
  "R - 17+ (violence & profanity)": "r",
  "R+ - Mild Nudity": "r+",
  "Rx - Hentai": "rx",
};

/** Push only equivalent filters upstream. Multi-genre selections are OR locally,
 * whereas provider genre combinations can mean AND, so retain those locally. */
export function candidateQuery(url) {
  let raw;
  try {
    raw = JSON.parse(url.searchParams.get("preferences") || "{}");
  } catch {
    throw new AppError("Invalid catalog preferences.");
  }
  const p = normalizePreferences(raw);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset % 50 ||
    offset > 49950
  )
    throw new AppError("Invalid candidate offset.");
  const q = new URLSearchParams({
    limit: "50",
    page: String(offset / 50 + 1),
    order_by: url.searchParams.get("source") === "top" ? "score" : "members",
    sort: "desc",
  });
  if (!p.includeNsfw) q.set("sfw", "true");
  if (p.childrenTitles !== "include") q.set("genres_exclude", "15");
  if (p.favoriteGenres.length === 1 && genreIds[p.favoriteGenres[0]])
    q.set("genres", String(genreIds[p.favoriteGenres[0]]));
  if (p.formats.length === 1 && p.formats[0] === "movies")
    q.set("type", "movie");
  if (p.finishedOnly) q.set("status", "complete");
  if (p.scoreMin !== null) q.set("min_score", String(p.scoreMin));
  if (p.scoreMax !== null) q.set("max_score", String(p.scoreMax));
  return { q, offset };
}

export function normalizeCandidate(a) {
  const rating = ratings[a.rating] || "";
  const hours = Number(a.duration?.match(/(\d+)\s*hr/)?.[1] || 0);
  const minutes = Number(a.duration?.match(/(\d+)\s*min/)?.[1] || 0);
  const genres = [
    ...(a.genres || []),
    ...(a.explicit_genres || []),
    ...(a.themes || []),
    ...(a.demographics || []),
  ];
  const nsfw =
    rating === "rx" || genres.some((g) => g.name === "Hentai")
      ? "black"
      : rating === "r+" ||
          genres.some((g) => ["Erotica", "Ecchi"].includes(g.name))
        ? "gray"
        : rating
          ? "white"
          : "unknown";
  const anime = normalize({
    id: a.mal_id,
    title: a.title,
    alternative_titles: {
      en: a.title_english,
      ja: a.title_japanese,
      synonyms: a.title_synonyms,
    },
    main_picture: {
      large: a.images?.jpg?.large_image_url,
      medium: a.images?.jpg?.image_url,
    },
    synopsis: a.synopsis,
    genres,
    num_episodes: a.episodes,
    media_type: {
      TV: "tv",
      Movie: "movie",
      OVA: "ova",
      ONA: "ona",
      Special: "special",
      "TV Special": "tv_special",
      Music: "music",
      PV: "pv",
      CM: "cm",
    }[a.type],
    start_season: { year: a.year },
    start_date: a.aired?.from,
    status: {
      "Finished Airing": "finished_airing",
      "Currently Airing": "currently_airing",
      "Not yet aired": "not_yet_aired",
    }[a.status],
    average_episode_duration: (hours * 60 + minutes) * 60,
    mean: a.score,
    num_scoring_users: a.scored_by,
    rating,
    studios: a.studios,
    nsfw,
  });
  // The catalog already paid for this metadata. Keep it through MAL detail merges
  // so the main preview does not wait for a second provider request.
  if (
    validVideoId(a.trailer?.youtube_id) &&
    a.trailer.embeddable !== false &&
    a.trailer.privacy_status !== "private" &&
    regionAllows(a.trailer.region_restriction, null)
  ) {
    anime.previewVideoId = a.trailer.youtube_id;
    anime.previewRegionChecked = true;
  }
  return anime;
}

/** Public candidate pages only. Never forward MAL tokens, user lists or reactions. */
export function createCandidateCatalog({
  fetcher = fetch,
  publicStore,
  interval = 1000,
  timeout = 6000,
} = {}) {
  const memory = new Map(),
    pending = new Map();
  let tail = Promise.resolve(),
    nextAt = 0,
    retryAt = 0;
  return {
    async page(url) {
      const { q, offset } = candidateQuery(url);
      const key = "tenrai-candidates:v3:" + q;
      const cached = memory.get(key) || publicStore?.get(key);
      if (cached?.expires > Date.now())
        return { ...cached.data, cacheHit: true };
      if (pending.has(key)) return pending.get(key);
      if (Date.now() < retryAt)
        throw new AppError(
          "Candidate provider is temporarily unavailable.",
          503,
          "catalog_provider",
        );
      const job = tail.then(async () => {
        if (Date.now() < retryAt)
          throw new AppError(
            "Candidate provider is temporarily unavailable.",
            503,
            "catalog_provider",
          );
        const delay = nextAt - Date.now();
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
        nextAt = Date.now() + interval;
        try {
          const response = await fetcher(
            "https://api.tenrai.org/v1/anime?" + q,
            {
              signal: AbortSignal.timeout(timeout),
              headers: { Accept: "application/json" },
            },
          );
          if (!response.ok) {
            const retry = Number(response.headers.get("Retry-After"));
            retryAt =
              Date.now() +
              Math.max(30000, Number.isFinite(retry) ? retry * 1000 : 0);
            throw new Error("Candidate HTTP " + response.status);
          }
          const body = await response.json();
          if (
            !Array.isArray(body.data) ||
            !body.pagination ||
            typeof body.pagination.has_next_page !== "boolean"
          )
            throw new Error("Invalid candidate response");
          const data = {
            data: body.data
              .filter(
                (a) =>
                  Number.isSafeInteger(a?.mal_id) &&
                  typeof a.title === "string",
              )
              .map(normalizeCandidate),
            nextOffset:
              body.pagination.has_next_page && offset < 49950
                ? offset + 50
                : null,
            provider: "tenrai",
          };
          const entry = { data, expires: Date.now() + 1800000 };
          if (memory.size >= 100) memory.delete(memory.keys().next().value);
          memory.set(key, entry);
          publicStore?.set(key, entry);
          return data;
        } catch {
          retryAt = Math.max(retryAt, Date.now() + 30000);
          throw new AppError(
            "Candidate provider is temporarily unavailable.",
            503,
            "catalog_provider",
          );
        }
      });
      tail = job.catch(() => {});
      pending.set(key, job);
      try {
        return await job;
      } finally {
        pending.delete(key);
      }
    },
  };
}
