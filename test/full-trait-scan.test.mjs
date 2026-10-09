import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createCatalogAnalyzer,
  createCatalogModel,
} from "../lib/catalog-model.mjs";
import {
  createResearchStore,
  researchVocabulary,
} from "../lib/research-profiles.mjs";
import {
  analysisVocabularyPass,
  ANALYSIS_TRAITS_PER_PASS,
} from "../lib/trait-selection.mjs";
import {
  EXTENDED_RESEARCH_TRAITS,
  TRAIT_FAMILIES,
} from "../src/lib/extended-research-traits.js";
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
const anime = {
  id: 123,
  title: "Exact test adaptation",
  synopsis: "Students attend a boarding school with communal living.",
  status: "finished_airing",
  episodes: 12,
  format: "tv",
};
function offeredKeys(request) {
  return request.messages[0].content
    .split("Vocabulary: ")[1]
    .split("; ")
    .map((entry) => entry.split(":")[0]);
}
test("the exported catalog is exactly 3000 unique keys; all old 2400 keys are stable and additions are distinct", () => {
  const exported = JSON.parse(
    readFileSync(
      new URL("../data/anime-trait-catalog-3000.json", import.meta.url),
    ),
  );
  assert.equal(exported.traits.length, 3000);
  assert.equal(exported.totalAcceptedTraitCount, 3188);
  assert.deepEqual(
    exported.traits.map((t) => t.key),
    EXTENDED_RESEARCH_TRAITS.map((t) => t.key),
  );
  assert.equal(
    new Set(exported.traits.slice(2400).map((t) => t.label.toLowerCase())).size,
    600,
  );
  assert.equal(TRAIT_FAMILIES.length, 150);
  assert.equal(EXTENDED_RESEARCH_TRAITS.slice(2400).length, 600);
  assert.ok(
    EXTENDED_RESEARCH_TRAITS.slice(2400).every(
      (t) =>
        t.trackingEnabled &&
        t.definition.includes("adaptation-specific evidence"),
    ),
  );
});
test("every original and detailed key is checked once across durable passes; restart and quota failure never skip or repeat a successful pass", async () => {
  const s = storage(),
    research = createResearchStore(s);
  let clock = Date.now(),
    failOnce = false,
    requests = [],
    failedKeys;
  const analyzer = createCatalogAnalyzer({
    async run(_model, request) {
      const keys = offeredKeys(request);
      assert.ok(keys.length <= ANALYSIS_TRAITS_PER_PASS);
      if (failOnce) {
        failOnce = false;
        failedKeys = keys;
        throw Error("3036 daily free allocation exceeded");
      }
      requests.push(keys);
      return {
        response: { checkedKeys: keys, observations: [], dimensions: [] },
      };
    },
  });
  const args = {
    storage: s,
    research,
    analyzer,
    now: () => clock,
    fetcher: async () => Response.json({ data: [] }),
    schedule: async () => {},
  };
  let model = createCatalogModel(args);
  model.enqueue(anime);
  await model.run();
  assert.equal(model.diagnostics().queued, 1);
  assert.equal(
    research.exportBatch({ kind: "catalog" }).assessmentProgress[123].checked,
    32,
  );
  // No profile was fabricated just to record assessment progress.
  assert.equal(research.exportBatch({ kind: "automatic" }).profiles.length, 0);
  model = createCatalogModel(args);
  failOnce = true;
  clock += 11000;
  await model.run();
  assert.equal(model.diagnostics().reason, "daily_allowance_exhausted");
  assert.equal(model.diagnostics().checkedTraits, 32);
  clock = model.diagnostics().pauseUntil + 1;
  model = createCatalogModel(args);
  await model.run();
  assert.deepEqual(requests[1], failedKeys);
  for (let i = 0; i < 110 && model.diagnostics().queued; i++) {
    clock += 11000;
    await model.run();
  }
  assert.equal(model.diagnostics().queued, 0);
  assert.equal(model.diagnostics().completedTraitScans, 1);
  assert.deepEqual(
    requests.flat(),
    researchVocabulary.map((t) => t.key),
  );
  const progress = research.exportBatch({ kind: "catalog" })
    .assessmentProgress[123];
  assert.equal(progress.checked, 3188);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.complete, true);
  const count = requests.length;
  model = createCatalogModel(args);
  model.enqueue(anime);
  clock += 11000;
  await model.run();
  assert.equal(
    requests.length,
    count,
    "completed unchanged evidence reuses the checkpoint",
  );
  model.enqueue({
    ...anime,
    synopsis: "The boarding school has changed its educational arrangements.",
  });
  clock += 11000;
  await model.run();
  assert.equal(
    model.diagnostics().checkedTraits,
    32,
    "changed evidence starts a new scan",
  );
  assert.equal(model.diagnostics().completedTraitScans, 0);
  s.db.close();
});
test("missing, duplicated or incomplete checked-key acknowledgements cannot advance the cursor", async () => {
  for (const mode of ["missing", "duplicate", "partial"]) {
    const s = storage(),
      research = createResearchStore(s);
    const analyzer = createCatalogAnalyzer({
      async run(_m, request) {
        const keys = offeredKeys(request);
        return {
          response: {
            observations: [],
            checkedKeys:
              mode === "missing"
                ? undefined
                : mode === "partial"
                  ? keys.slice(1)
                  : keys.map((k, i) => (i === 1 ? keys[0] : k)),
          },
        };
      },
    });
    const m = createCatalogModel({
      storage: s,
      research,
      analyzer,
      fetcher: async () => Response.json({ data: [] }),
      schedule: async () => {},
    });
    m.enqueue(anime);
    await m.run();
    assert.equal(m.diagnostics().checkedTraits, 0);
    assert.equal(m.diagnostics().queued, 1);
    assert.equal(
      s.db.prepare("SELECT COUNT(*) n FROM model_catalog_profiles").get().n,
      0,
    );
    s.db.close();
  }
});
test("new traits are offered and validated on late passes, with spoiler review and source requirements intact", async () => {
  const target = EXTENDED_RESEARCH_TRAITS[2400];
  const index = researchVocabulary.findIndex((t) => t.key === target.key);
  const pass = analysisVocabularyPass(
    researchVocabulary,
    Math.floor(index / 32) * 32,
  );
  const analyzer = createCatalogAnalyzer({
    async run(_m, request) {
      const keys = offeredKeys(request);
      assert.ok(keys.includes(target.key));
      return {
        response: {
          checkedKeys: keys,
          observations: [
            {
              key: target.key,
              score: 0.8,
              confidence: 0.8,
              prominence: "central",
              basis: "premise",
              containsSpoilers: false,
              evidence: [0],
            },
          ],
        },
      };
    },
  });
  const result = await analyzer(anime, [], null, [], pass);
  assert.equal(result.profile.observations[0].key, target.key);
  assert.equal(result.scanProgress.checked, 32);
  assert.equal(result.profile.observations[0].containsSpoilers, false);
});
