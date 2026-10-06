// Public metadata only: never persist account lists, tokens, or user-derived community scores here.
const KEY = "anime-shuffle:verified-catalog:v1";
export function readCatalogCache(storage, now = Date.now()) {
  try {
    const entries = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(entries)
      ? entries
          .filter(
            (e) =>
              e &&
              e.expires > now &&
              e.expires <= now + 1800000 &&
              Number.isSafeInteger(e.anime?.id) &&
              typeof e.anime.title === "string" &&
              Array.isArray(e.anime.genres),
          )
          .slice(-30)
      : [];
  } catch {
    return [];
  }
}
export function writeCatalogCache(storage, entries) {
  try {
    const clean = entries
      .filter((e) => e.expires > Date.now())
      .slice(-30)
      .map(({ anime, expires }) => {
        const { listStatus, communityTaste, ...publicAnime } = anime;
        return { anime: publicAnime, expires };
      });
    storage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* Optional cache eviction/quota failures never block a reaction or account save. */
  }
}
