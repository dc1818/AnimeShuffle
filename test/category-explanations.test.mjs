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
    /Shounen \+ Sports combination/,
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
