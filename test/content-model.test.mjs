import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaste,
  scoreAnime,
  rankRecommendations,
  preferenceSignals,
  ratingSignal,
  recommendationSeeds,
} from "../src/lib/recommend.js";
const anime = (id, synopsis, extra = {}) => ({
  id,
  title: `Anime ${id}`,
  synopsis,
  genres: ["Sci-Fi"],
  format: "tv",
  nsfw: "white",
  prequels: [],
  ...extra,
});
const detective =
  "Detectives investigate a murder conspiracy through hidden clues and criminal suspects.";
const robots =
  "Giant robots fight invading monsters in explosive battles to defend cities.";

test("personal low/high ratings keep their meaning even with one rating or strict rating habits", () => {
  assert.ok(ratingSignal(2, 2, 1) < 0);
  assert.ok(ratingSignal(9, 9, 1) > 0);
  for (const mean of [1, 5, 10]) {
    assert.ok(ratingSignal(2, mean, 1000) < 0);
    assert.ok(ratingSignal(8, mean, 1000) > 0);
  }
  assert.equal(ratingSignal(0), 0);
  assert.equal(ratingSignal(11), 0);
  const low = anime(1, detective, {
    listStatus: { status: "completed", score: 2 },
  });
  assert.ok(scoreAnime(anime(2, detective), buildTaste({}, [low])) < 0);
});

test("synopsis evidence separates anime sharing the same broad genres", () => {
  const liked = anime(10, detective),
    disliked = anime(11, robots);
  const reactions = {
    10: { action: "good", anime: liked },
    11: { action: "bad", anime: disliked },
  };
  const picks = rankRecommendations([anime(1, robots), anime(2, detective)], {
    reactions,
  });
  assert.equal(picks[0].anime.id, 2);
  assert.ok(picks[0].enjoyment > picks[1].enjoyment);
  assert.match(picks[0].reason, /story connection/);
});

test("enjoyment and viewing interest remain separate for dropped rated anime and prospective choices", () => {
  const dropped = anime(1, detective, {
    listStatus: { status: "dropped", score: 9 },
  });
  const signals = preferenceSignals(dropped);
  assert.ok(signals.enjoyment > 0);
  assert.ok(signals.interest < 0);
  assert.equal(recommendationSeeds({}, [dropped]).length, 0);
  const taste = buildTaste(
    { 2: { action: "watch", anime: anime(2, robots) } },
    [dropped],
  );
  assert.equal(
    taste.records.get(2).enjoyment,
    0,
    "planning is not proof of enjoyment",
  );
  assert.equal(taste.records.get(2).interest, 0.4);
  assert.ok(
    recommendationSeeds({
      2: { action: "watch", anime: anime(2, robots) },
    }).some((a) => a.id === 2),
    "Tentative interest still helps retrieve candidates without becoming enjoyment",
  );
  assert.equal(taste.records.size, 2);
});

test("view duration, time on card, timestamps and public scores cannot affect ranking", () => {
  const item = anime(10, detective);
  const pool = [anime(1, robots), anime(2, detective)];
  const initial = rankRecommendations(pool, {
    reactions: { 10: { anime: item, action: "good" } },
  });
  const changed = rankRecommendations(
    pool.map((a) => ({ ...a, score: 10, viewTime: 99999, dwellTime: 99999 })),
    {
      reactions: {
        10: {
          anime: { ...item, viewTime: 99999 },
          action: "good",
          viewedMs: 99999,
          timestamp: 99999,
        },
      },
    },
  );
  assert.deepEqual(
    changed.map((p) => [p.anime.id, p.score]),
    initial.map((p) => [p.anime.id, p.score]),
  );
});

test("candidate scoring responds to a changed personal MAL rating and supports missing synopses", () => {
  const list = [
    anime(10, detective, { listStatus: { status: "completed", score: 9 } }),
    anime(11, robots, { listStatus: { status: "completed", score: 2 } }),
  ];
  const pool = [anime(1, robots), anime(2, detective)];
  assert.equal(rankRecommendations(pool, { list })[0].anime.id, 2);
  const swapped = list.map((a) => ({
    ...a,
    listStatus: { ...a.listStatus, score: 11 - a.listStatus.score },
  }));
  assert.equal(rankRecommendations(pool, { list: swapped })[0].anime.id, 1);
  assert.ok(Number.isFinite(scoreAnime(anime(3, ""), buildTaste({}, list))));
});

test("explanation contributions equal the actual score change when a feature is removed", () => {
  const known = {
    id: 1,
    title: "Favorite",
    genres: ["Action"],
    format: "tv",
    studios: ["Studio A"],
  };
  const taste = buildTaste({ 1: { action: "good", anime: known } }, [], {}, [
    known,
  ]);
  const candidate = { ...known, id: 2 };
  const analysis = taste.model.explain(candidate);
  const genre = analysis.contributions.find((c) => c.key === "genre:Action");
  const actual =
    taste.model.score(candidate).score -
    taste.model.score({ ...candidate, genres: [] }).score;
  assert.ok(Math.abs(genre.contribution - actual) < 1e-12);
  assert.ok(genre.contribution > 0);
  const studio = analysis.contributions.find(
    (c) => c.key === "studio:Studio A",
  );
  const fullScore = taste.model.score(candidate).score;
  const withoutStudio = taste.model.score({ ...candidate, studios: [] }).score;
  assert.ok(
    Math.abs(studio.contribution - (fullScore - withoutStudio)) < 1e-12,
  );
  assert.ok(
    studio.contribution > 0,
    "Ranking keeps the studio contribution alongside the genre",
  );
  assert.ok(fullScore > withoutStudio);
  taste.model.explain(candidate);
  assert.equal(
    taste.model.score(candidate).score,
    fullScore,
    "Explaining cannot change the ranking score",
  );
});
