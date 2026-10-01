import test from "node:test";
import assert from "node:assert/strict";
import {
  preferenceWeight,
  preferenceSignals,
  buildTaste,
  isEligible,
  chooseNext,
  scoreAnime,
} from "../src/lib/recommend.js";
const anime = (id, genres = ["Action"], extra = {}) => ({
  id,
  genres,
  format: "tv",
  nsfw: "white",
  prequels: [],
  ...extra,
});
test("unrated watching and planned titles remain positive signals", () => {
  assert.ok(
    preferenceWeight({ listStatus: { status: "watching", score: 0 } }) > 0,
  );
  assert.ok(
    preferenceWeight({ listStatus: { status: "plan_to_watch", score: 0 } }) > 0,
  );
  assert.equal(
    preferenceWeight({ listStatus: { status: "on_hold", score: 0 } }),
    0,
  );
});
test("explicit dislike replaces implicit watching signal", () => {
  const a = anime(1);
  const taste = buildTaste({ 1: { action: "bad", anime: a } }, [
    { ...a, listStatus: { status: "watching" } },
  ]);
  assert.equal(taste.records.size, 1);
  assert.ok(scoreAnime(anime(2), taste) < 0);
});
test("known entries, rated titles and unseen sequels are excluded", () => {
  const a = anime(1);
  assert.equal(
    isEligible(
      a,
      {},
      [{ ...a, listStatus: { status: "plan_to_watch" } }],
      new Set(),
    ),
    false,
  );
  assert.equal(isEligible(a, { 1: { action: "nope" } }, [], new Set()), false);
  assert.equal(
    isEligible(anime(2, [], { prequels: [1] }), {}, [], new Set()),
    false,
  );
  assert.equal(
    isEligible(
      anime(2, [], { prequels: [1] }),
      { 1: { action: "good" } },
      [],
      new Set(),
    ),
    true,
  );
});
test("cold start works and recommendation ranking learns from unrated profile", () => {
  const pool = [anime(2, ["Romance"]), anime(3, ["Action"])];
  assert.ok(chooseNext(pool, { random: () => 0.5 }));
  const picked = chooseNext(pool, {
    list: [
      anime(1, ["Action"], { listStatus: { status: "watching", score: 0 } }),
    ],
    random: () => 0.5,
  });
  assert.equal(picked.anime.id, 3);
});
test("unknown/adult labels and skipped shows do not enter feed", () => {
  assert.equal(chooseNext([anime(1, [], { nsfw: "gray" })]), null);
  assert.equal(chooseNext([anime(1)], { skipped: new Set([1]) }), null);
});

test("unrated completed and dropped MAL shows shape taste and supersede old plans", () => {
  const completed = {
    ...anime(11, ["Romance"]),
    listStatus: { status: "completed", score: 0 },
  };
  const dropped = {
    ...anime(12, ["Action"]),
    listStatus: { status: "dropped", score: 0 },
  };
  const taste = buildTaste({ 12: { anime: dropped, action: "watch" } }, [
    completed,
    dropped,
  ]);
  assert.ok(
    scoreAnime(anime(20, ["Romance"]), taste) >
      scoreAnime(anime(21, ["Action"]), taste),
  );
  const ratedDrop = preferenceSignals({
    ...dropped,
    listStatus: { status: "dropped", score: 10 },
  });
  assert.ok(ratedDrop.enjoyment > 0, "a high rating still records enjoyment");
  assert.ok(
    ratedDrop.interest < 0,
    "dropping separately records lack of viewing interest",
  );
  const explicit = buildTaste({ 12: { anime: dropped, action: "good" } }, [
    dropped,
  ]);
  assert.ok(
    scoreAnime(anime(21, ["Action"]), explicit) > 0,
    "a direct Good remains authoritative",
  );
});
