import { regionAllows, filterRegionalTrailers } from "./media-region.mjs";
import { AppError, validImage } from "./mal.mjs";
/** Accept IDs only. Never embed arbitrary provider URLs. */
export function trailerId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value)
    ? value
    : null;
}
export function normalizePromos(
  body,
  { country = null, unfiltered = false } = {},
) {
  if (!Array.isArray(body.data?.promo))
    throw new AppError("Media could not load. Please try again.", 502);
  const seen = new Set();
  const trailers = [];
  // MAL's promotional video collection, not episode clips, AMVs or user searches.
  // Promos can still contain spoilers. Publisher identity isn't supplied by this API.
  for (const p of body.data.promo) {
    const videoId = trailerId(p?.trailer?.youtube_id);
    if (
      !videoId ||
      seen.has(videoId) ||
      p.trailer.embeddable === false ||
      p.trailer.privacy_status === "private" ||
      (!unfiltered && !regionAllows(p.trailer.region_restriction, country))
    )
      continue;
    seen.add(videoId);
    trailers.push({
      videoId,
      ...(unfiltered
        ? { regionRestriction: p.trailer.region_restriction }
        : {}),
      title:
        typeof p.title === "string"
          ? p.title.slice(0, 160)
          : `Trailer ${trailers.length + 1}`,
    });
    if (trailers.length === 40) break;
  }
  return { videoId: trailers[0]?.videoId || null, trailers };
}
export function normalizePictures(body) {
  if (!Array.isArray(body.data))
    throw new AppError("Images could not load. Please try again.", 502);
  const seen = new Set(),
    pictures = [];
  for (const p of body.data) {
    const image = [
      p?.jpg?.large_image_url,
      p?.webp?.large_image_url,
      p?.jpg?.image_url,
      p?.webp?.image_url,
    ].find(validImage);
    if (!image || seen.has(image)) continue;
    seen.add(image);
    const thumbnail =
      [p?.jpg?.image_url, p?.webp?.image_url].find(validImage) || image;
    pictures.push({ image, thumbnail });
    if (pictures.length === 60) break;
  }
  return { pictures };
}
export function createTrailerService({ fetcher = fetch, publicStore } = {}) {
  const cache = new Map(),
    pending = new Map();
  async function get(id, kind) {
    if (!Number.isSafeInteger(id) || id <= 0 || id > 10000000)
      throw new AppError("Invalid anime ID.");
    const key = `media:v5:${kind}:${id}`;
    const hit = cache.get(key) || publicStore?.get(key);
    if (hit?.expires > Date.now()) return hit.data;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const outcomes = {};
      const read = async (endpoint) => {
        outcomes[endpoint] = "network";
        const response = await fetcher(
          `https://api.tenrai.org/v1/anime/${id}/${endpoint}`,
          {
            signal: AbortSignal.timeout(10000),
            redirect: "manual",
            headers: { Accept: "application/json" },
          },
        );
        outcomes[endpoint] = `http_${response.status}`;
        if (response.status === 429) {
          const seconds = Number(response.headers.get("Retry-After"));
          const error = new AppError(
            "Media is being prepared.",
            429,
            "media_rate_limited",
          );
          error.retryAfter = Math.max(
            1,
            Number.isFinite(seconds) && seconds > 0 ? seconds : 60,
          );
          throw error;
        }
        if (!response.ok) throw Error();
        outcomes[endpoint] = "invalid_json";
        const body = await response.json();
        outcomes[endpoint] = "schema";
        return body;
      };
      let data;
      try {
        const body = await read(kind);
        data =
          kind === "videos"
            ? normalizePromos(body, { unfiltered: true })
            : normalizePictures(body);
      } catch (error) {
        if (error.status === 429) throw error;
        if (kind !== "videos")
          throw new AppError("Media could not load. Please try again.", 503);
        // The provider's video collection can fail independently of title details.
        // Reuse its real primary trailer, including all regional/embed checks.
        // Never cache an unavailable collection as a confirmed empty result.
        try {
          const body = await read("full");
          const trailer = body?.data?.trailer;
          outcomes.full = "no_primary_trailer";
          if (!trailerId(trailer?.youtube_id)) throw Error();
          data = {
            ...normalizePromos(
              {
                data: {
                  promo: [{ title: trailer.title || "Preview", trailer }],
                },
              },
              { unfiltered: true },
            ),
            partial: true,
          };
          outcomes.full = "unembeddable";
          if (!data.trailers.length) throw Error();
        } catch (error) {
          if (error.status === 429) throw error;
          throw new AppError(
            "Media could not load. Please try again.",
            503,
            `media_videos_${outcomes.videos}_full_${outcomes.full}`,
          );
        }
      }
      const hasMedia =
        kind === "videos" ? data.trailers.length : data.pictures.length;
      const entry = {
        data,
        expires:
          Date.now() + (data.partial ? 60000 : hasMedia ? 86400000 : 3600000),
      };
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
      publicStore?.set(key, entry);
      return data;
    })();
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }
  return {
    get: async (id, country = null) =>
      filterRegionalTrailers(await get(id, "videos"), country),
    pictures: (id) => get(id, "pictures"),
  };
}
