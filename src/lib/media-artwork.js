// Keep a foreground slot free while warming the next covers. Each job has a
// single time budget, including queueing, CDN fallback and image decoding.
const cache = new Map(),
  pending = new Map(),
  queue = [];
let active = 0,
  background = 0;
export const proxyImage = (url) =>
  url ? `/api/image?url=${encodeURIComponent(url)}` : undefined;
export function imageSources(url) {
  if (!url) return [];
  const direct =
    /^https:\/\/(?:cdn|api-cdn)\.myanimelist\.net\/images\/anime\//.test(url);
  if (globalThis.document?.documentElement.dataset.hosting === "pages")
    return direct ? [url] : [];
  return direct ? [proxyImage(url), url] : [proxyImage(url)];
}
export function cachedArtwork(url) {
  const entry = cache.get(url || "");
  return entry?.expires > Date.now() ? entry : null;
}
function pump() {
  while (active < 4) {
    let index = queue.findIndex((job) => job.priority !== "low");
    if (index < 0 && background < 3)
      index = queue.findIndex((job) => job.priority === "low");
    if (index < 0) break;
    const job = queue.splice(index, 1)[0],
      low = job.priority === "low";
    active++;
    if (low) background++;
    job
      .run()
      .then(job.resolve)
      .finally(() => {
        active--;
        if (low) background--;
        pump();
      });
  }
}
export function prepareArtwork(
  url,
  { priority = "high", timeoutMs = 2500 } = {},
) {
  const key = url || "",
    cached = cachedArtwork(url);
  if (cached) return Promise.resolve(cached);
  if (pending.has(key)) {
    const queued = queue.find((job) => job.key === key);
    if (queued && priority !== "low") {
      queued.priority = "high";
      pump();
    }
    return pending.get(key);
  }
  const deadline = Date.now() + timeoutMs;
  const job = new Promise((resolve) => {
    queue.push({
      key,
      priority,
      resolve,
      run: () =>
        new Promise((done) => {
          const sources = imageSources(url),
            images = [];
          let settled = false,
            started = 0,
            failures = 0,
            hedge;
          const finish = (source) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(hedge);
            for (const { image, source: originalSource } of images) {
              image.onload = image.onerror = null;
              if (originalSource !== source) image.removeAttribute("src");
            }
            const entry = {
              source,
              expires: Date.now() + (source ? 1800000 : 30000),
            };
            if (cache.size >= 200) cache.delete(cache.keys().next().value);
            cache.set(key, entry);
            done(entry);
          };
          const remaining = deadline - Date.now();
          const timer = setTimeout(() => finish(null), Math.max(0, remaining));
          const start = () => {
            if (settled || started >= sources.length) return;
            const source = sources[started++],
              image = new window.Image();
            images.push({ image, source });
            let finished = false;
            const failed = () => {
              if (finished || settled) return;
              finished = true;
              failures++;
              start();
              if (failures === sources.length) finish(null);
            };
            image.onerror = failed;
            image.onload = () => {
              if (settled || finished) return;
              if (!image.naturalWidth) return failed();
              Promise.resolve()
                .then(() => image.decode?.())
                .then(() => finish(source), failed);
            };
            image.fetchPriority = priority === "low" ? "low" : "high";
            image.src = source;
          };
          if (!sources.length || remaining <= 0) return finish(null); // Native SVG fallback needs no request.
          start();
          hedge = setTimeout(start, 350);
        }),
    });
    pump();
  }).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
