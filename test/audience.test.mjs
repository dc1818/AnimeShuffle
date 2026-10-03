import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseNext,
  rankRecommendations,
  isEligible,
  isAudienceFilteredTitle,
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
const interested = {
  90: { anime: kids(90), action: "good" },
  91: { anime: kids(91), action: "good" },
};

test("children's titles are off by default, including old Automatic preferences and children-specific ratings", () => {
  assert.equal(normalizePreferences().childrenTitles, "hide");
  assert.equal(
    normalizePreferences({ childrenTitles: "auto" }).childrenTitles,
    "hide",
  );
  for (const random of [() => 0, () => 0.9]) {
    assert.ok(chooseNext(pool, { random }).anime.id === 5);
    assert.ok(
      chooseNext(pool, { random, reactions: interested }).anime.id === 5,
    );
  }
  assert.deepEqual(
    rankRecommendations(pool)
      .map((p) => p.anime.id)
      .sort(),
    [5],
  );
  assert.equal(
    isEligible(
      anime(10, ["Adventure"], { ageRating: "pg" }),
      {},
      [],
      new Set(),
    ),
    false,
  );
  assert.equal(
    isEligible(pool[3], {}, [], new Set()),
    false,
    "All ages titles are also excluded by the conservative default filter",
  );
});

test("enabled requires repeated real interest, and old unrated viewing or one save is insufficient", () => {
  const enabled = { childrenTitles: "include" };
  const allowed = (reactions = {}, list = []) =>
    isEligible(kids(1), reactions, list, new Set(), false, enabled);
  assert.equal(allowed(), false);
  assert.equal(allowed({ 90: interested[90] }), false);
  assert.equal(allowed({ 90: { anime: kids(90), action: "watch" } }), false);
  assert.equal(allowed(interested), true);
  assert.equal(
    allowed({}, [kids(90, { listStatus: { status: "completed", score: 0 } })]),
    false,
  );
  assert.equal(
    allowed(
      {},
      [90, 91].map((id) =>
        kids(id, { listStatus: { status: "completed", score: 8 } }),
      ),
    ),
    true,
  );
  assert.equal(
    allowed({ ...interested, 92: { anime: kids(92), action: "nope" } }),
    false,
  );
});

test("enabled children suggestions remain occasional, respect recent history and never repeat reactions", () => {
  const options = {
    reactions: interested,
    preferences: { childrenTitles: "include" },
  };
  assert.equal(
    rankRecommendations(pool, options).filter((p) =>
      isAudienceFilteredTitle(p.anime),
    ).length,
    1,
  );
  assert.equal(
    rankRecommendations([kids(10), kids(11), kids(12)], options).length,
    1,
  );
  for (const count of [0, 4, 8]) {
    const recent = [
      kids(88),
      ...Array.from({ length: count }, (_, i) => anime(100 + i)),
    ];
    assert.ok(
      !isAudienceFilteredTitle(
        chooseNext(pool, {
          ...options,
          recent,
          random: () => 0,
        }).anime,
      ),
    );
  }
  assert.equal(
    isEligible(kids(90), interested, [], new Set(), false, options.preferences),
    false,
  );
});
