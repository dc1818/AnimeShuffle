import test from "node:test";
import assert from "node:assert/strict";
import { createNeighborLookup } from "../src/lib/sparse-neighbors.js";
import {
  buildTaste,
  recommendationSeeds,
  rankRecommendations,
} from "../src/lib/recommend.js";

test("indexed neighbors exactly match brute-force cosine scores, order and explanation keys", () => {
  let seed = 123456;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const vector = () =>
    new Map(
      Array.from({ length: Math.floor(random() * 80) }, () => [
        "feature:" + Math.floor(random() * 120),
        (random() - 0.15) * 3,
      ]),
    );
  const records = Array.from({ length: 400 }, (_, id) => {
    const v = vector();
    return { anime: { id }, vector: v, norm: Math.hypot(...v.values()) };
  });
  records.push({ anime: { id: 401 }, vector: new Map(), norm: 0 });
  const lookup = createNeighborLookup(records);
  for (let id = 0; id < 160; id++) {
    const v = id < 20 ? records[id].vector : vector(),
      norm = Math.hypot(...v.values());
    const expected = records
      .filter((r) => r.anime.id !== id && r.vector.size >= 2)
      .map((r) => {
        const shared = [...v.keys()].filter((k) => r.vector.has(k));
        const sim =
          shared.reduce((sum, k) => sum + v.get(k) * r.vector.get(k), 0) /
          (norm * r.norm || 1);
        return { ...r, shared, sim };
      })
      .filter((r) => r.shared.length >= 2 && r.sim >= 0.35);
    assert.deepEqual(lookup(v, norm, id), expected);
  }
});

test("incremental seed diversity preserves exact greedy order and ID ties after preference changes", () => {
  const genres = [
    "Action",
    "Comedy",
    "Drama",
    "Sci-Fi",
    "Adventure",
    "Romance",
  ];
  const reactions = Object.fromEntries(
    Array.from({ length: 160 }, (_, i) => {
      const anime = {
        id: i + 1,
        title: "Fixture " + i,
        genres: genres.filter((_, g) => (i + g) % 3 !== 0),
        format: "tv",
      };
      return [
        anime.id,
        { anime, action: ["good", "watch", "bad", "nope"][i % 4] },
      ];
    }),
  );
  const similarity = (a, b) => {
    const x = new Set(a.genres || []),
      y = new Set(b.genres || []);
    return (
      [...x].filter((g) => y.has(g)).length / (new Set([...x, ...y]).size || 1)
    );
  };
  for (const preferences of [
    {},
    { favoriteAnime: [reactions[3].anime] },
    { favoriteGenres: ["Drama"] },
  ]) {
    const remaining = [
        ...buildTaste(reactions, [], preferences, [], false).records.values(),
      ].filter(
        (r) => r.weight > 0.05 && r.anime.listStatus?.status !== "dropped",
      ),
      expected = [];
    while (remaining.length && expected.length < 50) {
      const priority = (r) =>
        r.weight -
        0.35 * Math.max(0, ...expected.map((a) => similarity(a, r.anime)));
      remaining.sort(
        (a, b) => priority(b) - priority(a) || a.anime.id - b.anime.id,
      );
      expected.push(remaining.shift().anime);
    }
    assert.deepEqual(recommendationSeeds(reactions, [], preferences), expected);
  }
});

test("detail-check shortlists preserve ranking when unused explanations are deferred", () => {
  const pool = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    title: "Candidate " + i,
    genres: [i % 2 ? "Drama" : "Action"],
    format: "tv",
    status: "finished_airing",
    nsfw: "white",
  }));
  const options = {
    preferences: { favoriteGenres: ["Action"], includeUnknown: true },
  };
  const explained = rankRecommendations(pool, options);
  const shortlist = rankRecommendations(pool, {
    ...options,
    includeExplanations: false,
  });
  assert.ok(explained.length > 0);
  assert.deepEqual(
    shortlist,
    explained.map(({ reason, whyReasons, detailReason, ...pick }) => pick),
  );
  assert.ok(
    explained.every(
      (pick) =>
        typeof pick.reason === "string" &&
        Array.isArray(pick.whyReasons) &&
        typeof pick.detailReason === "string",
    ),
  );
});

test("75-title reranking keeps the brute-force diversity order and tie-breaks", () => {
  const genres = ["Action", "Drama", "Comedy", "Romance", "Sci-Fi"];
  const pool = Array.from({ length: 120 }, (_, i) => ({
    id: 120 - i,
    title: "Candidate " + i,
    genres: genres.filter((_, g) => (i + g) % 3 !== 0),
    format: "tv",
    status: "finished_airing",
    nsfw: "white",
  }));
  const preferences = { favoriteGenres: ["Action"], includeUnknown: true };
  const taste = buildTaste({}, [], preferences, pool);
  const available = pool.map((anime) => ({
    anime,
    ...taste.model.score(anime),
    saved: false,
  }));
  const expected = [];
  const similarity = (a, b) => {
    const x = new Set(a.genres),
      y = new Set(b.genres);
    return (
      [...x].filter((g) => y.has(g)).length / (new Set([...x, ...y]).size || 1)
    );
  };
  while (expected.length < 75) {
    let best = 0,
      bestScore = -Infinity;
    for (let i = 0; i < available.length; i++) {
      const score =
        available[i].score -
        0.06 *
          Math.max(
            0,
            ...expected.map((p) => similarity(p.anime, available[i].anime)),
          );
      if (
        score > bestScore ||
        (score === bestScore &&
          available[i].anime.id < available[best].anime.id)
      ) {
        best = i;
        bestScore = score;
      }
    }
    expected.push({
      ...available.splice(best, 1)[0],
      tier: expected.length + 1,
    });
  }
  assert.deepEqual(
    rankRecommendations(pool, {
      preferences,
      limit: 75,
      includeExplanations: false,
    }),
    expected,
  );
});
