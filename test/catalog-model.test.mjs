import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createResearchStore } from "../lib/research-profiles.mjs";
import {
  createCatalogModel,
  createCatalogAnalyzer,
  modelFailure,
} from "../lib/catalog-model.mjs";
const DAY = 86400000;
function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(q, ...args) {
        const s = db.prepare(q);
        if (s.columns().length) return s.all(...args);
        s.run(...args);
        return [];
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const anime = (id = 123) => ({
  id,
  title: "Public anime",
  synopsis: "A pilot fights in a giant robot during a political rebellion.",
  status: "finished_airing",
  episodes: 12,
  format: "tv",
  listStatus: { score: 9 },
  account: "private",
});
const ai = {
  async run(model, input) {
    const evidence = JSON.parse(
      input.messages.find((m) => m.role === "user").content,
    );
    assert.equal(evidence.account, undefined);
    assert.equal(evidence.listStatus, undefined);
    return {
      response: {
        observations: [
          {
            key: "mecha-central",
            score: 0.9,
            confidence: 0.9,
            prominence: "central",
            basis: "premise",
            evidence: [0],
          },
        ],
      },
      usage: { prompt_tokens: 700, completion_tokens: 80 },
    };
  },
};
const empty = async () => Response.json({ data: [] });

test("model pipeline retains jobs through daily quota, resumes after restart, and persists profiles without reanalysis", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    calls = 0,
    failure = true;
  const real = createCatalogAnalyzer(ai);
  const analyzer = async (...args) => {
    calls++;
    if (failure)
      throw Error(
        "3036: You have used up your daily free allocation of 10,000 neurons",
      );
    return real(...args);
  };
  const args = {
    storage: s,
    research,
    analyzer,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
  };
  let model = createCatalogModel(args);
  model.enqueue(anime());
  await model.run();
  assert.equal(model.diagnostics().reason, "daily_allowance_exhausted");
  assert.equal(model.diagnostics().queued, 1);
  model = createCatalogModel(args);
  await model.run();
  assert.equal(calls, 1);
  clock = model.diagnostics().pauseUntil + 1;
  failure = false;
  await model.run();
  assert.equal(calls, 2);
  assert.equal(model.diagnostics().profiles, 1);
  assert.equal(model.diagnostics().inputTokensToday, 700);
  assert.equal(research.projection(123).observations[0].key, "mecha-central");
  clock += 40 * DAY;
  model = createCatalogModel(args);
  model.enqueue(anime());
  await model.run();
  assert.equal(
    calls,
    2,
    "unchanged finished anime are not reanalyzed on a timer",
  );
  const exported = research.exportBatch({ kind: "automatic" });
  assert.equal(exported.profiles.length, 1);
  assert.ok(!JSON.stringify(exported).includes('"private"'));
  assert.equal(model.diagnostics().dailyLimit, null);
  s.db.close();
});

test("a rate limit is temporary; app supports more than 20 requests and preserves optional daily limits", async () => {
  assert.equal(
    modelFailure(Error("4006: Service temporarily at capacity"), 0).retryAt,
    300000,
  );
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    calls = 0;
  const m = createCatalogModel({
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
    analyzer: async () => {
      calls++;
      return { profile: null, usage: {} };
    },
  });
  for (let id = 1; id <= 22; id++) m.enqueue(anime(id));
  for (let i = 0; i < 22; i++) {
    await m.run();
    clock += 11000;
  }
  assert.equal(calls, 22);
  assert.equal(m.diagnostics().queued, 0);
  const capped = createCatalogModel({
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
    dailyLimit: 22,
    analyzer: async () => {
      throw Error("must not call");
    },
  });
  capped.enqueue(anime(24));
  await capped.run();
  assert.equal(capped.diagnostics().reason, "configured_daily_limit");
  assert.equal(capped.diagnostics().queued, 1);
  s.db.close();
});

test("changed metadata refreshes model work, empty evidence stays unknown, critical quality is not inferred from premise", async () => {
  const bad = createCatalogAnalyzer({
    run: async () => ({
      response: {
        observations: [
          {
            key: "animation-execution",
            score: 1,
            confidence: 1,
            basis: "premise",
            prominence: "central",
            evidence: [0],
          },
          {
            key: "mecha-central",
            score: 1,
            confidence: 1,
            basis: "premise",
            prominence: "central",
            evidence: [777],
          },
        ],
      },
    }),
  });
  assert.equal((await bad(anime(), [], "a".repeat(64))).profile, null);
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    calls = 0;
  const real = createCatalogAnalyzer(ai);
  const m = createCatalogModel({
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
    analyzer: async (...args) => {
      calls++;
      return real(...args);
    },
  });
  m.enqueue(anime());
  await m.run();
  clock += 11000;
  m.enqueue({
    ...anime(),
    synopsis: "A pilot commands an army of giant robots.",
  });
  await m.run();
  assert.equal(calls, 2);
  assert.equal(m.diagnostics().profiles, 1);
  // A failing refresh preserves the accepted profile and queues another attempt.
  clock += 11000;
  const failing = createCatalogModel({
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
    analyzer: async () => {
      throw Error("capacity");
    },
  });
  failing.enqueue({ ...anime(), synopsis: "A new public premise." });
  await failing.run();
  assert.equal(failing.diagnostics().profiles, 1);
  assert.equal(failing.diagnostics().queued, 1);
  s.db.close();
});

test("missing review source is retried without discarding premise analysis or repeating unchanged model input", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    networkOk = false,
    calls = 0;
  const real = createCatalogAnalyzer(ai);
  const m = createCatalogModel({
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: async () =>
      networkOk
        ? Response.json({ data: [] })
        : new Response("", { status: 503 }),
    analyzer: async (...args) => {
      calls++;
      return real(...args);
    },
  });
  m.enqueue(anime());
  await m.run();
  assert.equal(m.diagnostics().queued, 1);
  assert.equal(m.diagnostics().profiles, 1);
  clock += DAY + 1;
  networkOk = true;
  await m.run();
  assert.equal(m.diagnostics().queued, 0);
  assert.equal(calls, 1);
  s.db.close();
});

test("catalog crawl starts with popular titles, persists cursor, and prioritizes encountered history", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    processed = [],
    offsets = [];
  const args = {
    storage: s,
    research,
    schedule: async () => {},
    now: () => clock,
    fetcher: empty,
    discover: async (offset) => {
      offsets.push(offset);
      return { data: [anime(1), anime(2)], nextOffset: 50 };
    },
    analyzer: async (a) => {
      processed.push(a.id);
      return { profile: null, usage: {} };
    },
  };
  let m = createCatalogModel(args);
  m.enqueue(anime(999), 3);
  await m.run();
  assert.deepEqual(processed, [999]);
  assert.deepEqual(offsets, [0]);
  clock += 6 * 3600000 + 1;
  m = createCatalogModel(args);
  await m.run();
  assert.deepEqual(offsets, [0, 50]);
  s.db.close();
});

test("expanded analysis retains reusable dimensions and explicit partial coverage; execution cannot come from premise", async () => {
  let input;
  const analyzer = createCatalogAnalyzer({
    async run(model, request) {
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fp8-fast");
      input = request;
      return {
        response: {
          observations: [
            {
              key: "mecha-central",
              score: 0.8,
              confidence: 0.8,
              prominence: "central",
              basis: "premise",
              evidence: [0],
            },
          ],
          dimensions: [
            {
              key: "military-machines",
              area: "conflict",
              description:
                "Piloted machines take part in the military rebellion described in the premise.",
              basis: "premise",
              confidence: 0.9,
              evidence: [0],
            },
            {
              key: "beautiful-motion",
              area: "presentation",
              description: "The animation is beautiful.",
              basis: "premise",
              confidence: 0.9,
              evidence: [0],
            },
            {
              key: "unbacked-motive",
              area: "characters",
              description: "An invented motive.",
              basis: "premise",
              confidence: 0.9,
              evidence: [999],
            },
          ],
        },
        usage: { prompt_tokens: 800, completion_tokens: 200 },
      };
    },
  });
  const result = await analyzer(anime(), [], "a".repeat(64));
  assert.equal(input.max_tokens, 3600);
  assert.equal(result.profile.dimensions.length, 1);
  assert.equal(result.profile.dimensions[0].key, "military-machines");
  assert.equal(
    result.profile.coverage.find((c) => c.area === "conflict").state,
    "partial",
  );
  assert.equal(
    result.profile.coverage.find((c) => c.area === "music").state,
    "insufficient-evidence",
  );
  const s = storage(),
    research = createResearchStore(s);
  const m = createCatalogModel({
    storage: s,
    research,
    analyzer,
    schedule: async () => {},
    fetcher: empty,
  });
  m.enqueue(anime());
  await m.run();
  assert.equal(
    research.exportBatch({ kind: "automatic" }).profiles[0].dimensions.length,
    1,
  );
  s.db.close();
});

test("private spoiler evidence can inform stored dimensions but never public trait projections", async () => {
  const spoiler =
    "In the finale, the relationship changes after a betrayal and the characters finally choose to stay together.";
  const rows = Array.from({ length: 3 }, (_, i) => ({
    review: spoiler + " Perspective " + i + ".",
    is_spoiler: true,
    is_preliminary: false,
    user: { username: "Reviewer" + i },
  }));
  const analyzer = createCatalogAnalyzer({
    async run(_model, request) {
      const evidence = JSON.parse(request.messages[1].content);
      const refs = evidence.sentences
        .filter((s) => s.source === "review" && s.text.includes("finale"))
        .map((s) => s.id);
      assert.equal(refs.length, 3);
      assert.ok(
        evidence.sentences
          .filter((s) => s.source === "review")
          .every((s) => s.containsSpoilers),
      );
      assert.ok(!JSON.stringify(evidence).includes("Reviewer"));
      return {
        response: {
          observations: [
            {
              key: "romance-progress",
              score: 0.8,
              confidence: 0.8,
              prominence: "central",
              basis: "critical",
              evidence: refs,
            },
          ],
          dimensions: [
            {
              key: "romantic-resolution",
              area: "relationships",
              description:
                "SPOILER_PRIVATE_BETRAYAL changes the final relationship outcome.",
              basis: "critical",
              confidence: 0.8,
              evidence: refs,
            },
          ],
        },
      };
    },
  });
  const result = await analyzer(anime(), rows, "a".repeat(64));
  assert.equal(result.profile.spoilersAllowed, true);
  assert.equal(result.profile.dimensions[0].containsSpoilers, true);
  const s = storage(),
    research = createResearchStore(s),
    preview = research.preview({
      format: "anime-shuffle-research",
      schemaVersion: 1,
      profiles: [result.profile],
    });
  research.commit(preview.bundle, preview.revision, preview.digest, "owner");
  assert.ok(
    !JSON.stringify(research.attach(anime())).includes(
      "SPOILER_PRIVATE_BETRAYAL",
    ),
  );
  s.db.close();
});

test("new research questions queue another version and reach the model instead of fabricating coverage", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    calls = 0,
    received;
  const m = createCatalogModel({
    storage: s,
    research,
    fetcher: empty,
    schedule: async () => {},
    now: () => clock,
    analyzer: async (_a, _r, _fp, requirements) => {
      calls++;
      received = requirements;
      return { profile: null, usage: {} };
    },
  });
  m.enqueue(anime());
  await m.run();
  assert.equal(calls, 1);
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(JSON.stringify([])).digest("hex");
  research.saveRequirements(
    {
      expectedDigest: digest,
      requirements: [
        {
          key: "villain-incentive",
          label: "What drives the villain?",
          area: "characters",
          dimensionKey: "villain-incentive",
        },
      ],
    },
    "owner",
  );
  m.refill();
  clock += 11000;
  await m.run();
  assert.equal(calls, 2);
  assert.equal(received[0].dimensionKey, "villain-incentive");
  assert.equal(
    research.auditCoverage().titles[0].requirements[0].state,
    "missing",
  );
  s.db.close();
});

test("a research-question change during inference cannot mark the old pass as the new version", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    release,
    entered;
  const started = new Promise((resolve) => (entered = resolve));
  let calls = 0;
  const m = createCatalogModel({
    storage: s,
    research,
    fetcher: empty,
    schedule: async () => {},
    now: () => clock,
    analyzer: async () => {
      calls++;
      if (calls === 1) {
        entered();
        await new Promise((resolve) => (release = resolve));
      }
      return { profile: null, usage: {} };
    },
  });
  m.enqueue(anime());
  const pending = m.run();
  await started;
  const { createHash } = await import("node:crypto");
  research.saveRequirements(
    {
      expectedDigest: createHash("sha256").update("[]").digest("hex"),
      requirements: [
        {
          key: "power-cost",
          label: "What does power cost?",
          area: "powers",
          dimensionKey: "power-cost",
        },
      ],
    },
    "owner",
  );
  m.refill();
  release();
  await pending;
  assert.equal(m.diagnostics().queued, 1);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) n FROM model_catalog_profiles").get().n,
    0,
  );
  clock += 11000;
  await m.run();
  assert.equal(calls, 2);
  s.db.close();
});
