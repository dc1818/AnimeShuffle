import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { seedRecommendationHistory } from "./recommendation-fixture.mjs";
const waitFor = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  assert.fail("Timed out waiting for test state");
};
function fixture(size = 40) {
  const values = new Map();
  const catalog = Array.from({ length: size }, (_, i) => ({
    id: i + 1,
    title: `Anime ${i + 1}`,
    genres: ["Action"],
    format: "tv",
    nsfw: "white",
    prequels: [],
    status: "finished_airing",
  }));
  let blocked = false;
  const waiting = [];
  const reads = [];
  const store = createAnimeStore({
    browserBackup: null,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: catalog, nextOffset: null });
      if (url.startsWith("/api/taste")) return Response.json({ profiles: {} });
      if (url.startsWith("/api/anime/")) {
        reads.push(url);
        if (blocked) await new Promise((r) => waiting.push(r));
        return Response.json(catalog[Number(url.split("/").pop()) - 1]);
      }
      throw Error(url);
    },
  });
  return {
    store,
    reads,
    waiting,
    block: () => (blocked = true),
    release: () => {
      blocked = false;
      waiting.splice(0).forEach((r) => r());
    },
  };
}

test("Discover accepts choices while recommendations run and the published batch uses the latest reactions", async () => {
  const f = fixture(),
    { store } = f;
  await store.initialize();
  await store.savePreferences({});
  seedRecommendationHistory(store);
  const current = store.getSnapshot().current;
  f.block();
  const loading = store.loadRecommendations();
  await waitFor(() => f.waiting.length > 0);
  assert.equal(store.getSnapshot().recommendationsLoading, true);
  assert.equal(store.getSnapshot().busy, false);
  const reaction = store.react("watch");
  assert.equal(store.getSnapshot().reactions[current.id].action, "watch");
  f.release();
  await Promise.all([loading, reaction]);
  assert.equal(store.getSnapshot().busy, false);
  assert.equal(store.getSnapshot().recommendationPicks.length, 25);
  assert.ok(
    !store
      .getSnapshot()
      .recommendationPicks.some((p) => p.anime.id === current.id),
  );
  assert.equal(store.getSnapshot().reactions[current.id].action, "watch");
});

test("Discover replaces a matching loaded row without moving other rows or setting the recommendation loading state", async () => {
  const { store } = fixture();
  await store.initialize();
  await store.savePreferences({});
  seedRecommendationHistory(store);
  await store.loadRecommendations();
  const current = store.getSnapshot().current;
  const before = store.getSnapshot().recommendationPicks;
  const removed = before.find((p) => p.anime.id === current.id);
  assert.ok(removed);
  const snapshots = [];
  const stop = store.subscribe(() => snapshots.push(store.getSnapshot()));
  await store.react("bad");
  await waitFor(() => store.getSnapshot().recommendationPicks.length === 25);
  const after = store.getSnapshot().recommendationPicks;
  assert.ok(!after.some((p) => p.anime.id === current.id));
  for (const pick of before.filter((p) => p !== removed))
    assert.equal(
      after.find((p) => p.anime.id === pick.anime.id),
      pick,
    );
  assert.ok(snapshots.every((s) => !s.recommendationsLoading));
  assert.equal(new Set(after.map((p) => p.anime.id)).size, 25);
  assert.equal(new Set(after.map((p) => p.tier)).size, 25);
  stop();
});

test("look-ahead warms at most three candidates and the next choice reuses verified details", async () => {
  const { store, reads } = fixture(4);
  await store.initialize();
  await store.savePreferences({});
  const first = store.getSnapshot().current;
  await waitFor(() => reads.length === 4);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.getSnapshot().current, first);
  assert.equal(store.getSnapshot().busy, false);
  const before = reads.length;
  await store.react("good");
  assert.notEqual(store.getSnapshot().current.id, first.id);
  assert.equal(
    reads.length,
    before,
    "Choosing the next warmed card must not fetch its metadata again",
  );
});
