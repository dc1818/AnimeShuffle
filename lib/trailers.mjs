import { AppError, validImage } from "./mal.mjs";
/** Accept IDs only. Never embed arbitrary provider URLs. */
export function trailerId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value)
    ? value
    : null;
}
export function normalizePromos(body) {
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
      p.trailer.privacy_status === "private"
    )
      continue;
    seen.add(videoId);
    trailers.push({
      videoId,
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
      p?.jpg?.image_url,
      p?.webp?.large_image_url,
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
    const key = `media:${kind === "pictures" ? "v3" : "v2"}:${kind}:${id}`;
    const hit = cache.get(key) || publicStore?.get(key);
    if (hit?.expires > Date.now()) return hit.data;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      let body;
      try {
        const response = await fetcher(
          `https://api.tenrai.org/v1/anime/${id}/${kind}`,
          {
            signal: AbortSignal.timeout(10000),
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok && response.status !== 404) throw Error();
        body =
          response.status === 404
            ? { data: kind === "videos" ? { promo: [] } : [] }
            : await response.json();
      } catch {
        throw new AppError("Media could not load. Please try again.", 503);
      }
      const data =
        kind === "videos" ? normalizePromos(body) : normalizePictures(body);
      const hasMedia =
        kind === "videos" ? data.trailers.length : data.pictures.length;
      const entry = {
        data,
        expires: Date.now() + (hasMedia ? 86400000 : 3600000),
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
    get: (id) => get(id, "videos"),
    pictures: (id) => get(id, "pictures"),
  };
}
