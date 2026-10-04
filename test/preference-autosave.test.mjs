import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";

test("slow account preference writes stay ordered without locking or replacing loaded picks", async () => {
  const values = new Map(),
    writes = [],
    waiting = [];
  const store = createAnimeStore({
    browserBackup: null,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    request: async (url, options) => {
      if (url === "/api/session")
        return new Response(
          JSON.stringify({
            configured: false,
            connected: false,
            account: { id: "account1" },
            onboardingComplete: true,
            preferences: {},
          }),
        );
      if (url === "/api/account/preferences") {
        writes.push(JSON.parse(options.body).preferences);
        await new Promise((resolve) => waiting.push(resolve));
        return new Response("{}");
      }
      throw new Error("Unexpected fetch " + url);
    },
  });
  await store.initialize();
  const current = store.getSnapshot().current;
  const picks = store.getSnapshot().recommendationPicks;
  const states = [];
  const unsubscribe = store.subscribe(() => states.push(store.getSnapshot()));
  const first = store.saveViewingPreferences({ favoriteGenres: ["Action"] });
  const second = store.saveViewingPreferences({
    favoriteGenres: ["Action", "Drama"],
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes.length, 1, "Writes cannot race each other");
  assert.deepEqual(store.getSnapshot().preferences.favoriteGenres, [
    "Action",
    "Drama",
  ]);
  assert.ok(
    states.every(
      (s) =>
        !s.busy && s.current === current && s.recommendationPicks === picks,
    ),
  );
  waiting.shift()();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes.length, 2);
  waiting.shift()();
  await second;
  assert.deepEqual(writes[1].favoriteGenres, ["Action", "Drama"]);
  assert.ok(
    states.every(
      (s) =>
        !s.busy && s.current === current && s.recommendationPicks === picks,
    ),
  );
  unsubscribe();
});

test("closing preferences only replaces a card invalidated by the changed filters", async () => {
  const values = new Map();
  const store = createAnimeStore({
    staticMode: true,
    browserBackup: null,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
  });
  await store.initialize();
  await store.savePreferences({});
  const current = store.getSnapshot().current;
  assert.ok(current);
  await store.saveViewingPreferences({ includeUnknown: true });
  await store.finishViewingPreferences();
  assert.equal(
    store.getSnapshot().current,
    current,
    "Unchanged filters retain the card",
  );
  await store.saveViewingPreferences({ favoriteGenres: [current.genres[0]] });
  await store.finishViewingPreferences();
  assert.equal(store.getSnapshot().current, current, "A matching card stays");
  const formats = current.format === "movie" ? ["series"] : ["movies"];
  await store.saveViewingPreferences({ formats });
  assert.equal(
    store.getSnapshot().current,
    current,
    "No replacement while editing",
  );
  await store.finishViewingPreferences();
  assert.notEqual(store.getSnapshot().current?.id, current.id);
});
