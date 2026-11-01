import { preparePreview } from "./media-cache.js";
import { prepareArtwork, cachedArtwork } from "./media-artwork.js";
const ready = new Map(),
  pending = new Map();
export const cardMediaKey = (anime) =>
  JSON.stringify([
    anime.id,
    anime.image,
    anime.previewVideoId,
    anime.previewRegionChecked,
    globalThis.document?.documentElement.dataset.hosting,
  ]);
export const cardMediaReady = (anime) =>
  (ready.get(cardMediaKey(anime))?.expires || 0) > Date.now() &&
  !!cachedArtwork(anime.image);
export const preparedPreview = (anime) =>
  ready.get(cardMediaKey(anime))?.preview;
export function prepareCardMedia(anime, options = {}) {
  const key = cardMediaKey(anime);
  if (cardMediaReady(anime)) return Promise.resolve(ready.get(key));
  if (pending.has(key)) {
    prepareArtwork(anime.image, options);
    return pending.get(key);
  }
  const started = performance.now();
  let artworkMs, previewMs;
  const cover = prepareArtwork(anime.image, options).then((artwork) => {
    artworkMs = Math.round(performance.now() - started);
    return artwork;
  });
  const preview =
    globalThis.document?.documentElement.dataset.hosting === "pages"
      ? Promise.resolve({ videoId: null, trailers: [] })
      : preparePreview(anime, {
          // Match the artwork budget. A stalled optional trailer must not hold
          // a decoded card for the full metadata timeout; mounted consumers
          // still observe late results and restore the real preview quietly.
          timeoutMs: options.previewTimeoutMs ?? 2500,
        });
  const timedPreview = preview.then((value) => {
    previewMs = Math.round(performance.now() - started);
    return value;
  });
  const job = Promise.all([cover, timedPreview])
    .then(([artwork, preview]) => {
      const entry = {
        artwork,
        preview,
        artworkMs,
        previewMs,
        expires:
          Date.now() + (preview.fallback || !artwork.source ? 30000 : 1800000),
      };
      if (ready.size >= 100) ready.delete(ready.keys().next().value);
      ready.set(key, entry);
      return entry;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
