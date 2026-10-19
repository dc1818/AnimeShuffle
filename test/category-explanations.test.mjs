import test from "node:test";
import assert from "node:assert/strict";
import { buildTaste, chooseNext } from "../src/lib/recommend.js";
import { explainPickReasons } from "../src/lib/pick-explanation.js";
const anime = (id, genres, extra = {}) => ({
  id,
  title: `Anime ${id}`,
  genres,
  nsfw: "white",
  format: "tv",
  episodes: 12,
  ...extra,
});
const text = (a, taste) => explainPickReasons(a, taste).join(" ");
test("category interests explain picks without requiring prior reactions", () => {
  for (const [id, a, phrase] of [
    [
      "real-robot",
      anime(2, ["Real Robot"]),
      /Real Robot category.*interest you selected/,
    ],
    [
      "seinen",
      anime(2, ["Seinen"]),
      /Seinen audience label.*interest you selected/,
    ],
    [
      "mecha",
      anime(2, ["Real Robot"]),
      /Real Robot category falls under Mecha/,
    ],
    [
      "based-on-light-novel",
      anime(2, [], { adaptationSource: "Light novel" }),
      /Light Novel.*interest you selected/i,
    ],
    ["tv", anime(2, []), /TV.*format.*interest you selected/i],
  ])
    assert.match(text(a, buildTaste({}, [], { preferredNodes: [id] })), phrase);
});
test("audience combinations and inherited categories refer to real reactions without inventing motives", () => {
  const a = anime(1, ["Shounen", "Sports"]),
    b = anime(2, ["Shounen", "Sports"]);
  assert.match(
    text(b, buildTaste({ 1: { anime: a, action: "good" } })),
    /Anime 2 and Anime 1 share the Sports genre and Shounen audience label/,
  );
  const candidate = anime(3, ["Mecha"]);
  const explanation = text(
    candidate,
    buildTaste({ 1: { anime: anime(1, ["Real Robot"]), action: "watch" } }),
  );
  assert.match(explanation, /caught your eye for a future watch/);
  assert.match(explanation, /Mecha category/);
  assert.doesNotMatch(explanation, /You liked|because you liked.*Mecha/);
});
test("unknown, unrelated, negative and unreviewed plot labels do not become positive explanations", () => {
  const p = { preferredNodes: ["real-robot", "tragedy", "afterlife"] };
  assert.doesNotMatch(
    text(anime(2, []), buildTaste({}, [], p)),
    /Real Robot|Tragedy|Afterlife/,
  );
  assert.doesNotMatch(
    text(anime(2, ["Tragedy", "Afterlife"]), buildTaste({}, [], p)),
    /Tragedy|Afterlife/,
  );
  const taste = buildTaste({
    1: { anime: anime(1, ["Real Robot"]), action: "bad" },
  });
  assert.doesNotMatch(
    text(anime(2, ["Real Robot"]), taste),
    /Real Robot|Mecha/,
  );
});
test("lesser-known discovery explains the selection branch only when it was used", () => {
  const pool = [anime(10, ["Real Robot"], { members: 1000 })];
  const preferences = { preferredNodes: ["real-robot"] };
  const hidden = chooseNext(pool, { preferences, random: () => 0.1 });
  assert.match(hidden.whyReasons.join(" "), /less widely followed/);
  const ordinary = chooseNext(pool, { preferences, random: () => 0.8 });
  assert.doesNotMatch(ordinary.whyReasons.join(" "), /less widely followed/);
});

test("Naruto explanation names the current pick and never compares Naruto to itself", () => {
  const known = anime(20, ["Shounen", "Action"], { title: "Naruto" });
  const candidate = anime(21, ["Shounen", "Action"], { title: "Bleach" });
  const reasons = explainPickReasons(
    candidate,
    buildTaste({ 20: { anime: known, action: "good" } }),
  );
  const reason = reasons.find((r) => r.includes("Shounen audience label"));
  assert.equal(
    reason,
    "You liked Naruto. Bleach also has the Action genre and Shounen audience label.",
  );
  assert.equal(reason.match(/Naruto/g).length, 1);
  assert.doesNotMatch(
    reasons.join(" "),
    /Its Shounen|combination also appears in Naruto/,
  );
  assert.doesNotMatch(
    text(known, buildTaste({ 20: { anime: known, action: "good" } })),
    /shared with Naruto|Naruto and Naruto/,
  );
});

test("Discover labels identify the actual selection branch while details remain separate", () => {
  const pool = [anime(10, ["Real Robot"], { members: 1000 })];
  const preferences = { preferredNodes: ["real-robot"] };
  for (const [random, label] of [
    [0.1, "Lesser-known find"],
    [0.35, "Explore something different"],
    [0.8, "Based on your taste"],
  ]) {
    const pick = chooseNext(pool, { preferences, random: () => random });
    assert.equal(pick.discoveryLabel, label);
    assert.notEqual(pick.detailReason, label);
  }
  assert.equal(
    chooseNext(pool, { random: () => 0.1 }).discoveryLabel,
    "Getting to know your taste",
  );
  assert.equal(
    chooseNext([anime(11, ["Real Robot"], { members: 1000000 })], {
      preferences,
      random: () => 0.1,
    }).discoveryLabel,
    "Based on your taste",
  );
});
