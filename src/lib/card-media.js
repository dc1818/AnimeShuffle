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
  const cover = prepareArtwork(anime.image, options);
  const preview =
    globalThis.document?.documentElement.dataset.hosting === "pages"
      ? Promise.resolve({ videoId: null, trailers: [] })
      : preparePreview(anime, { timeoutMs: options.previewTimeoutMs });
  const job = Promise.all([cover, preview])
    .then(([artwork, preview]) => {
      const entry = {
        artwork,
        preview,
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
