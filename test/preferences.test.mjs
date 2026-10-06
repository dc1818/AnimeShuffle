import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesPreferences,
  normalizePreferences,
  runtimeLabel,
} from "../src/lib/preferences.js";
import { chooseNext, rankRecommendations } from "../src/lib/recommend.js";
const anime = (episodes, extra = {}) => ({
  id: episodes || 1,
  episodes,
  format: "tv",
  duration: 24,
  status: "finished_airing",
  nsfw: "white",
  genres: [],
  ...extra,
});
test("series ranges cover every positive episode count without overlap", () => {
  const ids = ["short", "standard", "medium", "long", "very-long"];
  for (const episodes of [1, 6, 8, 13, 14, 22, 26, 27, 49, 50, 99, 100, 1200]) {
    assert.equal(
      ids.filter((id) => matchesPreferences(anime(episodes), { lengths: [id] }))
        .length,
      1,
    );
  }
});
test("format and length choices combine; movies keep their own duration", () => {
  const preferences = { formats: ["movies", "series"], lengths: ["long"] };
  assert.ok(
    matchesPreferences(
      anime(1, { format: "movie", duration: 137 }),
      preferences,
    ),
  );
  assert.ok(matchesPreferences(anime(64), preferences));
  assert.equal(matchesPreferences(anime(13), preferences), false);
  assert.ok(
    matchesPreferences(anime(1, { format: "special", duration: 46 }), {
      formats: ["shorts"],
    }),
  );
  assert.ok(
    matchesPreferences(anime(6, { format: "ova" }), { formats: ["shorts"] }),
  );
});
test("unknown and unfinished titles follow explicit preferences", () => {
  assert.ok(matchesPreferences(anime(0), { lengths: ["short"] }));
  assert.equal(matchesPreferences(anime(0), { includeUnknown: false }), false);
  assert.equal(
    matchesPreferences(anime(12, { format: "unknown" }), {
      includeUnknown: false,
    }),
    false,
  );
  assert.equal(
    matchesPreferences(anime(0), { lengths: ["short"], includeUnknown: false }),
    false,
  );
  assert.equal(
    matchesPreferences(anime(12, { status: "currently_airing" }), {
      finishedOnly: true,
    }),
    false,
  );
  assert.equal(
    matchesPreferences(anime(12, { status: "" }), { finishedOnly: true }),
    false,
  );
  assert.ok(matchesPreferences(anime(12), { finishedOnly: true }));
});
test("discovery respects filters and time estimates use actual episode runtimes", () => {
  const result = chooseNext([anime(12), anime(26)], {
    preferences: { lengths: ["standard"] },
    random: () => 0.5,
  });
  assert.equal(result.anime.episodes, 26);
  assert.equal(runtimeLabel(anime(12, { duration: 3 })), "~36 min total");
  assert.equal(runtimeLabel(anime(100)), "~40h total");
  assert.equal(runtimeLabel(anime(0)), "Total time unknown");
  assert.match(
    runtimeLabel(anime(12, { status: "currently_airing" })),
    /listed episodes/,
  );
});
test("preference input is normalized and cannot add arbitrary fields", () => {
  assert.deepEqual(
    normalizePreferences({
      formats: ["movies", "movies", "fake"],
      lengths: null,
      finishedOnly: "yes",
      includeUnknown: false,
      account: "another-user",
    }),
    {
      favoriteGenres: [],
      favoriteAnime: [],
      formats: ["movies"],
      lengths: [],
      finishedOnly: false,
      includeUnknown: false,
      childrenTitles: "hide",
      includeNonCanonMovies: false,
      scoreMin: null,
      scoreMax: null,
    },
  );
});

test("favorites seed taste, are bounded and never reappear as discovery candidates", async () => {
  const { buildTaste, scoreAnime } = await import("../src/lib/recommend.js");
  const favorites = [1, 2, 3, 4].map((id) => ({
    id,
    title: `Favorite ${id}`,
    genres: ["Action"],
    format: "tv",
    image: "https://untrusted.test/a.jpg",
  }));
  const preferences = normalizePreferences({
    favoriteAnime: favorites,
    favoriteGenres: ["Action", "Action", "fake"],
  });
  assert.equal(preferences.favoriteAnime.length, 3);
  assert.equal(preferences.favoriteAnime[0].image, "");
  assert.deepEqual(preferences.favoriteGenres, ["Action"]);
  const taste = buildTaste({}, [], preferences);
  assert.ok(
    scoreAnime(anime(12, { genres: ["Action"] }), taste) >
      scoreAnime(anime(12, { genres: ["Romance"] }), taste),
  );
  assert.equal(
    chooseNext([anime(1), anime(5, { genres: ["Action"] })], {
      preferences,
      random: () => 0.5,
    }).anime.id,
    5,
  );
  for (const action of ["good", "bad", "watch", "nope"]) {
    assert.equal(
      chooseNext([anime(1), anime(5)], {
        reactions: { 1: { action, anime: anime(1) } },
        random: () => 0.5,
      }).anime.id,
      5,
    );
  }
});

test("viewing genres restrict both feeds with any-match semantics and Any genre clears the filter", async () => {
  const { chooseNext, rankRecommendations, isEligible } =
    await import("../src/lib/recommend.js");
  const action = {
    id: 201,
    title: "Action",
    genres: ["Action"],
    nsfw: "white",
    format: "tv",
  };
  const drama = { ...action, id: 202, title: "Drama", genres: ["Drama"] };
  const comedy = { ...action, id: 203, title: "Comedy", genres: ["Comedy"] };
  const preferences = { favoriteGenres: ["Action", "Drama"] };
  assert.equal(
    isEligible(comedy, {}, [], new Set(), false, preferences),
    false,
  );
  assert.equal(isEligible(action, {}, [], new Set(), false, preferences), true);
  assert.equal(isEligible(drama, {}, [], new Set(), false, preferences), true);
  assert.deepEqual(
    rankRecommendations([action, drama, comedy], { preferences })
      .map((p) => p.anime.id)
      .sort(),
    [201, 202],
  );
  assert.equal(chooseNext([comedy], { preferences }), null);
  assert.equal(
    chooseNext([comedy], { preferences: { favoriteGenres: [] } }).anime.id,
    203,
  );
  assert.equal(
    rankRecommendations([action, drama, comedy], {
      preferences: { favoriteGenres: [] },
    }).length,
    3,
  );
});

test("Experimental aliases preserve canonical MAL matching and OR genre filtering", () => {
  const preferences = normalizePreferences({
    favoriteGenres: ["Experimental", "Avant Garde", "Action"],
  });
  assert.deepEqual(preferences.favoriteGenres, ["Avant Garde", "Action"]);
  const pool = [
    anime(1, { genres: ["Romance"] }),
    anime(2, { genres: ["Avant Garde"] }),
  ];
  assert.equal(chooseNext(pool, { preferences }).anime.id, 2);
});

test("MAL score ranges use community scores, include endpoints, and exclude unscored titles only when restricted", () => {
  const p = { scoreMin: 7, scoreMax: 8.5 };
  for (const score of [7, 8, 8.5])
    assert.ok(matchesPreferences(anime(12, { score }), p));
  for (const score of [6.99, 8.51, null, 0, undefined])
    assert.equal(
      matchesPreferences(anime(12, { score, listStatus: { score: 10 } }), p),
      false,
    );
  assert.ok(matchesPreferences(anime(12, { score: null }), {}));
  assert.deepEqual(
    normalizePreferences({ scoreMin: 9, scoreMax: 7 }).scoreMin,
    7,
  );
  assert.equal(
    normalizePreferences({ scoreMin: "8", scoreMax: 20 }).scoreMin,
    null,
  );
  const pool = [
    anime(1, { score: 6 }),
    anime(2, { score: 8 }),
    anime(3, { score: 9 }),
  ];
  assert.equal(chooseNext(pool, { preferences: p }).anime.id, 2);
  assert.deepEqual(
    rankRecommendations(pool, { preferences: p }).map((pick) => pick.anime.id),
    [2],
  );
});
