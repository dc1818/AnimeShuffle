import test from "node:test";
import assert from "node:assert/strict";
import { rankRecommendations } from "../src/lib/recommend.js";
import { isUnreleased, releaseLabel } from "../src/lib/release.js";
import { createAnimeStore } from "../src/lib/store.js";
const anime = (id, genres = ["Action"]) => ({
  id,
  title: `Anime ${id}`,
  genres,
  nsfw: "white",
  format: "tv",
  prequels: [],
  status: "finished_airing",
  episodes: 12,
});
test("shortlist numbers 25 unique matches, includes planned titles, excludes seen and rejected", () => {
  const pool = Array.from({ length: 30 }, (_, i) => anime(i + 1));
  const reactions = {
    1: { action: "good", anime: pool[0] },
    2: { action: "nope", anime: pool[1] },
    3: { action: "watch", anime: pool[2] },
  };
  const list = [
    { ...pool[3], listStatus: { status: "completed", score: 0 } },
    { ...pool[4], listStatus: { status: "plan_to_watch", score: 0 } },
  ];
  const picks = rankRecommendations([...pool, pool[5]], { reactions, list });
  assert.deepEqual(
    picks.map((p) => p.tier),
    Array.from({ length: 25 }, (_, i) => i + 1),
  );
  assert.equal(new Set(picks.map((p) => p.anime.id)).size, 25);
  assert.ok(picks.some((p) => p.anime.id === 3));
  assert.ok(picks.some((p) => p.anime.id === 5));
  assert.ok(picks.every((p) => ![1, 2, 4].includes(p.anime.id)));
  assert.deepEqual(
    picks,
    rankRecommendations([...pool, pool[5]], { reactions, list }),
  );
});
test("unrated watching and plans rank matching genres above unrelated anime", () => {
  const list = [
    { ...anime(99, ["Romance"]), listStatus: { status: "watching", score: 0 } },
    {
      ...anime(100, ["Romance"]),
      listStatus: { status: "plan_to_watch", score: 0 },
    },
  ];
  const picks = rankRecommendations([anime(1), anime(2, ["Romance"])], {
    list,
  });
  assert.equal(picks[0].anime.id, 2);
  assert.match(picks[0].reason, /Romance/);
  assert.equal(
    rankRecommendations([anime(1)], { preferences: { formats: ["movies"] } })
      .length,
    0,
  );
});
test("upcoming anime keeps future-watch choices but store rejects seen reactions", async () => {
  const upcoming = { ...anime(10), status: "not_yet_aired" };
  assert.equal(isUnreleased(upcoming), true);
  assert.equal(releaseLabel({}), "Release status unknown");
  const saved = JSON.stringify({ onboardingComplete: true });
  const store = createAnimeStore({
    storage: { getItem: () => saved, setItem: () => {} },
    request: async (url) => {
      if (url === "/api/session")
        return new Response(JSON.stringify({ configured: true }));
      if (url.startsWith("/api/catalog"))
        return new Response(
          JSON.stringify({ data: [upcoming], nextOffset: null }),
        );
      return new Response(JSON.stringify(upcoming));
    },
  });
  await store.initialize();
  assert.equal(store.getSnapshot().current.id, 10);
  await store.react("good");
  await store.react("bad");
  assert.deepEqual(store.getSnapshot().reactions, {});
  await store.react("watch");
  assert.equal(store.getSnapshot().reactions[10].action, "watch");
  await store.loadRecommendations();
  assert.equal(store.getSnapshot().recommendationPool[0].id, 10);
  await store.react("bad", store.getSnapshot().recommendationPool[0]);
  assert.equal(store.getSnapshot().reactions[10].action, "watch");
});
