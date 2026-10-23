import test from "node:test";
import assert from "node:assert/strict";
import { normalizePreferences } from "../src/lib/preferences.js";
import { buildTaste, scoreAnime } from "../src/lib/recommend.js";

test("watchlist worker preserves ranking scores and explains only positive model features", async () => {
  let result;
  globalThis.self = {
    postMessage: (data) => {
      result = data;
    },
  };
  try {
    await import("../src/lib/watchlist-worker.js");
    const anime = (id, genres) => ({
      id,
      title: "Anime " + id,
      genres,
      format: "tv",
      episodes: 12,
      status: "finished_airing",
      listStatus: { status: "plan_to_watch" },
    });
    const reactions = { 99: { action: "good", anime: anime(99, ["Action"]) } };
    const list = [anime(1, ["Action"]), anime(2, ["Romance"])];
    const preferences = normalizePreferences();
    self.onmessage({ data: { reactions, list, preferences } });
    const taste = buildTaste(reactions, list, preferences);
    assert.equal(Object.keys(result.scores).length, 2);
    for (const a of list) {
      assert.equal(result.scores[a.id], scoreAnime(a, taste));
      if (result.reasons[a.id]) {
        const positive = taste.model
          .explain(a)
          .contributions.filter(
            (c) => c.key.startsWith("genre:") && c.contribution > 0.00001,
          );
        assert.ok(
          positive.some((c) => result.reasons[a.id].includes(c.key.slice(6))),
        );
      }
    }
    assert.match(result.reasons[1], /Action/);
    self.onmessage({ data: { reactions: {}, list: [], preferences } });
    assert.deepEqual(result, { scores: {}, reasons: {} });
  } finally {
    delete globalThis.self;
  }
});
