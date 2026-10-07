import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { analyzeReviews } from "../lib/review-analysis.mjs";
import { createModelAnalyzer } from "../lib/model-taste.mjs";
import { createEpisodeEnrichment } from "../lib/episode-enrichment.mjs";
import {
  createReviewEnrichment,
  reviewStore,
} from "../lib/review-enrichment.mjs";
import { nuancedTraits, NUANCES } from "../src/lib/nuanced-taste.js";
import { buildTaste, detailedExplanation } from "../src/lib/recommend.js";
import {
  attributedFeatures,
  normalizeReactionReason,
} from "../src/lib/reaction-reasons.js";
const sample = (text) =>
  [0, 1, 2, 3].map((i) => ({
    user: { username: "reader" + i },
    review: text + ` Personal note ${i}.`,
    is_spoiler: false,
    is_preliminary: false,
  }));
test("liking an anime with no filler does not create filler affinity or a filler comparison", () => {
  const liked = anime(9253, "A science fiction mystery", ["Sci-Fi"]);
  const candidate = anime(99991, "A sports competition", ["Sports"]);
  const coverage = { complete: true, total: 24, filler: 0, recap: 0 };
  const without = buildTaste(
    { [liked.id]: { anime: liked, action: "good", at: 1 } },
    [],
  );
  const withCoverage = buildTaste(
    {
      [liked.id]: {
        anime: { ...liked, episodeTaste: coverage },
        action: "good",
        at: 1,
      },
    },
    [],
  );
  assert.deepEqual(
    withCoverage.model.score({ ...candidate, episodeTaste: coverage }),
    without.model.score(candidate),
  );
  assert.doesNotMatch(
    detailedExplanation({ ...candidate, episodeTaste: coverage }, withCoverage),
    /filler|recap/i,
  );
  assert.ok(
    ![...nuancedTraits({ ...candidate, episodeTaste: coverage }).keys()].some(
      (k) => k.startsWith("filler-"),
    ),
  );
});
const anime = (id, synopsis = "", genres = [], reviews = []) => ({
  id,
  title: "Example " + id,
  synopsis,
  genres,
  format: "tv",
  episodes: 12,
  reviewTaste: analyzeReviews(reviews),
});
function db() {
  const database = new DatabaseSync(":memory:");
  return {
    exec(q, ...args) {
      const s = database.prepare(q);
      if (s.columns().length) return s.all(...args);
      s.run(...args);
      return [];
    },
  };
}
test("subtypes distinguish premise, prominence and production quality", () => {
  const n = nuancedTraits(
    anime(1, "She is reincarnated into another world, inside an otome game.", [
      "Reincarnation",
      "Love Polygon",
    ]),
  );
  assert.ok(n.has("isekai-reincarnation"));
  assert.ok(n.has("isekai-otome"));
  assert.ok(n.has("love-polygon"));
  assert.equal(n.has("isekai-transport"), false);
  assert.equal(n.has("villain-design"), false);
  assert.equal(
    nuancedTraits(
      anime(2, "The villains have striking character designs."),
    ).has("villain-design"),
    false,
    "synopsis is not art-quality evidence",
  );
  const outcast = nuancedTraits(
    anime(
      3,
      "An outcast with no magic strives to rise against the school hierarchy.",
    ),
  );
  assert.ok(outcast.has("outcast-ascent"));
});
test("independent reviews support incidental mechs, subplot romance and visual appeal", () => {
  const text =
    "The mechs are incidental and not the focus. Romance is a subplot. The villains have striking character designs. The fights are fluid and readable.";
  const p = analyzeReviews(sample(text));
  const keys = nuancedTraits({ ...anime(4), reviewTaste: p });
  for (const k of [
    "mecha-incidental",
    "romance-subplot",
    "villain-design",
    "fluid-combat",
  ])
    assert.ok(keys.has(k), k);
  assert.ok(!keys.has("mecha-central"));
  assert.doesNotMatch(JSON.stringify(p), /reader\d|Personal note/);
  assert.equal(
    nuancedTraits(
      anime(
        5,
        "",
        [],
        sample(text).map((r) => ({ ...r, is_spoiler: true })),
      ),
    ).size,
    0,
  );
});
test("negation, comparative claims and disagreements do not turn into facts", () => {
  for (const text of [
    "The fights are not fluid or readable.",
    "Unlike another show, the fights are fluid.",
    "The finale reveals why the fights are fluid.",
  ])
    assert.equal(
      nuancedTraits(anime(1, "", [], sample(text))).has("fluid-combat"),
      false,
      text,
    );
  const mixed = [
    ...sample("The fights are fluid and readable."),
    ...sample("The fights are not fluid or readable.").map((r) => ({
      ...r,
      user: { username: r.user.username + "x" },
    })),
  ];
  const profile = analyzeReviews(mixed);
  const evidence = profile.nuance.observations.find(
    (o) => o.key === "fluid-combat",
  );
  assert.equal(evidence.support, 4);
  assert.equal(evidence.denied, 4);
  assert.equal(
    nuancedTraits({ ...anime(1), reviewTaste: profile }).has("fluid-combat"),
    false,
  );
  assert.equal(
    nuancedTraits(
      anime(
        2,
        "",
        [],
        sample("Romance is the main focus. Romance is a subplot."),
      ),
    ).has("romance-central"),
    false,
  );
});
test("conditional tastes prefer matching context while prospective saves are not claimed as likes", () => {
  const liked = anime(
    1,
    "Political intrigue shapes the kingdom.",
    "Drama".split(","),
    sample(
      "The mechs are incidental and not the focus. The fights are fluid and readable.",
    ),
  );
  const bad = anime(
    2,
    "The story focuses on mechs.",
    ["Action"],
    sample("The story focuses on mechs. The action is static action."),
  );
  const goodCandidate = { ...liked, id: 3, title: "Candidate" };
  const badCandidate = { ...bad, id: 4 };
  const taste = buildTaste({
    1: { action: "good", anime: liked },
    2: { action: "bad", anime: bad },
  });
  assert.ok(
    taste.model.score(goodCandidate).score >
      taste.model.score(badCandidate).score,
  );
  const why = detailedExplanation(goodCandidate, taste);
  assert.match(why, /supporting role|fluid, readable/);
  assert.ok(
    taste.model
      .explain(goodCandidate)
      .contributions.some(
        (c) => c.key.startsWith("nuance:") && c.contribution > 0,
      ),
  );
  const prospective = detailedExplanation(
    goodCandidate,
    buildTaste({ 1: { action: "watch", anime: liked } }),
  );
  assert.match(prospective, /future watch|interested/);
  assert.doesNotMatch(prospective, /You liked Example 1/);
});
test("multi-interest matching keeps distinct interests and reacts to negative evidence", () => {
  const magic = anime(1, "A powerless outcast rises in a magic academy.", [
    "Fantasy",
  ]);
  const comfort = anime(
    2,
    "A gentle everyday story with low-stakes adventures and deadpan humor.",
    ["Slice of Life"],
  );
  const m = { ...magic, id: 3 },
    c = { ...comfort, id: 4 };
  const taste = buildTaste({
    1: { anime: magic, action: "good" },
    2: { anime: comfort, action: "good" },
  });
  assert.ok(taste.model.score(m).score > 0);
  assert.ok(taste.model.score(c).score > 0);
  assert.ok(taste.model.explain(m).neighbors.some((n) => n.id === 1));
  assert.ok(taste.model.explain(c).neighbors.some((n) => n.id === 2));
});
test("reason attribution reduces unrelated training evidence without inventing features", () => {
  assert.equal(normalizeReactionReason("arbitrary prompt"), null);
  const f = [
    ["nuance:mecha-central", 1],
    ["genre:Fantasy", 1],
  ];
  const trained = attributedFeatures(f, "mecha");
  assert.ok(trained[0][1] > trained[1][1]);
  assert.deepEqual(attributedFeatures(f, "music"), f);
});
test("model output requires known keys and three valid independent evidence references", async () => {
  let input;
  const classify = createModelAnalyzer({
    run: async (model, body) => {
      input = body;
      return {
        response: {
          observations: [
            {
              key: "villain-design",
              evidence: [0, 1, 2].map((author) => ({ author, sentence: 0 })),
            },
            {
              key: "unknown-trait",
              evidence: [0, 1, 2].map((author) => ({ author, sentence: 0 })),
            },
            {
              key: "fluid-combat",
              evidence: [
                { author: 0, sentence: 0 },
                { author: 0, sentence: 0 },
                { author: 99, sentence: 0 },
              ],
            },
          ],
        },
      };
    },
  });
  const result = await classify(
    sample("The villains have striking character designs."),
  );
  assert.deepEqual(
    result.observations.map((o) => o.key),
    ["villain-design"],
  );
  assert.doesNotMatch(JSON.stringify(input), /reader0/);
  assert.match(input.messages[0].content, /untrusted DATA/);
  assert.equal(result.observations[0].support, 3);
  assert.ok(NUANCES.length >= 50);
});
test("model failures preserve rule profiles and persistent daily budgets", async () => {
  const store = reviewStore(db());
  let time = 10000,
    calls = 0;
  const service = createReviewEnrichment({
    store,
    now: () => time,
    schedule: () => {},
    modelDailyLimit: 1,
    fetcher: async () =>
      Response.json({ data: sample("The fights are fluid and readable.") }),
    modelAnalyzer: async () => {
      calls++;
      throw Error("failed");
    },
  });
  service.enqueue(1);
  await service.run();
  assert.equal(service.cached(1).status, "ready");
  assert.ok(service.cached(1).nuance.observations.length);
  time += 2000;
  service.enqueue(2);
  await service.run();
  assert.equal(calls, 1);
  assert.equal(service.diagnostics().modelRequestsToday, 1);
  assert.equal(
    service.diagnostics().lastModelFailure.code,
    "model_unavailable_or_invalid",
  );
});
test("older cached profiles are served during a queued schema upgrade", async () => {
  const store = reviewStore(db());
  store.put(
    1,
    { version: 2, traits: [], sampleSize: 0, status: "empty" },
    100000,
  );
  const service = createReviewEnrichment({
    store,
    now: () => 10000,
    schedule: () => {},
    fetcher: async () =>
      Response.json({ data: sample("Romance is a subplot.") }),
  });
  assert.ok(service.attach(anime(1)).reviewTaste);
  assert.equal(store.pending(), 1);
  await service.run();
  assert.equal(service.cached(1).nuance.version, 1);
});
test("episode aggregation is paged, restartable, bounded and spoiler-free", async () => {
  const sql = db();
  let time = 10000,
    calls = 0;
  const options = {
    sql,
    now: () => time,
    schedule: () => {},
    fetcher: async () => {
      calls++;
      return Response.json({
        data: [
          {
            mal_id: calls,
            title: "SECRET PLOT",
            filler: calls === 1,
            recap: calls === 2,
          },
        ],
        pagination: { has_next_page: calls === 1 },
      });
    },
  };
  const first = createEpisodeEnrichment(options);
  first.attach(anime(1));
  await first.run();
  assert.equal(first.cached(1).complete, false);
  assert.equal(
    nuancedTraits({ ...anime(2), episodeTaste: first.cached(1) }).has(
      "filler-frequent",
    ),
    false,
  );
  time += 5000;
  const restarted = createEpisodeEnrichment(options);
  await restarted.run();
  const p = restarted.cached(1);
  assert.equal(p.total, 2);
  assert.equal(p.filler, 1);
  assert.equal(p.recap, 1);
  assert.equal(p.complete, true);
  assert.doesNotMatch(JSON.stringify(p), /SECRET/);
  assert.equal(
    nuancedTraits({ ...anime(2), episodeTaste: p }).has("filler-frequent"),
    false,
  );
  restarted.attach(anime(1));
  await restarted.run();
  assert.equal(calls, 2);
});
test("daily episode exhaustion schedules tomorrow instead of an alarm loop", async () => {
  let time = 10000,
    alarm;
  const service = createEpisodeEnrichment({
    sql: db(),
    dailyLimit: 1,
    now: () => time,
    schedule: (at) => {
      alarm = at;
    },
    fetcher: async () =>
      Response.json({
        data: [{ mal_id: 1, filler: false, recap: false }],
        pagination: { has_next_page: true },
      }),
  });
  service.attach(anime(1));
  await service.run();
  assert.ok(alarm >= 86400000);
  await service.run();
  assert.ok(alarm >= 86400000);
});

test("a reaction reason persists for a guest and does not break per-card Undo", async () => {
  const { createAnimeStore } = await import("../src/lib/store.js");
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  const options = {
    storage,
    staticMode: true,
    request: async () => Response.json({ configured: false, connected: false }),
  };
  const store = createAnimeStore(options);
  await store.initialize();
  await store.savePreferences({});
  const id = store.getSnapshot().current.id;
  await store.react("good");
  await store.setReactionReason(id, "characters");
  assert.equal(store.getSnapshot().reactions[id].reason, "characters");
  const restored = createAnimeStore(options);
  await restored.initialize();
  assert.equal(restored.getSnapshot().reactions[id].reason, "characters");
  await store.undo();
  assert.equal(store.getSnapshot().reactions[id], undefined);
});
