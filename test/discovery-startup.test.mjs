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
test("candidate checking reports a running count without resetting batch percentages", async () => {
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
  assert.match(store.getSnapshot().discoveryStage, /Checking matches/);
  assert.match(store.getSnapshot().discoveryWork, /0 candidates checked/);
  release();
  await loading;
  assert.equal(store.getSnapshot().current.id, 1);
});

test("cold startup overlaps catalog, session and account/list reads without showing an excluded title", async () => {
  const calls = [];
  let releaseSession, releaseList;
  const sessionGate = new Promise((resolve) => {
    releaseSession = resolve;
  });
  const listGate = new Promise((resolve) => {
    releaseList = resolve;
  });
  const candidate = { ...anime, id: 2, title: "Unseen title" };
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    request: async (url) => {
      calls.push(url);
      if (url === "/api/session") {
        await sessionGate;
        return Response.json({
          configured: true,
          connected: true,
          cloudSync: true,
          account: { id: "mal:42", provider: "mal", name: "Viewer" },
          onboardingComplete: true,
        });
      }
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [anime, candidate], nextOffset: null });
      if (url.startsWith("/api/list")) {
        await listGate;
        return Response.json({
          data: [{ ...anime, listStatus: { status: "plan_to_watch" } }],
          nextOffset: null,
        });
      }
      if (url === "/api/account/state")
        return Response.json({
          revision: 1,
          reactions: {},
          settings: {},
          preferences: {},
          onboardingComplete: true,
        });
      if (url === "/api/anime/2") return Response.json(candidate);
      return Response.json({ profiles: {} });
    },
  });
  const loading = store.initialize();
  assert.ok(calls.some((url) => url.startsWith("/api/catalog")));
  assert.equal(store.getSnapshot().current, null);
  releaseSession();
  for (let i = 0; !calls.includes("/api/account/state") && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(
    calls.includes("/api/account/state"),
    "account sync starts while MAL list is pending",
  );
  assert.equal(store.getSnapshot().current, null, "must wait for exclusions");
  releaseList();
  await loading;
  assert.equal(store.getSnapshot().current.id, 2);
  assert.equal(calls.filter((url) => url.startsWith("/api/catalog")).length, 1);
});

test("a long prerequisite search trains once per six candidates and never repeats a checked title", async () => {
  const calls = [],
    counts = [],
    records = [];
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    diagnostics: {
      start: () => () => {},
      record: (row) => records.push(row),
      request: async (fetcher, url, options) => {
        const response = await fetcher(url, options);
        return { response, result: await response.json() };
      },
    },
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({
          data: Array.from({ length: 12 }, (_, i) => ({ ...anime, id: i + 1 })),
          nextOffset: null,
        });
      if (url.startsWith("/api/anime/")) {
        const id = Number(url.split("/").pop());
        calls.push(id);
        return Response.json({
          ...anime,
          id,
          prequels: calls.length < 9 ? [999] : [],
        });
      }
      return Response.json({ profiles: {} });
    },
  });
  store.subscribe(() => {
    const state = store.getSnapshot();
    const count = state.discoveryWork.match(/^(\d+) candidates checked/);
    if (state.discoveryLoading && count) counts.push(Number(count[1]));
  });
  await store.initialize();
  await store.savePreferences({});
  assert.equal(calls.length, 9);
  assert.equal(new Set(calls).size, 9);
  assert.equal(store.getSnapshot().current.id, calls.at(-1));
  assert.deepEqual(
    counts,
    [...counts].sort((a, b) => a - b),
  );
  const search = records.find((row) => row.operation === "discovery_search");
  assert.equal(search.rankingPasses, 2);
  assert.equal(search.rejectedAfterDetails, 8);
});

test("a fresh browser uses shared verified catalog details and skips known sequels without detail requests", async () => {
  const verified = { ...anime, detailsVerifiedUntil: Date.now() + 60000 };
  const calls = [];
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    request: async (url) => {
      calls.push(url);
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({
          data: [{ ...verified, id: 2, prequels: [999] }, verified],
          nextOffset: null,
        });
      throw new Error("Unexpected request " + url);
    },
  });
  await store.initialize();
  await store.savePreferences({});
  assert.equal(store.getSnapshot().current.id, 1);
  assert.ok(calls.every((url) => !url.startsWith("/api/anime/")));
});
