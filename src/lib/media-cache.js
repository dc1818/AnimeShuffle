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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const job = (async () => {
    const response = await fetch(`/api/${kind}/${id}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw Error("Media couldn’t load. Please try again.");
    const data = await response.json();
    if (
      kind === "trailer" &&
      (!Array.isArray(data.trailers) ||
        data.trailers.some((t) => !/^[A-Za-z0-9_-]{11}$/.test(t.videoId || "")))
    )
      throw Error("Trailer information is unavailable.");
    if (kind === "pictures" && !Array.isArray(data.pictures))
      throw Error("Images are unavailable.");
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
      clearTimeout(timeout);
      pending.delete(key);
    });
  pending.set(key, job);
  return job;
}
