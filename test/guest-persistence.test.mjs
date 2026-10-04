import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { combinedWatchlist } from "../src/lib/watchlist.js";

function fixture() {
  const local = new Map(),
    durable = new Map();
  let failAll = false;
  const storage = {
    getItem: (key) => local.get(key),
    setItem(key, value) {
      if (
        failAll ||
        Object.keys(JSON.parse(value).reactions || {}).length > 101
      )
        throw new Error("QuotaExceededError");
      local.set(key, value);
    },
  };
  const browserBackup = {
    read: async (key) => structuredClone(durable.get(key)),
    write: async (key, value) => {
      if (failAll) throw Error("Storage unavailable");
      durable.set(key, structuredClone(value));
    },
  };
  const anime = (id) => ({
    id,
    title: `Anime ${id}`,
    genres: ["Action"],
    format: "tv",
    episodes: 12,
    status: "finished_airing",
    nsfw: "white",
    prequels: [],
    recommendations: [],
  });
  const request = async (url) => {
    if (url === "/api/session") return Response.json({ configured: true });
    if (url.startsWith("/api/catalog"))
      return Response.json({
        data: Array.from({ length: 160 }, (_, i) => anime(i + 1)),
        nextOffset: null,
      });
    if (url.startsWith("/api/taste")) return Response.json({ profiles: {} });
    if (url.startsWith("/api/anime/"))
      return Response.json(anime(Number(url.split("/").pop())));
    throw Error(url);
  };
  return {
    options: { storage, browserBackup, request },
    local,
    durable,
    setFailed: (value) => {
      failAll = value;
    },
  };
}
test("guest reactions pass 101 and restore from IndexedDB when localStorage remains at 101", async () => {
  const { options, local } = fixture();
  let store = createAnimeStore(options);
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  const chosen = new Set();
  for (let n = 0; n < 125; n++) {
    const id = store.getSnapshot().current.id;
    assert.equal(chosen.has(id), false);
    chosen.add(id);
    await store.react(["good", "bad", "watch", "nope"][n % 4]);
    assert.equal(Object.keys(store.getSnapshot().reactions).length, n + 1);
  }
  assert.equal(
    Object.keys(JSON.parse(local.get("anime-shuffle:guest")).reactions).length,
    101,
  );
  const before = store.getSnapshot().reactions;
  store = createAnimeStore(options);
  await store.initialize();
  assert.deepEqual(store.getSnapshot().reactions, before);
  assert.equal(combinedWatchlist(store.getSnapshot().reactions).length, 31);
  assert.equal(chosen.has(store.getSnapshot().current.id), false);
  assert.equal(store.getSnapshot().storageError, "");
  await store.react("watch");
  assert.equal(Object.keys(store.getSnapshot().reactions).length, 126);
});
test("failed device saves stay visible after success toasts and can be retried", async () => {
  const f = fixture();
  const store = createAnimeStore(f.options);
  await store.initialize();
  await store.savePreferences({});
  f.setFailed(true);
  const id = store.getSnapshot().current.id;
  await store.react("watch");
  assert.match(store.getSnapshot().storageError, /could not be saved/);
  assert.equal(store.getSnapshot().reactions[id].action, "watch");
  f.setFailed(false);
  await store.retryBrowserSave();
  assert.equal(store.getSnapshot().storageError, "");
  const reloaded = createAnimeStore(f.options);
  await reloaded.initialize();
  assert.equal(reloaded.getSnapshot().reactions[id].action, "watch");
});
test("old guest localStorage data loads when no IndexedDB backup exists", async () => {
  const f = fixture();
  f.local.set(
    "anime-shuffle:guest",
    JSON.stringify({
      onboardingComplete: true,
      reactions: {
        1: { action: "watch", anime: { id: 1, title: "Saved anime" }, at: 10 },
      },
    }),
  );
  const store = createAnimeStore(f.options);
  await store.initialize();
  assert.equal(store.getSnapshot().reactions[1].action, "watch");
  await store.retryBrowserSave();
  assert.equal(
    f.durable.get("anime-shuffle:guest").reactions[1].action,
    "watch",
  );
});
