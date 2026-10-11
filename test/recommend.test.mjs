import test from "node:test";
import assert from "node:assert/strict";
import {
  detailedExplanation,
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

test("details distinguish planned, finished and personally rated anime without inventing story similarities", () => {
  const candidate = anime(9, ["Action"]);
  for (const [status, score, phrase] of [
    ["plan_to_watch", 0, "planned to watch"],
    ["completed", 0, "finished"],
    ["completed", 9, "9/10 on MyAnimeList"],
  ]) {
    const taste = buildTaste(
      {},
      [
        anime(1, ["Action"], {
          title: "Known show",
          listStatus: { status, score },
        }),
      ],
      {},
      [],
      true,
    );
    const text = detailedExplanation(candidate, taste, {
      mode: "recommendations",
    });
    assert.ok(text.includes(phrase));
    assert.match(text, /Known show/);
    assert.match(text, /Action/);
    if (!score) assert.doesNotMatch(text, /you liked|you enjoyed|rated/);
  }
  const cold = detailedExplanation(
    candidate,
    buildTaste({}, [], {}, [], true),
    { cold: true },
  );
  assert.match(cold, /starting point/i);
});

test("extended reasons name supported story connections without inventing setting or style contrasts", () => {
  const favorite = anime(1, ["Action"], {
    title: "Favorite",
    synopsis:
      "Soldiers fight invading monsters to save humanity from extinction.",
  });
  const candidate = anime(2, ["Drama"], {
    title: "Candidate",
    synopsis:
      "Soldiers fight a war against deadly creatures as humanity struggles to survive.",
  });
  const taste = buildTaste(
    { 1: { anime: favorite, action: "good" } },
    [],
    {},
    [favorite, candidate],
    true,
  );
  for (const mode of ["discover", "recommendations"]) {
    const text = detailedExplanation(candidate, taste, { mode });
    assert.match(text, /You liked Favorite/);
    assert.match(text, /stay alive against a deadly threat/);
    assert.match(text, /soldiers caught up in an armed conflict/);
    assert.doesNotMatch(
      text,
      /artwork|setting feels|next reaction|mixes familiar|higher place|story description.*resembles/,
    );
  }
  const unrelated = anime(3, ["Action"], {
    synopsis: "A student arrives at school and meets a new friend.",
  });
  assert.doesNotMatch(
    detailedExplanation(unrelated, taste),
    /Both stories|stay alive|armed conflict/,
  );
  const negated = anime(4, ["Action"], {
    synopsis: "These soldiers never fight a war and instead run a bakery.",
  });
  assert.doesNotMatch(
    detailedExplanation(negated, taste),
    /Both stories|armed conflict/,
  );
});

test("recommendation explanations combine positively scored genres, studio and personal ratings", () => {
  const known = anime(1, ["Action", "Fantasy"], {
    title: "Known favorite",
    studios: ["Studio A"],
    listStatus: { status: "completed", score: 9 },
  });
  const candidate = anime(2, ["Action", "Fantasy"], { studios: ["Studio A"] });
  const taste = buildTaste({}, [known], {}, [known, candidate]);
  const text = detailedExplanation(candidate, taste, {
    mode: "recommendations",
    tier: 1,
  });
  assert.match(text, /9\/10/);
  assert.match(text, /Action/);
  assert.match(text, /Fantasy/);
  assert.match(text, /Studio A/);
  assert.match(text, /strongest overall match/);
  assert.equal(text.match(/You rated/g).length, 1);
});

test("a shared studio with negative learned contribution is not presented as a reason to watch", () => {
  const liked = anime(1, ["Action"], { title: "Liked", studios: ["Studio A"] });
  const reactions = { 1: { action: "good", anime: liked } };
  for (let id = 2; id < 12; id++)
    reactions[id] = {
      action: "bad",
      anime: anime(id, ["Horror"], { studios: ["Studio A"] }),
    };
  const candidate = anime(20, ["Action"], { studios: ["Studio A"] });
  const taste = buildTaste(reactions, [], { favoriteGenres: ["Action"] }, [
    candidate,
  ]);
  assert.ok(taste.model.explain(candidate).groups.studio < 0);
  const text = detailedExplanation(candidate, taste, {
    mode: "recommendations",
  });
  assert.match(text, /Action/);
  assert.doesNotMatch(text, /Studio A/);
});

test("weighted discovery varies matches, includes lesser-known candidates, and never requires popularity or scores", () => {
  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const candidates = [
    anime(101, ["Action"], { members: 2000000 }),
    anime(102, ["Action"], { members: 12000, score: null }),
    anime(103, ["Drama"], { members: 40000 }),
  ];
  const reactions = { 1: { action: "good", anime: anime(1, ["Action"]) } };
  const counts = new Map();
  for (let i = 0; i < 250; i++) {
    const p = chooseNext(candidates, { reactions, random });
    counts.set(p.anime.id, (counts.get(p.anime.id) || 0) + 1);
  }
  assert.equal(counts.size, 3);
  assert.ok(counts.get(102) > 20);
  assert.ok(counts.get(101) > 0);
  const rejected = {
    ...reactions,
    102: { action: "bad", anime: candidates[1] },
  };
  for (let i = 0; i < 20; i++)
    assert.notEqual(
      chooseNext(candidates, { reactions: rejected, random }).anime.id,
      102,
    );
});
