import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import {
  readCatalogCache,
  writeCatalogCache,
} from "../src/lib/catalog-cache.js";
const anime = {
  id: 1,
  title: "Verified title",
  genres: ["Action"],
  format: "tv",
  nsfw: "white",
  prequels: [],
};
const memory = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
};
test("returning Discover uses the persisted metadata cache without catalog/detail requests or a loading flash", async () => {
  const storage = memory();
  const first = createAnimeStore({
    storage,
    browserBackup: null,
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") return Response.json(anime);
      return Response.json({ profiles: {} });
    },
  });
  await first.initialize();
  await first.savePreferences({});
  const seen = [];
  const calls = [];
  const second = createAnimeStore({
    storage,
    browserBackup: null,
    request: async (url) => {
      calls.push(url);
      assert.equal(url, "/api/session");
      return Response.json({ configured: true });
    },
  });
  second.subscribe(() => seen.push(second.getSnapshot()));
  await second.initialize();
  assert.equal(second.getSnapshot().current.id, 1);
  assert.deepEqual(calls, ["/api/session"]);
  assert.ok(seen.every((s) => !s.discoveryLoading));
});
test("metadata cache expires and strips account-derived fields", () => {
  const storage = memory();
  const now = Date.now();
  writeCatalogCache(storage, [
    {
      anime: {
        ...anime,
        listStatus: { status: "watching" },
        communityTaste: [{ id: 2 }],
      },
      expires: now + 1000,
    },
  ]);
  const entry = readCatalogCache(storage, now)[0];
  assert.equal(entry.anime.listStatus, undefined);
  assert.equal(entry.anime.communityTaste, undefined);
  assert.deepEqual(readCatalogCache(storage, now + 1001), []);
});
test("uncertain network work reports its stage instead of a fabricated 50 percent", async () => {
  let release,
    started = false;
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") {
        started = true;
        await new Promise((r) => (release = r));
        return Response.json(anime);
      }
      return Response.json({ profiles: {} });
    },
  });
  await store.initialize();
  const loading = store.savePreferences({});
  for (let i = 0; !started && i < 100; i++)
    await new Promise((r) => setTimeout(r, 2));
  assert.ok(started);
  assert.equal(store.getSnapshot().discoveryProgress, null);
  assert.match(store.getSnapshot().discoveryStage, /Checking this anime/);
  assert.match(store.getSnapshot().discoveryWork, /1 page searched/);
  release();
  await loading;
  assert.equal(store.getSnapshot().current.id, 1);
});
