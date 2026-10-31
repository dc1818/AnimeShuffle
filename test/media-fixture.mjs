// jsdom doesn't download/decode images. Integration tests unrelated to media
// timing use successful media; readiness tests control these promises explicitly.
export function resolvedMedia(window) {
  const originalFetch = globalThis.fetch;
  const OriginalImage = window.Image;
  window.Image = class {
    naturalWidth = 300;
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.onload?.());
    }
    decode() {
      return Promise.resolve();
    }
    removeAttribute() {}
  };
  globalThis.fetch = (url, options) => {
    if (String(url).startsWith("/api/trailer/"))
      return Promise.resolve(Response.json({ videoId: null, trailers: [] }));
    if (String(url).startsWith("/api/pictures/"))
      return Promise.resolve(Response.json({ pictures: [] }));
    return originalFetch(url, options);
  };
  return () => {
    globalThis.fetch = originalFetch;
    window.Image = OriginalImage;
  };
}
