import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { combinedWatchlist } from "../src/lib/watchlist.js";

test("Refresh MAL retries an unsent site save and retains MAL plans despite older reactions", async () => {
  const anime = (id) => ({
    id,
    title: `Anime ${id}`,
    format: "tv",
    genres: ["Action"],
    nsfw: "white",
    prequels: [],
  });
  const values = new Map([
    [
      "anime-shuffle:42",
      JSON.stringify({
        onboardingComplete: true,
        settings: { autoAdd: true },
        reactions: {
          1: { action: "nope", anime: anime(1), at: 1 },
          2: { action: "watch", anime: anime(2), at: 2 },
        },
      }),
    ],
  ]);
  let writes = 0;
  const plans = [{ ...anime(1), listStatus: { status: "plan_to_watch" } }];
  const store = createAnimeStore({
    storage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    },
    browserBackup: null,
    request: async (url, options) => {
      if (url === "/api/session")
        return Response.json({
          configured: true,
          connected: true,
          account: { provider: "mal", id: "mal:42" },
          onboardingComplete: true,
        });
      if (url.startsWith("/api/list"))
        return Response.json({ data: plans, nextOffset: null });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [anime(3)], nextOffset: null });
      if (url === "/api/anime/3") return Response.json(anime(3));
      if (url === "/api/plan") {
        writes++;
        if (writes === 1)
          return Response.json({ error: "Temporary failure" }, { status: 503 });
        const { id } = JSON.parse(options.body);
        plans.push({ ...anime(id), listStatus: { status: "plan_to_watch" } });
        return Response.json({ added: true, status: "plan_to_watch" });
      }
      return Response.json({ profiles: {} });
    },
  });
  await store.initialize();
  for (let i = 0; !store.getSnapshot().malSyncError && i < 100; i++)
    await new Promise((r) => setTimeout(r, 2));
  assert.match(store.getSnapshot().malSyncError, /sync stopped/);
  await store.refreshList();
  assert.equal(writes, 2);
  assert.equal(store.getSnapshot().malSyncError, "");
  assert.deepEqual(
    combinedWatchlist(store.getSnapshot().reactions, store.getSnapshot().list)
      .map((e) => e.anime.id)
      .sort(),
    [1, 2],
  );
  assert.deepEqual(plans.map((a) => a.id).sort(), [1, 2]);
});
