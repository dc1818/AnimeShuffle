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

for (const setup of ["settings", "onboarding"])
  test(`MAL ${setup} opt-in syncs missing site saves, loads all statuses, and retains failures for retry`, async () => {
    const account = { id: "local:sync", name: "Viewer", provider: "local" };
    const storage = memory();
    const item = (id) => ({ ...anime, id, title: `Anime ${id}` });
    const reactions = Object.fromEntries(
      [1, 2, 3, 4, 5].map((id) => [
        id,
        { anime: item(id), action: "watch", at: 123 },
      ]),
    );
    storage.setItem("anime-shuffle:local:sync", JSON.stringify({ reactions }));
    let list = [
      { ...item(1), listStatus: { status: "plan_to_watch", score: 0 } },
      { ...item(2), listStatus: { status: "completed", score: 0 } },
      { ...item(3), listStatus: { status: "dropped", score: 0 } },
    ];
    let failed = true;
    const writes = [],
      offsets = [];
    const store = createAnimeStore({
      storage,
      request: async (url, options) => {
        if (url === "/api/session")
          return Response.json({
            account,
            configured: true,
            connected: true,
            csrf: "fixture",
            preferences: {},
            onboardingComplete: false,
          });
        if (url === "/api/profile")
          return Response.json({ id: 7, name: "Viewer" });
        if (url.startsWith("/api/list")) {
          const offset = Number(
            new URL(url, "https://test").searchParams.get("offset"),
          );
          offsets.push(offset);
          return Response.json(
            offset === 0
              ? { data: list.slice(0, 1), nextOffset: 100 }
              : { data: list.slice(1), nextOffset: null },
          );
        }
        if (url === "/api/account/preferences") return Response.json({});
        if (url.startsWith("/api/catalog"))
          return Response.json({ data: [], nextOffset: null });
        if (url === "/api/plan") {
          const { id } = JSON.parse(options.body);
          writes.push(id);
          if (id === 5 && failed)
            return Response.json({ error: "Try later" }, { status: 503 });
          list.push({
            ...item(id),
            listStatus: { status: "plan_to_watch", score: 0 },
          });
          return Response.json({ added: true, status: "plan_to_watch" });
        }
        throw Error("Unexpected " + url);
      },
    });
    await store.initialize();
    assert.deepEqual(writes, []);
    assert.deepEqual(
      store.getSnapshot().list.map((a) => a.listStatus.status),
      ["plan_to_watch", "completed", "dropped"],
    );
    if (setup === "settings") await store.setAutoAdd(true);
    else await store.savePreferences({}, { autoAdd: true });
    assert.deepEqual(writes, [4, 5]);
    assert.equal(store.getSnapshot().settings.autoAdd, true);
    assert.equal(
      JSON.parse(storage.getItem("anime-shuffle:local:sync")).settings.autoAdd,
      true,
    );
    assert.match(store.getSnapshot().malSyncError, /Try later/);
    failed = false;
    await store.syncSavedToMal();
    assert.deepEqual(
      writes,
      [4, 5, 5],
      "retry must not repeat successful additions or change existing MAL entries",
    );
    assert.equal(store.getSnapshot().malSyncError, "");
    assert.ok(offsets.includes(100));
    await store.setAutoAdd(false);
    assert.equal(store.getSnapshot().settings.autoAdd, false);
    assert.equal(writes.length, 3, "disabling auto-add does not alter MAL");
    const { watchlistBackup } = await import("../src/lib/watchlist.js");
    await store.importWatchlist(
      watchlistBackup([{ anime: item(8), addedAt: 123 }]),
    );
    assert.equal(
      writes.length,
      3,
      "connected imports stay local while auto-add is off",
    );
    await store.setAutoAdd(true);
    assert.equal(
      writes.at(-1),
      8,
      "enabling auto-add includes previously imported site saves",
    );
    await store.importWatchlist(
      watchlistBackup([{ anime: item(9), addedAt: 123 }]),
    );
    assert.equal(
      writes.at(-1),
      9,
      "new imports follow explicit auto-add consent",
    );
  });

test("loading reports completed work and publishes recommendations as a complete batch", async () => {
  const snapshots = [];
  const store = createAnimeStore({ storage: memory(), staticMode: true });
  store.subscribe(() => snapshots.push(store.getSnapshot()));
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  assert.ok(snapshots.some(s => s.discoveryLoading && s.discoveryProgress === 50));
  assert.equal(store.getSnapshot().discoveryLoading, false);
  snapshots.length = 0;
  await store.loadRecommendations();
  const loading = snapshots.filter(s => s.recommendationsLoading);
  assert.ok(loading.length > 0);
  // No partial leaderboard may escape before all verification work settles.
  const partial = loading.filter(s => !s.recommendationsReady);
  assert.ok(partial.every(s => s.recommendationPicks.length === 0));
  assert.ok(loading.some(s => Number.isFinite(s.recommendationProgress)));
  assert.equal(store.getSnapshot().recommendationsLoading, false);
  assert.equal(store.getSnapshot().recommendationsReady, true);
});
