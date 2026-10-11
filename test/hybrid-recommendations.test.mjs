import test from "node:test";
import assert from "node:assert/strict";
import { communitySimilarities } from "../lib/community-taste.mjs";
import {
  buildTaste,
  isEligible,
  recommendationSeeds,
} from "../src/lib/recommend.js";
import { candidateQuery } from "../lib/candidate-catalog.mjs";
import { createRecommendationEvents } from "../src/lib/recommendation-events.js";
import { evaluateRecommendations } from "../scripts/evaluate-recommendations.mjs";
const anime = (id, genres = [], synopsis = "") => ({
  id,
  title: "Anime " + id,
  genres,
  synopsis,
  nsfw: "white",
  format: "tv",
});
const rows = (actions) =>
  Array.from({ length: 8 }, (_, u) =>
    actions(u).map((action, i) => ({
      account_id: "u" + u,
      anime_id: i + 1,
      action,
    })),
  ).flat();

test("community axes never borrow watch interest to claim enjoyment; small samples and popularity stay neutral", () => {
  const mixed = communitySimilarities(
    rows((u) => [u < 4 ? "good" : "bad", u < 4 ? "watch" : "nope"]),
  );
  assert.deepEqual(mixed, {});
  const graph = communitySimilarities(
    rows((u) => [u < 4 ? "watch" : "nope", u < 4 ? "watch" : "nope"]),
  );
  assert.equal(graph[2][0].axis, "interest");
  const target = { ...anime(2), communityTaste: graph[2] };
  const good = buildTaste({
    1: { anime: anime(1), action: "good" },
  }).model.score(target);
  assert.equal(
    good.enjoyment,
    buildTaste({ 1: { anime: anime(1), action: "good" } }).model.score(anime(2))
      .enjoyment,
  );
  assert.equal(good.interest, 0);
  const watch = buildTaste({
    1: { anime: anime(1), action: "watch" },
  }).model.score(target);
  assert.equal(watch.enjoyment, 0);
  assert.ok(watch.interest > 0);
  assert.deepEqual(communitySimilarities(rows(() => ["good", "good"])), {});
  assert.deepEqual(
    communitySimilarities(
      rows((u) => [u < 4 ? "good" : "bad", u < 4 ? "good" : "bad"]).slice(0, 8),
    ),
    {},
  );
});
test("support strengthens matching, opposite choices invert it, and legacy mixed vectors are ignored", () => {
  const model = buildTaste({ 1: { anime: anime(1), action: "good" } }).model;
  const score = (support, affinity, axis = "enjoyment") =>
    model.score({
      ...anime(2),
      communityTaste: [{ id: 1, support, affinity, axis }],
    }).enjoyment;
  assert.equal(score(4, 0.9), model.score(anime(2)).enjoyment);
  assert.ok(score(20, 0.65) > score(5, 0.33));
  assert.ok(score(20, -0.65) < 0);
  assert.equal(score(20, 0.65, "legacy"), model.score(anime(2)).enjoyment);
  const bad = buildTaste({ 1: { anime: anime(1), action: "bad" } }).model;
  assert.ok(
    bad.score({
      ...anime(2),
      communityTaste: [
        { id: 1, support: 20, affinity: 0.65, axis: "enjoyment" },
      ],
    }).enjoyment < 0,
  );
});
test("synopsis neighbors work without researched traits and preserve different interests", () => {
  const first = anime(
      1,
      [],
      "astronaut telescope nebula orbit expedition galaxy",
    ),
    second = anime(2, [], "bakery pastry oven flour dough village");
  const model = buildTaste({
    1: { anime: first, action: "good" },
    2: { anime: second, action: "good" },
  }).model;
  for (const source of [first, second]) {
    const a = { ...source, id: source.id + 10 };
    assert.ok(model.explain(a).neighbors.some((n) => n.id === source.id));
    assert.ok(
      model.score(a).score >
        model.score(anime(99, [], "criminal weapon robbery police")).score,
    );
  }
});
test("favorite genres stay soft throughout eligibility and upstream candidate retrieval", () => {
  const p = { favoriteGenres: ["Action"] };
  assert.ok(isEligible(anime(2, ["Drama"]), {}, [], new Set(), false, p));
  assert.equal(
    isEligible(anime(2, ["Drama"]), {}, [], new Set(), false, {
      ...p,
      restrictGenres: true,
    }),
    false,
  );
  const url = new URL(
    "https://example.test/api/catalog?preferences=" +
      encodeURIComponent(JSON.stringify(p)),
  );
  assert.equal(candidateQuery(url).q.has("genres"), false);
  const seeds = recommendationSeeds(
    Object.fromEntries(
      [
        [1, ["Action"]],
        [2, ["Action"]],
        [3, ["Drama"]],
      ].map(([id, genres]) => [
        id,
        { action: "good", anime: anime(id, genres) },
      ]),
    ),
    [],
    {},
  );
  assert.deepEqual(
    seeds.map((a) => a.id),
    [1, 3, 2],
  );
});
test("exposure outbox survives failure, deduplicates visible cards and records neutral skip/undo separately", async () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  let fail = true,
    calls = 0;
  const options = {
    storage,
    key: "profile-a",
    canSync: () => true,
    api: async () => {
      calls++;
      if (fail) throw Error("offline");
    },
  };
  let log = createRecommendationEvents(options);
  log.record(1, "impression", { surface: "discover", position: 1 });
  log.record(1, "impression", { surface: "discover", position: 1 });
  log.record(1, "skip");
  log.record(1, "undo");
  assert.equal(log.snapshot().length, 3);
  assert.equal(log.snapshot()[1].exposureId, log.snapshot()[0].eventId);
  await log.flush();
  log.dispose();
  log = createRecommendationEvents(options);
  fail = false;
  await log.flush();
  assert.equal(calls, 2);
  assert.equal(JSON.parse(values.get("profile-a")).pending.length, 0);
  log.dispose();
  const guest = createRecommendationEvents({
    ...options,
    key: "guest",
    canSync: () => false,
  });
  guest.record(1, "impression", { surface: "discover", position: 1 });
  await guest.flush();
  assert.equal(calls, 2);
  assert.equal(guest.snapshot().length, 1);
  guest.dispose();
});
test("chronological evaluation keeps enjoyment and interest separate and reports insufficient data honestly", () => {
  const reactions = Array.from({ length: 10 }, (_, i) => ({
    at: 100 + i,
    anime: anime(
      i + 1,
      [],
      i % 2 ? "crime robbery detective police" : "pastry bakery flour oven",
    ),
    action: i % 2 ? "bad" : "good",
  }));
  const result = evaluateRecommendations({
    app: "anime-shuffle-evaluation",
    users: [{ reactions }],
  });
  assert.equal(result.metrics["enjoyment:hybrid"].pairs, 1);
  assert.equal(result.metrics["enjoyment:hybrid"].pairwiseAccuracy, 1);
  assert.equal(result.metrics["interest:hybrid"].pairwiseAccuracy, null);
  const none = evaluateRecommendations({
    app: "anime-shuffle-evaluation",
    users: [],
  });
  assert.equal(none.usersWithTemporalSplit, 0);
  assert.equal(none.metrics["enjoyment:hybrid"].pairwiseAccuracy, null);
});
