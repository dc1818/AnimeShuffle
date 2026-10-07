import { normalizeTrailerResponse } from "./media-data.js";
// Shared public metadata only. A card and its details panel join one lookup.
// Successful lookups survive tab changes; transient failures are always retryable.
const cache = new Map(),
  pending = new Map();
export function cachedMedia(id, kind = "trailer") {
  const key = `${kind}:${id}`,
    entry = cache.get(key);
  if (entry?.expires > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}
export function loadMedia(id, kind = "trailer") {
  const key = `${kind}:${id}`,
    cached = cachedMedia(id, kind);
  if (cached) return Promise.resolve(cached);
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    let data;
    // Retry a transient HTTP/schema failure once before presenting an error.
    // A timeout already used the full budget, so it is left for an explicit retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/${kind}/${id}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const error = Error("Media couldn’t load. Please try again.");
          error.retryable =
            response.status >= 500 || [408, 429].includes(response.status);
          throw error;
        }
        const raw = await response.json();
        data = kind === "trailer" ? normalizeTrailerResponse(raw) : raw;
        if (kind === "pictures" && !Array.isArray(data?.pictures))
          throw Error("Images couldn’t load. Please try again.");
        break;
      } catch (error) {
        if (attempt || error.name === "AbortError" || error.retryable === false)
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        clearTimeout(timeout);
      }
    }
    cache.set(key, {
      data,
      expires:
        Date.now() +
        (data.trailers?.length || data.pictures?.length ? 86400000 : 3600000),
    });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return data;
  })()
    .catch((err) => {
      throw Error(
        err.name === "AbortError"
          ? "Media took too long to load. Please try again."
          : err.message,
      );
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, job);
  return job;
}
