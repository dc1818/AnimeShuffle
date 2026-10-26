// This worker never stores accounts, anime data, OAuth responses or app bundles.
// Keep the cache bounded to this single public, self-contained offline page.
const OFFLINE_CACHE = "anime-shuffle-offline-v1";
const OFFLINE_PAGE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.add(
        new Request(OFFLINE_PAGE, { cache: "reload", credentials: "omit" }),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("anime-shuffle-offline-") && name !== OFFLINE_CACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !["/", "/index.html"].includes(url.pathname) ||
    url.searchParams.has("connected") ||
    url.searchParams.has("auth_error")
  )
    return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(request); // Preserve redirects, errors and fresh HTML.
      } catch {
        const offline = await (
          await caches.open(OFFLINE_CACHE)
        ).match(OFFLINE_PAGE);
        return (
          offline ||
          new Response("Connect to the internet and reopen Anime Shuffle.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});
