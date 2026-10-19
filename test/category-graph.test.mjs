import test from "node:test";
import assert from "node:assert/strict";
import {
  TAXONOMY_NODES,
  TAXONOMY_EDGES,
  TAXONOMY_BY_ID,
  taxonomyMemberships,
  taxonomyFeatures,
  taxonomyPaths,
  cleanNodeIds,
} from "../src/lib/anime-taxonomy.js";
import {
  normalizePreferences,
  matchesPreferences,
} from "../src/lib/preferences.js";
import {
  buildTaste,
  eligibleCandidates,
  chooseNext,
} from "../src/lib/recommend.js";
const anime = (id, genres, extra = {}) => ({
  id,
  genres,
  nsfw: "white",
  format: "tv",
  episodes: 12,
  ...extra,
});
test("all imported nodes and reviewed edges are unique, valid, acyclic and reachable", () => {
  assert.equal(TAXONOMY_NODES.length, 287);
  assert.equal(TAXONOMY_BY_ID.size, 287);
  const degrees = new Map(TAXONOMY_NODES.map((n) => [n.id, 0])),
    seen = new Set();
  for (const e of TAXONOMY_EDGES) {
    assert.ok(TAXONOMY_BY_ID.has(e.parent) && TAXONOMY_BY_ID.has(e.child));
    const k = e.parent + ":" + e.child;
    assert.ok(!seen.has(k));
    seen.add(k);
    degrees.set(e.child, degrees.get(e.child) + 1);
  }
  const order = [...degrees].filter(([, n]) => !n).map(([id]) => id);
  assert.deepEqual(order, ["anime-taxonomy"]);
  for (let i = 0; i < order.length; i++)
    for (const e of TAXONOMY_EDGES.filter((e) => e.parent === order[i])) {
      degrees.set(e.child, degrees.get(e.child) - 1);
      if (!degrees.get(e.child)) order.push(e.child);
    }
  assert.equal(order.length, 287);
});
test("only reviewed subtype ancestry implies membership, never related routes", () => {
  for (const [tag, absent] of [
    ["Villainess", ["isekai", "reincarnation", "romance"]],
    ["Real Robot", ["war", "military", "science-fiction"]],
    ["CGDCT", ["iyashikei"]],
    ["Reincarnation", ["isekai"]],
    ["Romantic Subtext", ["romance"]],
    ["World War II", ["war"]],
    ["Childcare", ["work-life"]],
    ["Military", ["war"]],
    ["Mecha", ["science-fiction"]],
  ]) {
    const m = taxonomyMemberships(anime(1, [tag]));
    for (const id of absent)
      assert.equal(m.has(id), false, `${tag} must not imply ${id}`);
  }
  const sports = taxonomyMemberships(anime(1, ["Volleyball"]));
  assert.ok(sports.has("team-sports"));
  assert.ok(sports.has("sports"));
  const robot = taxonomyMemberships(anime(1, ["Real Robot"]));
  assert.ok(robot.has("mecha"));
  assert.deepEqual(taxonomyPaths("real-robot"), [["mecha", "real-robot"]]);
  const hybrid = taxonomyMemberships(anime(1, ["Science Fantasy"]));
  assert.ok(hybrid.has("science-fiction") && hybrid.has("fantasy"));
});
test("missing source tags, synopsis mentions, examples and deprecated labels cannot assign nodes", () => {
  const a = anime(1, [], {
    title: "Patlabor",
    synopsis: "Mecha, isekai and a villainess attend a magic school.",
    taxonomyMemberships: [{ id: "real-robot", confidence: 1 }],
  });
  assert.equal(taxonomyMemberships(a).has("real-robot"), false);
  assert.equal(taxonomyMemberships(a).has("mecha"), false);
  assert.deepEqual(
    cleanNodeIds([
      "trap",
      "lolicon",
      "gender-bender",
      "bogus",
      "real-robot",
      "real-robot",
    ]),
    ["real-robot"],
  );
  assert.ok(
    taxonomyMemberships(anime(1, [{ name: "Sci-Fi" }, { name: "Kids" }])).has(
      "science-fiction",
    ),
  );
  assert.ok(
    taxonomyMemberships(anime(1, [], { adaptationSource: "Light novel" })).has(
      "based-on-novel",
    ),
  );
});
test("paths do not multiply feature weight and taxonomy contribution has a bounded norm", () => {
  const a = anime(1, [
    "Volleyball",
    "Team Sports",
    "Sports",
    "Sports",
    "Real Robot",
  ]);
  const f = taxonomyFeatures(a);
  assert.equal(f.length, new Set(f.map(([k]) => k)).size);
  assert.ok(Math.hypot(...f.map(([, v]) => v)) <= 0.35000001);
  assert.equal(taxonomyFeatures(anime(2, [])).length, 0);
});
test("category selections guide taste by default; hard filters use OR and combine with existing preferences", () => {
  const p = normalizePreferences({
    preferredNodes: ["real-robot", "villainess", "bogus"],
    restrictNodes: true,
  });
  assert.deepEqual(p.preferredNodes, ["real-robot", "villainess"]);
  assert.ok(matchesPreferences(anime(1, ["Villainess"]), p));
  assert.equal(matchesPreferences(anime(2, ["Mecha"]), p), false);
  assert.ok(
    matchesPreferences(anime(2, ["Mecha"]), { ...p, restrictNodes: false }),
  );
  assert.ok(
    matchesPreferences(anime(3, ["Real Robot"]), {
      preferredNodes: ["mecha"],
      restrictNodes: true,
    }),
  );
  assert.equal(
    matchesPreferences(anime(4, ["Real Robot"]), {
      ...p,
      requiredThemes: ["School"],
    }),
    false,
  );
  assert.ok(
    matchesPreferences(anime(5, []), {
      preferredNodes: [],
      restrictNodes: true,
    }),
  );
  const pool = [
    anime(1, ["Real Robot"]),
    anime(2, ["Mecha"]),
    anime(3, ["Villainess"]),
  ];
  assert.deepEqual(
    eligibleCandidates(pool, { preferences: p }).map((a) => a.id),
    [1, 3],
  );
});
test("the trained model uses narrow category choices while randomized discovery remains available", () => {
  const records = {
    1: { anime: anime(1, ["Real Robot"]), action: "good" },
    2: { anime: anime(2, ["Super Robot"]), action: "bad" },
  };
  const model = buildTaste(records).model;
  assert.ok(
    model.score(anime(10, ["Real Robot"])).score >
      model.score(anime(11, ["Super Robot"])).score,
  );
  const preferred = buildTaste({}, [], {
    preferredNodes: ["real-robot"],
  }).model;
  assert.ok(
    preferred.score(anime(10, ["Real Robot"])).score >
      preferred.score(anime(11, ["Super Robot"])).score,
  );
  const pool = Array.from({ length: 20 }, (_, i) =>
    anime(i + 100, ["Real Robot"], { members: i < 10 ? 1000 : 1000000 }),
  );
  const picks = new Set();
  let seed = 12345;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 80; i++) {
    const result = chooseNext(pool, {
      reactions: records,
      random,
      preferences: { preferredNodes: ["real-robot"], restrictNodes: true },
    });
    if (result?.anime) picks.add(result.anime.id);
  }
  assert.ok(picks.size > 1);
});

test("explicit interests work for audience, source, presentation and release formats too", () => {
  for (const [id, a, b] of [
    ["seinen", anime(10, ["Seinen"]), anime(11, ["Shounen"])],
    ["tv", anime(10, []), anime(11, [], { format: "movie" })],
    [
      "based-on-light-novel",
      anime(10, [], { adaptationSource: "Light novel" }),
      anime(11, [], { adaptationSource: "Original" }),
    ],
    ["henshin", anime(10, ["Henshin"]), anime(11, [])],
  ]) {
    const model = buildTaste({}, [], { preferredNodes: [id] }).model;
    assert.ok(model.score(a).score > model.score(b).score, id);
  }
});

test("narrow reactions transfer to existing broad catalog features in both directions", () => {
  for (const [learned, related, unrelated] of [
    ["Real Robot", "Mecha", "Romance"],
    ["Mecha", "Real Robot", "Villainess"],
    ["Volleyball", "Sports", "Horror"],
    ["Shonen", "Shounen", "Seinen"],
  ]) {
    const model = buildTaste({
      1: { anime: anime(1, [learned]), action: "good" },
    }).model;
    assert.ok(
      model.score(anime(2, [related])).score >
        model.score(anime(3, [unrelated])).score,
      learned,
    );
  }
  const model = buildTaste({
    1: { anime: anime(1, ["Real Robot"]), action: "bad" },
  }).model;
  assert.ok(
    model.score(anime(2, ["Mecha"])).score <
      model.score(anime(3, ["Romance"])).score,
  );
});

test("explicit Kodomo works for new users in both discovery and recommendations", async () => {
  const { chooseNextBatch, rankRecommendations } =
    await import("../src/lib/recommend.js");
  const pool = [anime(10, ["Kids"]), anime(11, ["Kids"])];
  const preferences = {
    preferredNodes: ["kodomo"],
    restrictNodes: true,
    childrenTitles: "include",
  };
  assert.equal(eligibleCandidates(pool, { preferences }).length, 2);
  assert.equal(
    chooseNextBatch(pool, { preferences, recent: [anime(9, ["Kids"])] }).length,
    2,
  );
  assert.equal(rankRecommendations(pool, { preferences }).length, 2);
  assert.equal(
    eligibleCandidates(pool, {
      preferences: { ...preferences, childrenTitles: "exclude" },
    }).length,
    0,
  );
});
