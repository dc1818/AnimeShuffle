import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import {
  recommendationsUnlocked,
  reactionCount,
} from "../src/lib/recommendation-access.js";
const reactions = (n) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      90000 + i,
      {
        action: ["good", "bad", "watch", "nope"][i % 4],
        at: i + 1,
        anime: { id: 90000 + i, title: `Seen ${i}`, genres: ["Action"] },
      },
    ]),
  );

test("50 distinct valid reactions are required; MAL lists and invalid actions do not bypass the gate", () => {
  assert.equal(recommendationsUnlocked(reactions(49)), false);
  assert.equal(recommendationsUnlocked(reactions(50)), true);
  assert.equal(reactionCount({ ...reactions(49), 1: { action: "skip" } }), 49);
});

test("locked force refresh does no work and milestone flags persist after visiting", async () => {
  const values = new Map([
    [
      "anime-shuffle:guest",
      JSON.stringify({ reactions: reactions(49), onboardingComplete: true }),
    ],
  ]);
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const store = createAnimeStore({
    staticMode: true,
    storage,
    browserBackup: null,
  });
  await store.initialize();
  await store.loadRecommendations({ force: true });
  assert.equal(store.getSnapshot().recommendationsReady, false);
  assert.equal(store.getSnapshot().recommendationsLoading, false);
  store.visitRecommendations();
  assert.ok(!store.getSnapshot().settings.recommendationsVisited);
  await store.react("good");
  assert.equal(recommendationsUnlocked(store.getSnapshot().reactions), true);
  store.announceRecommendationsUnlock();
  assert.equal(store.getSnapshot().settings.recommendationsNotified, true);
  assert.ok(!store.getSnapshot().settings.recommendationsVisited);
  store.visitRecommendations();
  await store.retryBrowserSave();
  const restored = createAnimeStore({
    staticMode: true,
    storage,
    browserBackup: null,
  });
  await restored.initialize();
  assert.equal(restored.getSnapshot().settings.recommendationsVisited, true);
  assert.equal(restored.getSnapshot().settings.recommendationsNotified, true);
});
