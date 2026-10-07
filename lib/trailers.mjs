import { AppError } from "./mal.mjs";
/** Accept IDs only. Never embed arbitrary URLs supplied by a metadata provider. */
export function trailerId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value)
    ? value
    : null;
}
export function createTrailerService({ fetcher = fetch, publicStore } = {}) {
  const cache = new Map(),
    pending = new Map();
  return {
    async get(id) {
      if (!Number.isSafeInteger(id) || id <= 0 || id > 10000000)
        throw new AppError("Invalid anime ID.");
      const key = "trailer:v1:" + id;
      const hit = cache.get(key) || publicStore?.get(key);
      if (hit?.expires > Date.now()) return hit.data;
      if (pending.has(id)) return pending.get(id);
      const job = (async () => {
        let response;
        try {
          response = await fetcher(
            `https://api.tenrai.org/v1/anime/${id}/videos`,
            {
              signal: AbortSignal.timeout(10000),
              headers: { Accept: "application/json" },
            },
          );
        } catch {
          throw new AppError("Preview could not load. Please try again.", 503);
        }
        if (!response.ok && response.status !== 404)
          throw new AppError("Preview could not load. Please try again.", 503);
        const body =
          response.status === 404
            ? { data: { promo: [] } }
            : await response.json();
        if (!Array.isArray(body.data?.promo))
          throw new AppError("Preview could not load. Please try again.", 502);
        // Only promos, never episode clips or music videos that can expose spoilers.
        const promo = body.data.promo.find((p) =>
          trailerId(p?.trailer?.youtube_id),
        );
        const data = { videoId: trailerId(promo?.trailer?.youtube_id) };
        const entry = {
          data,
          expires: Date.now() + (data.videoId ? 86400000 : 3600000),
        };
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, entry);
        publicStore?.set(key, entry);
        return data;
      })();
      pending.set(id, job);
      try {
        return await job;
      } finally {
        pending.delete(id);
      }
    },
  };
}
