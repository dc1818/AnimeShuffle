import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { combinedWatchlist } from "../src/lib/watchlist.js";

const kimi = {
  id: 32281,
  title: "Kimi no Na wa.",
  titleEnglish: "Your Name.",
  genres: ["Drama"],
  format: "movie",
  episodes: 1,
  duration: 106,
  nsfw: "white",
  rating: "pg13",
  status: "finished_airing",
  prequels: [],
};
const catalog = [kimi, { ...kimi, id: 2, title: "Other movie" }];
function setup(connected = false) {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const request = async (url, options) => {
    if (url === "/api/session")
      return Response.json({ configured: true, connected });
    if (url === "/api/profile") return Response.json({ id: 77 });
    if (url.startsWith("/api/list"))
      return Response.json({ data: [], nextOffset: null });
    if (url.startsWith("/api/catalog"))
      return Response.json({ data: catalog, nextOffset: null });
    if (url.startsWith("/api/anime/"))
      return Response.json(
        catalog.find((a) => a.id === Number(url.split("/").pop())),
      );
    if (url.startsWith("/api/taste")) return Response.json({ profiles: {} });
    if (url === "/api/plan") {
      assert.ok(options.signal, "MAL writes are bounded");
      return Response.json({ error: "MAL unavailable" }, { status: 503 });
    }
    throw Error(url);
  };
  return { storage, request };
}
for (const source of ["discover", "recommendations"]) {
  for (const action of ["good", "bad", "watch", "nope"]) {
    test(`${source}: ${action} persists and excludes the exact MAL title after reload`, async () => {
      const options = setup();
      let store = createAnimeStore(options);
      await store.initialize();
      await store.savePreferences({ favoriteGenres: ["Drama"] });
      await store.loadRecommendations();
      const chosen = source === "discover" ? store.getSnapshot().current : kimi;
      await store.react(action, source === "recommendations" ? chosen : null);
      assert.equal(store.getSnapshot().reactions[chosen.id].action, action);
      assert.equal(
        combinedWatchlist(store.getSnapshot().reactions).some(
          (e) => e.anime.id === chosen.id,
        ),
        action === "watch",
      );
      await store.ensureUndecidedDiscovery();
      assert.notEqual(store.getSnapshot().current?.id, chosen.id);
      store = createAnimeStore(options);
      await store.initialize();
      assert.equal(store.getSnapshot().reactions[chosen.id].action, action);
      assert.notEqual(store.getSnapshot().current?.id, chosen.id);
      await store.loadRecommendations();
      assert.ok(
        store
          .getSnapshot()
          .recommendationPicks.every((p) => p.anime.id !== chosen.id),
      );
      assert.equal(
        combinedWatchlist(store.getSnapshot().reactions).some(
          (e) => e.anime.id === chosen.id,
        ),
        action === "watch",
      );
    });
  }
}
test("failed MAL auto-add cannot remove a Would watch save from the site or allow a repeat", async () => {
  const options = setup(true);
  const store = createAnimeStore(options);
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Drama"] });
  await store.loadRecommendations();
  store.setSettings({ autoAdd: true });
  await store.react("watch", kimi);
  assert.equal(
    combinedWatchlist(
      store.getSnapshot().reactions,
      store.getSnapshot().list,
    )[0].anime.id,
    kimi.id,
  );
  assert.match(store.getSnapshot().malSyncError, /MAL unavailable/);
  const restored = createAnimeStore(options);
  await restored.initialize();
  assert.equal(
    combinedWatchlist(
      restored.getSnapshot().reactions,
      restored.getSnapshot().list,
    )[0].anime.id,
    kimi.id,
  );
  assert.notEqual(restored.getSnapshot().current?.id, kimi.id);
});
