import { catalogPreview, normalizeTrailerResponse } from "./media-data.js";
// Shared public metadata only. A card and its details panel join one lookup.
// Successful lookups survive tab changes; transient failures are always retryable.
const cache = new Map(),
  pending = new Map(),
  quietUntil = new Map(),
  listeners = new Map();
export function cachedMedia(id, kind = "trailer") {
  const key = `${kind}:${id}`,
    entry = cache.get(key);
  if (entry?.expires > Date.now()) return entry.data;
  return null;
}
const previousMedia = (id, kind) => cache.get(`${kind}:${id}`)?.data;
// Start public metadata while the candidate's required details are being checked.
// A catalog preview needs no request; the complete trailer list is still fetched
// separately when opening More details or replacing an unavailable video.
export function preparePreview(anime, options) {
  const known = cachedMedia(anime.id) || catalogPreview(anime);
  return known
    ? Promise.resolve(known)
    : prepareMedia(anime, "trailer", options);
}
/** Optional media must not turn a provider outage into a blocked discovery flow.
 * Keep fallback results separate from confirmed absence. A late successful read
 * updates mounted consumers too, so a temporary fallback never hides real media. */
export function prepareMedia(
  anime,
  kind = "trailer",
  { timeoutMs = 12000, force = false } = {},
) {
  const key = `${kind}:${anime.id}`,
    cached = cachedMedia(anime.id, kind);
  if (cached) return Promise.resolve(cached);
  const fallback = () => ({
    ...(previousMedia(anime.id, kind) ||
      (kind === "trailer"
        ? catalogPreview(anime) || { videoId: null, trailers: [] }
        : {
            pictures: anime.image
              ? [{ image: anime.image, thumbnail: anime.image }]
              : [],
          })),
    fallback: true,
  });
  if (!force && (quietUntil.get(key) || 0) > Date.now())
    return Promise.resolve(fallback());
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const recover = () => {
      if (quietUntil.size >= 200)
        quietUntil.delete(quietUntil.keys().next().value);
      quietUntil.set(key, Date.now() + 30000);
      finish(fallback());
    };
    const timer = setTimeout(recover, timeoutMs);
    loadMedia(anime.id, kind).then((value) => {
      quietUntil.delete(key);
      finish(value);
    }, recover);
  });
}
// Follow shared late results and make one quiet recovery attempt while mounted.
// A timeout is provisional, never a confirmed empty media collection.
export function observeMedia(
  anime,
  kind,
  listener,
  { start = true, timeoutMs } = {},
) {
  const key = `${kind}:${anime.id}`;
  let current = true,
    retry,
    retried = false;
  const receive = (value) => {
    if (!current) return;
    listener(value);
    clearTimeout(retry);
    if (value.fallback && !retried) {
      retried = true;
      retry = setTimeout(refresh, 30000);
    }
  };
  const refresh = () =>
    prepareMedia(anime, kind, { timeoutMs }).then((value) => {
      if (current) receive(cachedMedia(anime.id, kind) || value);
    });
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(receive);
  if (start) void refresh();
  return () => {
    current = false;
    clearTimeout(retry);
    listeners.get(key)?.delete(receive);
    if (!listeners.get(key)?.size) listeners.delete(key);
  };
}
export function loadMedia(id, kind = "trailer") {
  const key = `${kind}:${id}`,
    cached = cachedMedia(id, kind);
  if (cached) return Promise.resolve(cached);
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    let data;
    // Retry once in the background; consumers use a bounded, quiet fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/${kind}/${id}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const error = Error(
            response.status === 403
              ? "The media request was blocked. Please try again or open this anime on MyAnimeList."
              : "Media couldn’t load. Please try again.",
          );
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
        (data.partial
          ? 60000
          : data.trailers?.length || data.pictures?.length
            ? 86400000
            : 3600000),
    });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    for (const listener of listeners.get(key) || []) listener(data);
    return data;
  })()
    .catch((err) => {
      throw Error(
        err.name === "AbortError"
          ? "Media took too long to load. Please try again."
          : err instanceof TypeError
            ? "The media service could not be reached. Check your connection or content blocker, then try again."
            : err.message,
      );
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, job);
  return job;
}
