import test from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_GENRES,
  DEMOGRAPHICS,
  THEMES,
  THEME_GROUPS,
  THEME_DESCRIPTIONS,
  RELATED_THEMES,
  genreGroups,
  categoryContextFeatures,
} from "../src/lib/genres.js";
import {
  normalizePreferences,
  matchesPreferences,
} from "../src/lib/preferences.js";
import {
  buildTaste,
  eligibleCandidates,
  rankRecommendations,
} from "../src/lib/recommend.js";
import { candidateQuery } from "../lib/candidate-catalog.mjs";
const anime = (id, genres) => ({
  id,
  genres,
  nsfw: "white",
  format: "tv",
  episodes: 12,
});
test("all selectable categories, genres and themes have complete navigation definitions", () => {
  assert.equal(DEMOGRAPHICS.length, 5);
  const grouped = Object.values(THEME_GROUPS).flat();
  assert.deepEqual([...grouped].sort(), [...THEMES].sort());
  assert.equal(new Set(grouped).size, THEMES.length);
  for (const theme of THEMES) assert.ok(THEME_DESCRIPTIONS[theme], theme);
  for (const genre of MAIN_GENRES) {
    assert.ok(RELATED_THEMES[genre]?.length, genre);
    for (const theme of RELATED_THEMES[genre])
      assert.ok(THEMES.includes(theme));
  }
});
test("main-category aliases normalize and exact source tags combine with genre and theme restrictions", () => {
  assert.deepEqual(
    normalizePreferences({
      requiredCategories: ["Shonen", "Shounen", "Kodomo", "bogus"],
    }).requiredCategories,
    ["Shounen", "Kids"],
  );
  assert.deepEqual(
    normalizePreferences({ requiredCategories: "Shounen" }).requiredCategories,
    [],
  );
  const preferences = {
    requiredCategories: ["Shounen", "Seinen"],
    restrictGenres: true,
    favoriteGenres: ["Action"],
    requiredThemes: ["Military"],
  };
  const pool = [
    anime(1, ["Shounen", "Action", "Military"]),
    anime(2, ["Seinen", "Action", "Military"]),
    anime(3, ["Josei", "Action", "Military"]),
    anime(4, ["Action", "Military"]),
    anime(5, ["Shounen", "Romance", "Military"]),
    anime(6, ["Shounen", "Action", "School"]),
  ];
  assert.deepEqual(
    eligibleCandidates(pool, { preferences }).map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(
    new Set(rankRecommendations(pool, { preferences }).map((p) => p.anime.id)),
    new Set([1, 2]),
  );
  assert.equal(
    matchesPreferences(
      { demographics: [{ name: "Shounen" }] },
      { requiredCategories: ["Shounen"] },
    ),
    true,
  );
  assert.equal(
    genreGroups(anime(7, ["Mecha"])).some(([group]) => group === "Audience"),
    false,
    "never infer Shounen from robots",
  );
  const url = (p) =>
    new URL(
      "https://example.com/api/catalog?preferences=" +
        encodeURIComponent(JSON.stringify(p)),
    );
  assert.equal(
    candidateQuery(
      url({ ...preferences, requiredCategories: ["Shounen"] }),
    ).q.get("genres"),
    "1,27",
  );
  assert.equal(
    candidateQuery(url(preferences)).q.get("genres"),
    "1",
    "OR category choices stay local",
  );
});
test("source category combinations learn opposing tastes even when each broad label occurs equally often", () => {
  const records = {
    1: { anime: anime(1, ["Shounen", "Sports"]), action: "good" },
    2: { anime: anime(2, ["Shounen", "Romance"]), action: "bad" },
    3: { anime: anime(3, ["Seinen", "Sports"]), action: "bad" },
    4: { anime: anime(4, ["Seinen", "Romance"]), action: "good" },
  };
  const model = buildTaste(records).model;
  assert.ok(
    model.score(anime(10, ["Shounen", "Sports"])).score >
      model.score(anime(11, ["Shounen", "Romance"])).score,
  );
  assert.equal(
    categoryContextFeatures(anime(12, ["Action", "Mecha"])).length,
    0,
    "unknown demographic creates no guessed interaction",
  );
});
test("explicit Kids category can filter children titles without requiring prior ratings", () => {
  const picks = eligibleCandidates(
    [anime(1, ["Kids"]), anime(2, ["Shounen"])],
    {
      preferences: { requiredCategories: ["Kids"], childrenTitles: "include" },
    },
  );
  assert.deepEqual(
    picks.map((a) => a.id),
    [1],
  );
});
