import { preparePreview } from "./media-cache.js";
const ready = new Map(),
  pending = new Map();
export const cardMediaKey = (anime) =>
  JSON.stringify([
    anime.id,
    anime.image,
    anime.previewVideoId,
    anime.previewRegionChecked,
    document.documentElement.dataset.hosting,
  ]);
const keyFor = cardMediaKey;
export const cardMediaReady = (anime) =>
  (ready.get(keyFor(anime)) || 0) > Date.now();
export function prepareCardMedia(anime) {
  const key = keyFor(anime);
  if (cardMediaReady(anime)) return Promise.resolve();
  if (pending.has(key)) return pending.get(key);
  const cover = new Promise((resolve, reject) => {
    // A known missing cover uses the card's existing unavailable artwork.
    if (!anime.image) return resolve();
    const image = new window.Image();
    let settled = false;
    const timer = setTimeout(
      () => finish(Error("The cover took too long to load.")),
      12000,
    );
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) {
        image.removeAttribute("src");
        reject(error);
      } else resolve();
    }
    image.onload = () => {
      if (!image.naturalWidth)
        return finish(Error("The cover could not load."));
      if (image.decode)
        image.decode().then(
          () => finish(),
          () => finish(Error("The cover could not be decoded.")),
        );
      else finish();
    };
    image.onerror = () => finish(Error("The cover could not load."));
    image.fetchPriority = "high";
    image.src =
      document.documentElement.dataset.hosting === "pages"
        ? anime.image
        : `/api/image?url=${encodeURIComponent(anime.image)}`;
  });
  const preview =
    document.documentElement.dataset.hosting === "pages"
      ? Promise.resolve()
      : preparePreview(anime);
  const job = Promise.all([cover, preview])
    .then(() => {
      if (ready.size >= 100) ready.delete(ready.keys().next().value);
      ready.set(key, Date.now() + 1800000);
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
