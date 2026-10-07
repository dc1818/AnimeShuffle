import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaste,
  scoreAnime,
  rankRecommendations,
  isEligible,
  detailedExplanation,
} from "../src/lib/recommend.js";
import { combinedWatchlist } from "../src/lib/watchlist.js";

// Synthetic entry IDs: title similarity never establishes a franchise relationship.
const part4 = {
  id: 40,
  title: "JoJo — Part 4",
  genres: ["Action"],
  format: "tv",
  nsfw: "white",
  prequels: [],
  sequels: [50],
};
const part5 = {
  ...part4,
  id: 50,
  title: "JoJo — Part 5",
  prequels: [40],
  sequels: [60],
};
const part6 = {
  ...part4,
  id: 60,
  title: "JoJo — Part 6",
  prequels: [50],
  sequels: [],
};
const reaction = (anime, action) => ({ anime, action, at: 1 });

test("liking one part promotes its verified follow-up without marking any other entry seen", () => {
  const reactions = { 40: reaction(part4, "good") };
  const unrelated = { ...part5, id: 51, prequels: [], sequels: [] };
  const taste = buildTaste(reactions);
  assert.ok(scoreAnime(part5, taste) > scoreAnime(unrelated, taste));
  assert.equal(
    taste.model.score(unrelated).continuation,
    0,
    "matching titles alone do not transfer interest",
  );
  assert.equal(
    taste.model.score(part6).continuation,
    0,
    "no invented whole-franchise preference",
  );
  assert.equal(isEligible(part5, reactions, [], new Set()), true);
  assert.equal(
    isEligible(part6, reactions, [], new Set()),
    false,
    "unseen preceding part still matters",
  );
  const picks = rankRecommendations([unrelated, part5, part6], { reactions });
  assert.equal(picks[0].anime.id, 50);
  assert.match(
    picks[0].detailReason,
    /follow-up to JoJo — Part 4, which you liked/i,
  );
  assert.deepEqual(Object.keys(reactions), ["40"]);
});

test("Would Watch on another part remains independent from Good on its predecessor", () => {
  const reactions = {
    40: reaction(part4, "good"),
    50: reaction(part5, "watch"),
  };
  const taste = buildTaste(reactions);
  assert.equal(taste.records.get(40).enjoyment, 1);
  assert.equal(taste.records.get(50).enjoyment, 0);
  assert.deepEqual(
    combinedWatchlist(reactions, []).map((entry) => entry.anime.id),
    [50],
  );
  assert.equal(isEligible(part5, reactions, [], new Set()), false);
  assert.equal(
    isEligible(part6, reactions, [], new Set()),
    false,
    "a saved predecessor is not watched",
  );
  assert.doesNotMatch(detailedExplanation(part6, taste), /which you liked/);
});

test("a dislike of one part can lower the next part without banning the franchise or overwriting earlier likes", () => {
  const reactions = { 40: reaction(part4, "good"), 50: reaction(part5, "bad") };
  const taste = buildTaste(reactions);
  assert.equal(taste.records.get(40).enjoyment, 1);
  assert.equal(taste.records.get(50).enjoyment, -1);
  assert.equal(isEligible(part6, reactions, [], new Set()), true);
  assert.ok(taste.model.score(part6).continuation < 0);
  assert.doesNotMatch(
    detailedExplanation(part6, taste),
    /Part 5, which you liked/,
  );
});

test("sequel links from a known entry work before the candidate is enriched, without double-counting reciprocal links", () => {
  const taste = buildTaste({ 40: reaction(part4, "good") });
  const thin = { ...part5, prequels: [] };
  assert.equal(
    taste.model.score(thin).continuation,
    taste.model.score(part5).continuation,
  );
  assert.equal(taste.model.explain(part5).continuations.length, 1);
  assert.ok(Math.abs(taste.model.score(part5).continuation) <= 0.1);
});
