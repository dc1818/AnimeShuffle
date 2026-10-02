import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesPreferences,
  normalizePreferences,
  runtimeLabel,
} from "../src/lib/preferences.js";
import { chooseNext } from "../src/lib/recommend.js";
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
      childrenTitles: "auto",
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
    chooseNext([anime(1), anime(5)], { preferences, random: () => 0.5 }).anime
      .id,
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
