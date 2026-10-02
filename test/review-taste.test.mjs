import { createAnimeStore } from "../src/lib/store.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { analyzeReviews } from "../lib/review-analysis.mjs";
import {
  createReviewEnrichment,
  reviewStore,
} from "../lib/review-enrichment.mjs";
import { communitySimilarities } from "../lib/community-taste.mjs";
import { storyAspects } from "../src/lib/story-aspects.js";
import { reviewTraits } from "../src/lib/taste-traits.js";
import {
  buildTaste,
  detailedExplanation,
  rankRecommendations,
} from "../src/lib/recommend.js";
import { createCloudApp } from "../cloudflare/app.mjs";
const row = (n, text, extra = {}) => ({
  mal_id: n,
  user: { username: "reviewer" + n },
  review: `${text} Reviewer note number ${n}.`,
  is_spoiler: false,
  is_preliminary: false,
  ...extra,
});
const sample = (text) => [1, 2, 3, 4].map((n) => row(n, text));
const anime = (id, reviewTaste, synopsis = "") => ({
  id,
  title: "Title " + id,
  synopsis,
  reviewTaste,
  genres: [],
  nsfw: "white",
  format: "unknown",
  prequels: [],
});
function database() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(query, ...args) {
        const s = db.prepare(query);
        if (s.columns().length) return s.all(...args);
        s.run(...args);
        return [];
      },
    },
  };
}
test("reviews require explicit safe flags and independent, nonduplicate support; no raw text persists", () => {
  const profile = analyzeReviews([
    ...sample("The show has fluid animation and atmospheric music."),
    ...sample("The show has stiff animation.").map((r) => ({
      ...r,
      user: { username: "spoiler" + r.mal_id },
      is_spoiler: true,
    })),
    row(9, "Expressive character animation.", { is_spoiler: undefined }),
    row(10, "Expressive character animation.", { is_preliminary: true }),
  ]);
  assert.deepEqual(profile.traits.map((t) => t.key).sort(), [
    "atmospheric-music",
    "fluid-animation",
  ]);
  assert.equal(profile.sampleSize, 4);
  assert.doesNotMatch(
    JSON.stringify(profile),
    /reviewer|Reviewer note|The show|stiff animation/,
  );
  assert.equal(
    analyzeReviews(
      sample("Fluid animation.").map((r) => ({
        ...r,
        user: { username: "same" },
      })),
    ).traits.length,
    0,
  );
  assert.equal(
    analyzeReviews(
      sample("Fluid animation.").map((r) => ({
        ...r,
        review: "The same fluid animation sentence.",
      })),
    ).traits.length,
    0,
  );
  assert.equal(
    analyzeReviews(sample("Fluid animation.").slice(0, 2)).traits.length,
    0,
  );
});
test("negation, comparisons, overt sarcasm and plot-revealing sentences do not become review traits", () => {
  for (const text of [
    "The animation is not fluid animation.",
    "Unlike Another Show this has fluid animation.",
    "Yeah right, fluid animation.",
    "The ending reveals the killer with fluid animation.",
    "I wish it had fluid animation.",
  ]) {
    assert.equal(analyzeReviews(sample(text)).traits.length, 0, text);
  }
  const profile = analyzeReviews(
    sample("The plot is not compelling, but the show has fluid animation."),
  );
  assert.ok(profile.traits.some((t) => t.key === "fluid-animation"));
});
test("conflicting descriptions remain unknown rather than cherry-picking praise", () => {
  const mixed = analyzeReviews([
    ...sample("Fluid animation."),
    ...[5, 6, 7, 8].map((n) => row(n, "Stiff animation.")),
  ]);
  assert.equal(mixed.traits.length, 0);
  const small = analyzeReviews(sample("Fluid animation.").slice(0, 3));
  const larger = analyzeReviews(sample("Fluid animation."));
  assert.ok(larger.traits[0].strength > small.traits[0].strength);
});
test("broader synopsis traits are grounded; production execution cannot come from genre, studio or synopsis", () => {
  const a = anime(
    1,
    null,
    "A competent protagonist faces strategic battles in a cyberpunk city. Philosophical questions shape this character-driven story.",
  );
  for (const key of [
    "competent-lead",
    "strategic-action",
    "cyberpunk",
    "philosophy",
    "character-focus",
  ])
    assert.ok(storyAspects(a).has(key), key);
  assert.equal(
    storyAspects(
      anime(
        2,
        null,
        "The show has fluid animation and excellent voice acting.",
      ),
    ).size,
    0,
  );
  assert.equal(
    reviewTraits({ ...a, score: 10, studios: ["Famous Studio"] }).size,
    0,
  );
});
test("review features learn opposing tastes, combine with context, and explanations cannot echo a spoiler", () => {
  const fluid = analyzeReviews(
    sample("Fluid animation and atmospheric music."),
  );
  const limited = analyzeReviews(
    sample("Limited animation and stilted dialogue."),
  );
  const liked = anime(
    1,
    fluid,
    "A competent protagonist faces strategic battles.",
  );
  const disliked = anime(
    2,
    limited,
    "A competent protagonist faces strategic battles.",
  );
  const yes = anime(
    3,
    {
      ...fluid,
      review: "SECRET ENDING: the hero dies",
      traits: [
        ...fluid.traits,
        { key: "SECRET ENDING", support: 99, strength: 1 },
      ],
    },
    liked.synopsis,
  );
  const no = anime(4, limited, liked.synopsis);
  const reactions = {
    1: { anime: liked, action: "good" },
    2: { anime: disliked, action: "bad" },
  };
  const taste = buildTaste(reactions);
  assert.ok(taste.model.score(yes).score > taste.model.score(no).score);
  assert.ok(taste.model.explain(yes).groups.review > 0);
  assert.ok(taste.model.explain(yes).groups.reviewblend > 0);
  const explanation = detailedExplanation(yes, taste);
  assert.match(explanation, /reviewers describe fluid animation/);
  assert.doesNotMatch(explanation, /SECRET|dies|hero|ending|Reviewer note/);
  const reverse = buildTaste({
    1: { anime: liked, action: "bad" },
    2: { anime: disliked, action: "good" },
  });
  assert.ok(reverse.model.score(no).score > reverse.model.score(yes).score);
  const prospective = detailedExplanation(
    yes,
    buildTaste({ 1: { anime: liked, action: "watch" } }),
  );
  assert.doesNotMatch(prospective, /You liked Title 1/);
  assert.match(prospective, /prospective|tentative/);
  assert.deepEqual(
    rankRecommendations([liked, disliked, yes], { reactions }).map(
      (p) => p.anime.id,
    ),
    [3],
  );
});
test("background enrichment is durable, deduplicated, bounded and credential-free", async () => {
  const { sql } = database();
  let now = 10000,
    calls = 0,
    alarm;
  const store = reviewStore(sql);
  const fetcher = async (url, options) => {
    calls++;
    assert.match(url, /api.jikan.moe\/v4\/anime\/1\/reviews/);
    assert.match(url, /spoilers=false&preliminary=false/);
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return Response.json({ data: sample("Fluid animation.") });
  };
  const service = createReviewEnrichment({
    store,
    now: () => now,
    schedule: (at) => {
      alarm = at;
    },
    fetcher,
  });
  service.attach(anime(1));
  service.attach(anime(1));
  assert.equal(calls, 0);
  assert.equal(store.pending(), 1);
  assert.ok(alarm >= now);
  await service.run();
  assert.equal(calls, 1);
  assert.equal(
    service.attach(anime(1)).reviewTaste.traits[0].key,
    "fluid-animation",
  );
  const restarted = createReviewEnrichment({
    store: reviewStore(sql),
    now: () => now,
    schedule: () => {},
    fetcher,
  });
  assert.equal(restarted.attach(anime(1)).reviewTaste.sampleSize, 4);
  for (let id = 2; id < 500; id++) restarted.enqueue(id);
  assert.equal(store.pending(), 300);
  await restarted.run();
  assert.equal(calls, 1, "persisted spacing survives restart");
});
test("429 cooldown, daily quota, empty samples and disabled integration cannot block MAL", async () => {
  const { sql } = database();
  const store = reviewStore(sql);
  let now = 10000,
    calls = 0;
  const service = createReviewEnrichment({
    store,
    now: () => now,
    schedule: () => {},
    dailyLimit: 2,
    fetcher: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "retry-after": "120" },
      });
    },
  });
  service.enqueue(1);
  service.enqueue(2);
  await service.run();
  assert.ok(store.state().next_at >= now + 120000);
  await service.run();
  assert.equal(calls, 1);
  now += 120000;
  await service.run();
  assert.equal(calls, 2);
  now += 120000;
  service.enqueue(3);
  await service.run();
  assert.equal(calls, 2);
  assert.ok(store.state().next_at >= 86400000);
  const disabled = createReviewEnrichment({
    store,
    schedule: () => {},
    enabled: false,
    fetcher: () => {
      throw Error("must not fetch");
    },
  });
  assert.equal(disabled.attach(anime(100)).reviewTaste, undefined);
  assert.equal(disabled.cached(1), null);
});
test("community evidence requires other accounts and variable overlapping reactions, not popularity alone", () => {
  const rows = [];
  for (let user = 0; user < 6; user++)
    for (const id of [1, 2, 3])
      rows.push({
        account_id: "private-" + user,
        anime_id: id,
        value: { action: id === 3 ? "good" : user < 3 ? "good" : "bad" },
      });
  const result = communitySimilarities(rows);
  assert.equal(result[1][0].id, 2);
  assert.equal(result[1][0].support, 6);
  assert.equal(result[3], undefined);
  assert.deepEqual(communitySimilarities(rows.slice(0, 12)), {});
  assert.doesNotMatch(JSON.stringify(result), /private-|good|bad/);
  const liked = anime(1);
  const candidate = { ...anime(2), communityTaste: result[2] };
  const taste = buildTaste({ 1: { action: "good", anime: liked } }, [], {}, [
    candidate,
  ]);
  assert.ok(
    taste.model.score(candidate).score > taste.model.score(anime(4)).score,
  );
  assert.match(
    detailedExplanation(candidate, taste),
    /other Anime Shuffle accounts/,
  );
});
test("Cloudflare serves MAL immediately and enriches via alarms without exposing review text", async () => {
  const storage = database();
  storage.setAlarm = async () => {};
  storage.getAlarm = async () => null;
  let reviewCalls = 0;
  const app = createCloudApp(
    storage,
    {
      PUBLIC_ORIGIN: "https://shuffle.example",
      TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
      MAL_CLIENT_ID: "TEST",
    },
    {
      interval: 0,
      fetcher: async (url) => {
        if (url.startsWith("https://api.jikan.moe")) {
          reviewCalls++;
          return Response.json({
            data: sample("Fluid animation. SECRET hero dies in the ending."),
          });
        }
        return Response.json({
          id: 1,
          title: "Title",
          nsfw: "white",
          genres: [],
        });
      },
    },
  );
  const request = (path) =>
    app.fetch(new Request("https://shuffle.example" + path));
  const first = await (await request("/api/anime/1")).json();
  assert.equal(first.id, 1);
  assert.equal(reviewCalls, 0);
  await app.alarm();
  assert.equal(reviewCalls, 1);
  const body = await (await request("/api/taste?ids=1")).json();
  assert.equal(body.profiles[1].traits[0].key, "fluid-animation");
  assert.doesNotMatch(
    JSON.stringify(body),
    /SECRET|hero|ending|reviewer|Reviewer note/,
  );
  assert.equal((await request("/api/taste?ids=-1")).status, 400);
  assert.equal(
    (
      await request(
        "/api/taste?ids=" + Array.from({ length: 151 }, (_, i) => i + 1),
      )
    ).status,
    400,
  );
});

test("explicit denials lower support; compact SQL action rows retain collaborative signals", () => {
  const denied = analyzeReviews([
    ...sample("Fluid animation."),
    ...[5, 6, 7, 8].map((n) => row(n, "The animation is not fluid.")),
  ]);
  assert.equal(denied.traits.length, 0);
  const rows = [];
  for (let u = 0; u < 6; u++)
    for (const id of [1, 2])
      rows.push({
        account_id: "u" + u,
        anime_id: id,
        action: u < 3 ? "good" : "bad",
      });
  assert.equal(communitySimilarities(rows)[1][0].support, 6);
});

test("fresh review snapshots affect manual refresh, while revisiting a loaded batch does not fetch or replace it", async () => {
  const good = analyzeReviews(sample("Fluid animation."));
  const bad = analyzeReviews(sample("Limited animation."));
  const seed = anime(100, good);
  const pool = [anime(1), anime(2)];
  const values = new Map();
  let swapped = false,
    reads = 0;
  const store = createAnimeStore({
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    request: async (url) => {
      if (url === "/api/session")
        return Response.json({
          configured: true,
          connected: false,
          csrf: "fixture",
        });
      if (url.startsWith("/api/catalog"))
        return Response.json({ data: pool, nextOffset: null });
      if (url.startsWith("/api/taste")) {
        reads++;
        return Response.json({
          profiles: {
            100: good,
            1: swapped ? bad : good,
            2: swapped ? good : bad,
          },
          community: {},
        });
      }
      if (url.startsWith("/api/anime/"))
        return Response.json(
          Number(url.split("/").pop()) === 100
            ? seed
            : pool.find((a) => a.id === Number(url.split("/").pop())),
        );
      throw Error(url);
    },
  });
  await store.initialize();
  await store.savePreferences({ favoriteAnime: [seed] });
  await store.loadRecommendations();
  const picks = store.getSnapshot().recommendationPicks;
  assert.equal(picks[0].anime.id, 1);
  const count = reads;
  swapped = true;
  await store.loadRecommendations();
  assert.equal(store.getSnapshot().recommendationPicks, picks);
  assert.equal(reads, count);
  await store.loadRecommendations({ force: true });
  assert.equal(store.getSnapshot().recommendationPicks[0].anime.id, 2);
  assert.equal(reads, count + 1);
});

test("optional review storage failures leave catalog objects usable", async () => {
  const fail = () => {
    throw Error("storage unavailable");
  };
  const service = createReviewEnrichment({
    store: { get: fail, enqueue: fail, state: fail, pending: fail },
    schedule: fail,
  });
  const original = anime(1);
  assert.equal(service.attach(original), original);
  await assert.doesNotReject(service.run());
});

test("Cloudflare returns aggregate item connections from compact SQL rows without account details", async () => {
  const storage = database();
  const app = createCloudApp(storage, {
    PUBLIC_ORIGIN: "https://shuffle.example",
    TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    JIKAN_REVIEWS: "false",
  });
  for (let u = 0; u < 6; u++)
    for (const id of [1, 2])
      storage.sql.exec(
        "INSERT INTO reactions VALUES (?,?,?)",
        "private-account-" + u,
        id,
        JSON.stringify({
          action: u < 3 ? "good" : "bad",
          anime: { id, title: "private metadata" },
        }),
      );
  const response = await app.fetch(
    new Request("https://shuffle.example/api/taste?ids=1,2"),
  );
  const data = await response.json();
  assert.equal(data.community[1][0].id, 2);
  assert.equal(data.community[1][0].support, 6);
  assert.doesNotMatch(
    JSON.stringify(data),
    /private-account|private metadata|good|bad/,
  );
});
