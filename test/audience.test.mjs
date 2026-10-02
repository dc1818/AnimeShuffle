import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseNext,
  rankRecommendations,
  isEligible,
} from "../src/lib/recommend.js";
import { normalizePreferences } from "../src/lib/preferences.js";
const anime = (id, genres = ["Adventure"], extra = {}) => ({
  id,
  title: `Anime ${id}`,
  genres,
  nsfw: "white",
  format: "tv",
  prequels: [],
  ...extra,
});
const kids = (id, extra = {}) => anime(id, ["Kids", "Adventure"], extra);
const pool = [
  kids(1),
  kids(2),
  kids(3),
  anime(4, ["Adventure"], { ageRating: "g" }),
  anime(5),
];

test("automatic audience filtering applies to cold start, exploration, ranking and final detail checks", () => {
  for (const random of [() => 0, () => 0.9]) {
    const pick = chooseNext(pool, {
      random,
      preferences: { favoriteGenres: ["Adventure"] },
    });
    assert.ok(pick.anime.id >= 4);
    assert.ok(chooseNext(pool, { random }).anime.id >= 4);
  }
  assert.deepEqual(
    rankRecommendations(pool)
      .map((p) => p.anime.id)
      .sort(),
    [4, 5],
  );
  assert.equal(isEligible(kids(1), {}, [], new Set()), false);
  assert.equal(
    isEligible(pool[3], {}, [], new Set()),
    true,
    "All ages is not the same as aimed at children",
  );
});

test("positive children's-title interest is learned without inferring age, and overrides are respected", () => {
  const reactions = { 90: { anime: kids(90), action: "good" } };
  assert.equal(isEligible(kids(1), reactions, [], new Set()), true);
  assert.equal(
    isEligible(kids(1), reactions, [], new Set(), false, {
      childrenTitles: "hide",
    }),
    false,
  );
  assert.equal(
    isEligible(kids(1), {}, [], new Set(), false, {
      childrenTitles: "include",
    }),
    true,
  );
  assert.equal(
    isEligible(
      kids(1),
      {},
      [kids(90, { listStatus: { status: "completed", score: 0 } })],
      new Set(),
    ),
    false,
  );
  assert.equal(
    isEligible(
      kids(1),
      {},
      [kids(90, { listStatus: { status: "completed", score: 8 } })],
      new Set(),
    ),
    true,
  );
  reactions[91] = { anime: kids(91), action: "nope" };
  assert.equal(
    isEligible(kids(1), reactions, [], new Set()),
    false,
    "Negative choices counter positive interest",
  );
  assert.equal(
    normalizePreferences({ childrenTitles: "bogus", guessedAge: 18 })
      .childrenTitles,
    "auto",
  );
  assert.equal("guessedAge" in normalizePreferences({ guessedAge: 18 }), false);
});

test("automatic mode prevents clusters and never repeats a reacted title", () => {
  const reactions = {
    90: { anime: kids(90), action: "watch" },
    1: { anime: kids(1), action: "nope" },
    91: { anime: kids(91), action: "good" },
  };
  const picks = rankRecommendations(pool, { reactions });
  assert.equal(
    picks.some((p) => p.anime.id === 1),
    false,
  );
  assert.ok(picks.filter((p) => p.anime.genres.includes("Kids")).length <= 2);
  const pick = chooseNext(pool, {
    reactions,
    recent: [kids(88)],
    random: () => 0,
  });
  assert.ok(!pick.anime.genres.includes("Kids"));
  const allKids = rankRecommendations(
    [kids(10), kids(11), kids(12), kids(13)],
    { reactions },
  );
  assert.equal(allKids.length, 2);
});
