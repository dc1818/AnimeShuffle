import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateQuery,
  createCandidateCatalog,
  normalizeCandidate,
} from "../lib/candidate-catalog.mjs";
import { createAnimeStore } from "../src/lib/store.js";
const query = (p = {}, offset = 0) =>
  new URL(
    "https://shuffle.example/api/catalog?offset=" +
      offset +
      "&preferences=" +
      encodeURIComponent(JSON.stringify(p)),
  );
const raw = {
  mal_id: 1,
  title: "Test",
  title_english: "English",
  type: "TV",
  status: "Finished Airing",
  episodes: 12,
  duration: "24 min per ep",
  score: 8,
  rating: "PG-13 - Teens 13 or older",
  genres: [{ name: "Action" }],
  themes: [{ name: "Space" }],
  images: {
    jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1/1.jpg" },
  },
};
test("candidate query pushes equivalent filters upstream and preserves multi-genre OR semantics", () => {
  const { q } = candidateQuery(
    query(
      {
        favoriteGenres: ["Action"],
        scoreMin: 7,
        scoreMax: 9,
        finishedOnly: true,
        formats: ["movies"],
      },
      50,
    ),
  );
  assert.equal(q.get("page"), "2");
  assert.equal(q.get("genres"), "1");
  assert.equal(q.get("min_score"), "7");
  assert.equal(q.get("max_score"), "9");
  assert.equal(q.get("type"), "movie");
  assert.equal(q.get("status"), "complete");
  assert.equal(q.get("sfw"), "true");
  assert.equal(
    candidateQuery(
      query({ favoriteGenres: ["Action", "Drama"], includeNsfw: true }),
    ).q.has("genres"),
    false,
  );
  assert.equal(
    candidateQuery(query({ includeNsfw: true })).q.has("sfw"),
    false,
  );
  assert.throws(() => candidateQuery(query({}, -50)));
  const a = normalizeCandidate(raw);
  assert.equal(a.duration, 24);
  assert.equal(a.score, 8);
  assert.equal(a.nsfw, "white");
  assert.equal(a.englishTitle, "English");
  assert.deepEqual(a.genres, ["Action", "Space"]);
});
test("candidate pages share in-flight work and survive provider restart in the public cache", async () => {
  const entries = new Map();
  let calls = 0;
  const options = {
    interval: 0,
    publicStore: {
      get: (k) => entries.get(k),
      set: (k, v) => entries.set(k, v),
    },
    fetcher: async (url, init) => {
      calls++;
      assert.equal(new URL(url).hostname, "api.tenrai.org");
      assert.deepEqual(init.headers, { Accept: "application/json" });
      return Response.json({
        data: [raw],
        pagination: { has_next_page: true },
      });
    },
  };
  const client = createCandidateCatalog(options);
  const [a, b] = await Promise.all([
    client.page(query()),
    client.page(query()),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.nextOffset, 50);
  assert.deepEqual(a, b);
  assert.equal(
    (await createCandidateCatalog(options).page(query())).cacheHit,
    true,
  );
  assert.equal(calls, 1);
});
test("provider errors trigger cooldown instead of repeating slow requests", async () => {
  let calls = 0;
  const client = createCandidateCatalog({
    interval: 0,
    fetcher: async () => {
      calls++;
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "60" } },
      );
    },
  });
  await assert.rejects(client.page(query()));
  await assert.rejects(client.page(query({}, 50)));
  assert.equal(calls, 1);
});
const memory = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
};
test("Discover falls back to MAL when Tenrai fails and verifies before displaying", async () => {
  const calls = [];
  const a = normalizeCandidate(raw);
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    request: async (url) => {
      calls.push(url);
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.includes("provider=tenrai"))
        return Response.json({ error: "Unavailable" }, { status: 503 });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: [a], nextOffset: null });
      if (url === "/api/anime/1") return Response.json({ ...a, prequels: [] });
      return Response.json({ profiles: {} });
    },
  });
  await store.initialize();
  await store.savePreferences({});
  assert.equal(store.getSnapshot().current.id, 1);
  assert.ok(
    calls.some(
      (url) =>
        url.startsWith("/api/catalog") && !url.includes("provider=tenrai"),
    ),
  );
  assert.ok(calls.includes("/api/anime/1"));
});
test("Discover reports actual checks within a batch and rejects unseen prerequisites", async () => {
  const a = normalizeCandidate(raw),
    progress = [];
  let checks = 0;
  const store = createAnimeStore({
    storage: memory(),
    browserBackup: null,
    request: async (url) => {
      if (url === "/api/session") return Response.json({ configured: true });
      if (url.startsWith("/api/catalog"))
        return Response.json({
          data: [1, 2, 3].map((id) => ({ ...a, id })),
          nextOffset: null,
        });
      if (url.startsWith("/api/anime/"))
        return Response.json({
          ...a,
          id: Number(url.split("/").pop()),
          prequels: ++checks < 3 ? [999] : [],
        });
      return Response.json({ profiles: {} });
    },
  });
  store.subscribe(() => {
    const s = store.getSnapshot();
    if (Number.isFinite(s.discoveryProgress))
      progress.push(s.discoveryProgress);
  });
  await store.initialize();
  await store.savePreferences({});
  assert.equal(checks, 3);
  assert.deepEqual(store.getSnapshot().current.prequels, []);
  assert.ok(progress.includes(33));
  assert.ok(progress.includes(67));
  assert.ok(progress.includes(100));
});

test("catalog keeps a validated trailer ID for immediate preview without another lookup", () => {
  assert.equal(
    normalizeCandidate({ ...raw, trailer: { youtube_id: "abcdefghijk" } })
      .previewVideoId,
    "abcdefghijk",
  );
  assert.equal(
    normalizeCandidate({
      ...raw,
      trailer: { youtube_id: "https://evil.example" },
    }).previewVideoId,
    undefined,
  );
  assert.equal(
    normalizeCandidate({
      ...raw,
      trailer: { youtube_id: "abcdefghijk", embeddable: false },
    }).previewVideoId,
    undefined,
  );
});
