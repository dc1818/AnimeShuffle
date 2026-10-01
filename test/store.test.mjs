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
  await store.removeSaved(1);
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
  assert.ok(
    snapshots.some((s) => s.discoveryLoading && s.discoveryProgress === 50),
  );
  assert.equal(store.getSnapshot().discoveryLoading, false);
  snapshots.length = 0;
  await store.loadRecommendations();
  const loading = snapshots.filter((s) => s.recommendationsLoading);
  assert.ok(loading.length > 0);
  // No partial leaderboard may escape before all verification work settles.
  const partial = loading.filter((s) => !s.recommendationsReady);
  assert.ok(partial.every((s) => s.recommendationPicks.length === 0));
  assert.ok(loading.some((s) => Number.isFinite(s.recommendationProgress)));
  assert.equal(store.getSnapshot().recommendationsLoading, false);
  assert.equal(store.getSnapshot().recommendationsReady, true);
});

test("recommendations reuse discovery details and avoid unnecessary catalog pages on repeat", async () => {
  const catalog = Array.from({ length: 80 }, (_, i) => ({
    ...anime,
    id: i + 1,
  }));
  const counts = { catalog: 0, details: 0 };
  const store = createAnimeStore({
    storage: memory(),
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog")) {
        counts.catalog++;
        return Response.json({ data: catalog, nextOffset: null });
      }
      if (url.startsWith("/api/anime/")) {
        counts.details++;
        return Response.json(catalog[Number(url.split("/").pop()) - 1]);
      }
      throw Error(url);
    },
  });
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  const discoveryId = store.getSnapshot().current.id;
  await store.loadRecommendations();
  const first = { ...counts };
  assert.equal(store.getSnapshot().recommendationPicks.length, 25);
  assert.ok(first.details <= 26);
  assert.equal(first.catalog, 1);
  await store.loadRecommendations();
  assert.deepEqual(
    counts,
    first,
    "warm refresh needs no additional API requests",
  );
  assert.ok(discoveryId);
});

test("duplicate autocomplete reads share one pending request and failed reads can be retried", async () => {
  let calls = 0,
    release;
  const store = createAnimeStore({
    storage: memory(),
    request: async (url, options) => {
      if (url === "/api/session") return Response.json({ configured: true });
      assert.ok(options.signal, "GET has a timeout signal");
      calls++;
      await new Promise((resolve) => {
        release = resolve;
      });
      return Response.json(
        { data: [anime] },
        { status: calls === 1 ? 503 : 200 },
      );
    },
  });
  await store.initialize();
  const first = store.searchAnime("test");
  const second = store.searchAnime("test");
  const settled = Promise.allSettled([first, second]);
  assert.equal(calls, 1);
  release();
  assert.ok((await settled).every((r) => r.status === "rejected"));
  const retry = store.searchAnime("test");
  release();
  assert.deepEqual(await retry, [anime]);
  assert.equal(calls, 2);
});

test("recommendations retrieve off-chart MAL neighbors while enforcing known-show and prequel exclusions", async () => {
  const seed = {
    ...anime,
    id: 90,
    synopsis: "Detectives investigate murder clues and criminal suspects.",
    listStatus: { status: "completed", score: 9 },
  };
  const neighbor = { ...anime, id: 900, synopsis: seed.synopsis };
  const sequel = { ...anime, id: 901, prequels: [777] };
  const seen = {
    ...anime,
    id: 902,
    listStatus: { status: "completed", score: 8 },
  };
  const requested = [];
  const store = createAnimeStore({
    storage: memory(),
    request: async (url) => {
      requested.push(url);
      if (url === "/api/session")
        return Response.json({ configured: true, connected: true });
      if (url === "/api/profile") return Response.json({ id: 7 });
      if (url.startsWith("/api/list"))
        return Response.json({ data: [seed, seen], nextOffset: null });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [anime], nextOffset: null });
      const id = Number(url.split("/").pop());
      if (id === 90)
        return Response.json({ ...seed, recommendations: [900, 901, 902] });
      return Response.json(
        { 1: anime, 900: neighbor, 901: sequel, 902: seen }[id],
      );
    },
  });
  await store.initialize();
  await store.savePreferences({});
  await store.loadRecommendations();
  const ids = store.getSnapshot().recommendationPicks.map((p) => p.anime.id);
  assert.ok(ids.includes(900), "finds a title never present on catalog pages");
  assert.ok(!ids.includes(901), "unseen prequel remains excluded");
  assert.ok(!ids.includes(902), "known anime never becomes a candidate");
  assert.equal(
    requested.filter((url) => url === "/api/anime/900").length,
    1,
    "retrieved neighbor details are reused during ranking",
  );
});

test("MAL freshness imports external plans, throttles reads, and keeps unchanged picks", async () => {
  let clock = 100000,
    reads = 0,
    entries = [],
    fail = false;
  const store = createAnimeStore({
    storage: memory(),
    now: () => clock,
    request: async (url) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session")
        return ok({ configured: true, connected: true });
      if (url === "/api/profile") return ok({ id: 7 });
      if (url.startsWith("/api/list")) {
        reads++;
        if (fail)
          return new Response(JSON.stringify({ error: "Unavailable" }), {
            status: 503,
          });
        return ok({ data: entries, nextOffset: null });
      }
      if (url.startsWith("/api/catalog"))
        return ok({ data: [anime, { ...anime, id: 2 }], nextOffset: null });
      if (url.startsWith("/api/anime/"))
        return ok({ ...anime, id: Number(url.split("/").pop()) });
      throw Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  await store.loadRecommendations();
  const picks = store.getSnapshot().recommendationPicks;
  assert.ok(picks.length > 0);
  clock += 60001;
  await Promise.all([store.refreshMalIfStale(), store.refreshMalIfStale()]);
  assert.equal(reads, 2);
  assert.equal(
    store.getSnapshot().recommendationPicks,
    picks,
    "Unchanged MAL list preserves picks",
  );
  entries = [{ ...anime, listStatus: { status: "plan_to_watch", score: 0 } }];
  clock += 60001;
  await store.refreshMalIfStale();
  assert.equal(store.getSnapshot().list[0].id, 1);
  assert.notEqual(store.getSnapshot().current?.id, 1);
  assert.equal(store.getSnapshot().recommendationsReady, false);
  await store.loadRecommendations();
  assert.ok(
    store.getSnapshot().recommendationPicks.every((a) => a.anime.id !== 1),
  );
  fail = true;
  clock += 60001;
  await store.refreshMalIfStale();
  const attempts = reads;
  await store.refreshMalIfStale();
  assert.equal(reads, attempts, "Failures are throttled");
  assert.equal(
    store.getSnapshot().list[0].id,
    1,
    "Failed reads preserve the previous list",
  );
  assert.match(store.getSnapshot().message, /last synced list/);
});

test("saving viewing filters immediately replaces discovery and invalidates recommendations", async () => {
  const catalog = [
    { ...anime, id: 10, episodes: 12, status: "finished_airing" },
    { ...anime, id: 11, episodes: 80, status: "finished_airing" },
    { ...anime, id: 12, episodes: 12, status: "currently_airing" },
    { ...anime, id: 13, episodes: 0, status: "finished_airing" },
    {
      ...anime,
      id: 14,
      format: "movie",
      episodes: 1,
      status: "finished_airing",
    },
  ];
  const store = createAnimeStore({
    storage: memory(),
    request: async (url) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session") return ok({ configured: true });
      if (url.startsWith("/api/catalog"))
        return ok({ data: catalog, nextOffset: null });
      if (url.startsWith("/api/anime/"))
        return ok(catalog.find((a) => a.id === Number(url.split("/").pop())));
      throw Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  await store.loadRecommendations();
  assert.ok(store.getSnapshot().recommendationPicks.length > 1);
  const filters = {
    favoriteGenres: ["Action"],
    formats: ["series"],
    lengths: ["short"],
    finishedOnly: true,
    includeUnknown: false,
  };
  await store.savePreferences(filters);
  assert.equal(store.getSnapshot().current.id, 10);
  assert.equal(store.getSnapshot().recommendationsReady, false);
  assert.equal(store.getSnapshot().recommendationPicks.length, 0);
  await store.loadRecommendations();
  assert.deepEqual(
    store.getSnapshot().recommendationPicks.map((p) => p.anime.id),
    [10],
  );
  await store.savePreferences({ ...filters, formats: ["movies"] });
  assert.equal(store.getSnapshot().current.id, 14);
  await store.loadRecommendations();
  assert.deepEqual(
    store.getSnapshot().recommendationPicks.map((p) => p.anime.id),
    [14],
  );
});

test("removing connected watchlist entries waits for confirmation and preserves saves on MAL failure", async () => {
  let fail = false;
  const planned = { ...anime, listStatus: { status: "plan_to_watch" } };
  const store = createAnimeStore({
    storage: memory(),
    request: async (url, options) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session")
        return ok({ configured: true, connected: true });
      if (url === "/api/profile") return ok({ id: 7 });
      if (url.startsWith("/api/list"))
        return ok({ data: [planned], nextOffset: null });
      if (url.startsWith("/api/catalog"))
        return ok({ data: [], nextOffset: null });
      if (url === "/api/plan/remove") {
        if (fail)
          return new Response(JSON.stringify({ error: "MAL unavailable" }), {
            status: 503,
          });
        return ok(
          JSON.parse(options.body).confirmed
            ? { removed: true }
            : { confirmationRequired: true },
        );
      }
      throw Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  assert.equal((await store.removeSaved(1)).confirmationRequired, true);
  assert.equal(store.getSnapshot().list.length, 1);
  fail = true;
  assert.equal((await store.removeSaved(1, true)).removed, false);
  assert.equal(store.getSnapshot().list.length, 1);
  fail = false;
  assert.equal((await store.removeSaved(1, true)).removed, true);
  assert.equal(store.getSnapshot().list.length, 0);
});

test("unchanged account polling preserves recommendations while real preference changes invalidate once", async () => {
  let remote = {
    revision: 1,
    reactions: {},
    settings: { autoAdd: false, dynamic: true },
    preferences: { favoriteGenres: ["Action"] },
    onboardingComplete: true,
  };
  const store = createAnimeStore({
    storage: memory(),
    request: async (url) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session")
        return ok({
          configured: true,
          cloudSync: true,
          account: { id: "local-user", provider: "local" },
          preferences: remote.preferences,
          onboardingComplete: true,
        });
      if (url === "/api/account/state") return ok(remote);
      if (url.startsWith("/api/catalog"))
        return ok({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") return ok(anime);
      throw Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  await store.loadRecommendations();
  const picks = store.getSnapshot().recommendationPicks;
  assert.ok(picks.length);
  for (let i = 0; i < 4; i++) await store.syncAccount();
  assert.equal(store.getSnapshot().recommendationPicks, picks);
  assert.equal(store.getSnapshot().recommendationsReady, true);
  remote = {
    ...remote,
    revision: 2,
    settings: { dynamic: false, autoAdd: false },
  };
  await store.syncAccount();
  assert.equal(
    store.getSnapshot().recommendationPicks,
    picks,
    "Theme settings do not reset picks",
  );
  remote = {
    ...remote,
    revision: 3,
    preferences: { favoriteGenres: ["Drama"] },
  };
  await store.syncAccount();
  assert.equal(store.getSnapshot().recommendationsReady, false);
  await store.loadRecommendations();
  const refreshed = store.getSnapshot().recommendationPicks;
  await store.syncAccount();
  assert.equal(store.getSnapshot().recommendationsReady, true);
  assert.equal(store.getSnapshot().recommendationPicks, refreshed);
});

test("a slow MAL refresh waits a full interval after finishing before another attempt", async () => {
  let clock = 100000,
    reads = 0,
    slow = false;
  const store = createAnimeStore({
    storage: memory(),
    now: () => clock,
    request: async (url) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session")
        return ok({ configured: true, connected: true });
      if (url === "/api/profile") return ok({ id: 7 });
      if (url.startsWith("/api/list")) {
        reads++;
        if (slow) clock += 90000;
        return ok({ data: [], nextOffset: null });
      }
      if (url.startsWith("/api/catalog"))
        return ok({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") return ok(anime);
      throw Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  slow = true;
  clock += 60001;
  await store.refreshMalIfStale();
  const completedReads = reads;
  await store.refreshMalIfStale();
  assert.equal(
    reads,
    completedReads,
    "Slow completion must not trigger immediate re-polling",
  );
  clock += 60001;
  await store.refreshMalIfStale();
  assert.equal(reads, completedReads + 1);
});
