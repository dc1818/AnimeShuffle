import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
const anime = {
  id: 1,
  title: "Candidate",
  genres: ["Action"],
  format: "tv",
  nsfw: "white",
  prequels: [],
};
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
}
test("React store keeps auto-add opt-in and preserves MAL entry when Undo is refused", async () => {
  let writes = 0,
    starts = 0;
  const store = createAnimeStore({
    storage: memory(),
    request: async (url, options) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session") {
        starts++;
        return ok({ configured: true, connected: true, csrf: "csrf" });
      }
      if (url === "/api/profile") return ok({ id: 7, name: "Viewer" });
      if (url.startsWith("/api/list"))
        return ok({ data: [], nextOffset: null });
      if (url.startsWith("/api/catalog"))
        return ok({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") return ok(anime);
      if (url === "/api/plan") {
        writes++;
        assert.equal(options.headers["X-CSRF-Token"], "csrf");
        return ok({ added: true, receipt: "receipt" });
      }
      if (url === "/api/plan/undo")
        return new Response(
          JSON.stringify({ error: "Entry changed on MAL." }),
          { status: 409 },
        );
      throw Error("Unexpected request " + url);
    },
  });
  await Promise.all([store.initialize(), store.initialize()]);
  await store.savePreferences({});
  assert.equal(starts, 1, "StrictMode must not duplicate initialization");
  await store.react("watch");
  assert.equal(writes, 0, "Auto-add defaults off");
  await store.undo();
  store.setSettings({ autoAdd: true });
  await store.react("watch");
  assert.equal(writes, 1);
  await store.undo();
  assert.equal(store.getSnapshot().reactions[1], undefined);
  assert.equal(
    store.getSnapshot().list.length,
    1,
    "Refused MAL undo must preserve local knowledge of its entry",
  );
  assert.match(store.getSnapshot().message, /Entry changed/);
});
test("clearing reactions and removing saved entries cannot leave stale Undo history", async () => {
  const store = createAnimeStore({
    storage: memory(),
    request: async () =>
      new Response(JSON.stringify({ configured: false, connected: false })),
  });
  await store.initialize();
  await store.savePreferences({});
  await store.react("watch");
  store.removeSaved(1);
  assert.equal(store.getSnapshot().canUndo, false);
  await store.react("good");
  await store.clearLocal();
  assert.equal(store.getSnapshot().canUndo, false);
  assert.deepEqual(store.getSnapshot().reactions, {});
});

test("local sign-in restores account preferences without copying guest reactions", async () => {
  const storage = memory();
  const account = { id: "local:fixture", name: "Viewer", provider: "local" };
  storage.setItem(
    "anime-shuffle:guest",
    JSON.stringify({
      reactions: { 1: { action: "bad", anime } },
      onboardingComplete: true,
    }),
  );
  const store = createAnimeStore({
    storage,
    request: async (url, options) => {
      const reply = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session")
        return reply({ configured: false, connected: false, csrf: "guest" });
      if (url === "/api/account/login") {
        assert.equal(options.headers["X-CSRF-Token"], "guest");
        return reply({
          account,
          csrf: "signed-in",
          configured: false,
          connected: false,
          onboardingComplete: true,
          preferences: { formats: ["movies"] },
        });
      }
      if (url === "/api/account/preferences") {
        assert.equal(options.headers["X-CSRF-Token"], "signed-in");
        return reply({ onboardingComplete: true });
      }
      throw Error("Unexpected URL " + url);
    },
  });
  await store.initialize();
  assert.equal(
    await store.authenticate("login", "Viewer", "example-password"),
    true,
  );
  assert.equal(store.getSnapshot().session.account.id, account.id);
  assert.deepEqual(store.getSnapshot().reactions, {});
  assert.equal(store.getSnapshot().current.format, "movie");
  await store.savePreferences({ formats: ["series"], lengths: ["standard"] });
  assert.deepEqual(
    JSON.parse(storage.getItem("anime-shuffle:local:fixture")).preferences
      .lengths,
    ["standard"],
  );
  assert.equal(
    JSON.parse(storage.getItem("anime-shuffle:guest")).reactions[1].action,
    "bad",
  );
});

test("import saves once, preserves reactions, excludes Discover and survives reload without MAL writes", async () => {
  const { watchlistBackup } = await import("../src/lib/watchlist.js");
  const storage = memory();
  const store = createAnimeStore({ storage, staticMode: true });
  await store.initialize();
  await store.savePreferences({});
  const candidate = store.getSnapshot().current;
  const text = watchlistBackup([{ anime: candidate, addedAt: 123 }]);
  store.setSettings({ autoAdd: true });
  assert.equal(await store.importWatchlist(text), 1);
  assert.equal(store.getSnapshot().reactions[candidate.id].action, "watch");
  assert.notEqual(store.getSnapshot().current?.id, candidate.id);
  assert.equal(await store.importWatchlist(text), 0);
  const restored = createAnimeStore({ storage, staticMode: true });
  await restored.initialize();
  assert.equal(restored.getSnapshot().reactions[candidate.id].at, 123);
  const before = restored.getSnapshot().reactions;
  await assert.rejects(restored.importWatchlist("bad JSON"));
  assert.deepEqual(restored.getSnapshot().reactions, before);
});
