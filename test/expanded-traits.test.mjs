import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { RESEARCH_SEED } from "../data/research-seed.mjs";
import {
  researchVocabulary,
  createResearchStore,
  validateResearchBundle,
} from "../lib/research-profiles.mjs";
import {
  EXTENDED_RESEARCH_TRAITS as traits,
  TRAIT_FAMILIES,
  traitTrackingState,
} from "../src/lib/extended-research-traits.js";
import { nuancedFeatures, nuancedTraits } from "../src/lib/nuanced-taste.js";
import {
  buildTaste,
  scoreAnime,
  detailedExplanationReasons,
} from "../src/lib/recommend.js";
import { selectAnalysisVocabulary } from "../lib/trait-selection.mjs";
import {
  createCatalogAnalyzer,
  createCatalogModel,
} from "../lib/catalog-model.mjs";
import { researchImpact } from "../src/lib/research-impact.js";
import { attributedFeatures } from "../src/lib/reaction-reasons.js";

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
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const anime = {
  id: 16498,
  title: "Synthetic exact-entry fixture",
  synopsis: "A group builds a new community.",
  genres: [],
  status: "finished_airing",
  episodes: 12,
  format: "tv",
};
const observation = (trait) => ({
  key: trait.key,
  score: 0.9,
  confidence: 0.9,
  prominence: "central",
  basis: "critical",
  containsSpoilers: false,
  sources: ["source0", "source1", "source2"],
  evidence: "Synthetic test evidence; not an anime assertion.",
});
function bundle(selected = traits) {
  const p = structuredClone(RESEARCH_SEED.profiles[0]);
  Object.assign(p, {
    metadataFingerprint: null,
    sources: [0, 1, 2].map((n) => ({
      id: `source${n}`,
      type: "editorial",
      url: `https://source${n}.example/review`,
      title: "Fixture",
      accessedAt: new Date().toISOString(),
      independenceKey: `publisher${n}`,
    })),
    observations: selected.map(observation),
    dimensions: [],
    coverage: [],
  });
  return { format: "anime-shuffle-research", schemaVersion: 1, profiles: [p] };
}

test("all 3000 catalog keys import, persist, merge without loss, and private findings never project", () => {
  assert.equal(traits.length, 3000);
  assert.equal(TRAIT_FAMILIES.length, 150);
  assert.equal(researchVocabulary.length, 3188);
  assert.equal(new Set(researchVocabulary.map((t) => t.key)).size, 3188);
  assert.ok(traits.every((t) => /^[a-z][a-z0-9-]{0,79}$/.test(t.key)));
  const db = storage();
  let store = createResearchStore(db);
  store.remember(anime);
  const input = bundle();
  let preview = store.preview(input);
  store.commit(input, preview.revision, preview.digest);
  store = createResearchStore(db);
  assert.equal(
    store.exportBatch({ kind: "profiles" }).profiles[0].observations.length,
    3000,
  );
  const patch = bundle([traits[0]]);
  patch.profiles[0].observations[0].score = null;
  preview = store.preview(patch);
  store.commit(patch, preview.revision, preview.digest);
  assert.equal(
    store.exportBatch({ kind: "profiles" }).profiles[0].observations.length,
    3000,
  );
  const projected = store.projection(anime.id);
  assert.equal(
    projected.observations.length,
    traits.filter((t) => t.matchingEnabled).length,
  );
  assert.ok(
    projected.observations.every(
      (o) => traits.find((t) => t.key === o.key).matchingEnabled,
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(projected),
    /Synthetic test evidence|source0/,
  );
  const privateOnly = {
    observations: traits.filter((t) => !t.matchingEnabled).map(observation),
  };
  assert.equal(researchImpact(anime, privateOnly).active, 0);
  assert.equal(
    nuancedTraits({
      ...anime,
      synopsis: "",
      researchTaste: { version: 1, ...privateOnly },
    }).size,
    0,
  );
  db.db.close();
});

test("critical traits still reject premise-only evidence and unknown does not become absence", () => {
  const input = bundle([traits.find((t) => t.evidenceOnly)]);
  input.profiles[0].observations[0].basis = "premise";
  assert.throws(
    () => validateResearchBundle(input),
    /evidence|premise|synopsis/i,
  );
  assert.equal(traitTrackingState(), "not-assessed");
  assert.equal(traitTrackingState({ score: null, confidence: 0 }), "unknown");
  assert.equal(traitTrackingState({ score: 0, confidence: 0.9 }), "absent");
  assert.equal(
    traitTrackingState({ score: 1, confidence: 0.2 }),
    "low-confidence",
  );
});

test("a normally safe trait remains private until its exact-title spoiler assignment is reviewed", () => {
  const input = bundle([traits[0]]),
    db = storage(),
    store = createResearchStore(db);
  delete input.profiles[0].observations[0].containsSpoilers;
  let preview = store.preview(input);
  store.commit(input, preview.revision, preview.digest);
  assert.equal(store.projection(anime.id).observations.length, 0);
  assert.equal(
    store.exportBatch({ kind: "profiles" }).profiles[0].observations[0]
      .containsSpoilers,
    true,
  );
  const sensitive = { ...observation(traits[0]), containsSpoilers: true };
  assert.equal(
    nuancedTraits({
      ...anime,
      synopsis: "",
      researchTaste: { version: 1, observations: [sensitive] },
    }).size,
    0,
  );
  assert.equal(researchImpact(anime, { observations: [sensitive] }).active, 0);
  input.profiles[0].observations[0].containsSpoilers = "false";
  assert.throws(() => validateResearchBundle(input), /boolean/);
  input.profiles[0].observations[0].containsSpoilers = false;
  preview = store.preview(input);
  store.commit(input, preview.revision, preview.digest);
  assert.equal(store.projection(anime.id).observations.length, 0);
  input.profiles[0].observations[0].supersedes = true;
  preview = store.preview(input);
  store.commit(input, preview.revision, preview.digest);
  assert.equal(store.projection(anime.id).observations.length, 1);
  delete input.profiles[0].observations[0].supersedes;
  input.profiles[0].observations[0].containsSpoilers = true;
  input.profiles[0].observations[0].confidence = 0.5;
  preview = store.preview(input);
  store.commit(input, preview.revision, preview.digest);
  assert.equal(store.projection(anime.id).observations.length, 0);
  db.db.close();
});

test("expanded traits change real ranking and safe explanations; repeated family tags cannot multiply energy", () => {
  const selected = traits.filter((t) =>
    ["physical-setting", "social-order", "comic-mechanism"].includes(
      t.familyKey,
    ),
  );
  const known = {
    ...anime,
    synopsis: "",
    researchTaste: { version: 1, observations: selected.map(observation) },
  };
  const taste = buildTaste(
    { [known.id]: { anime: known, action: "good", at: 1 } },
    [],
  );
  const matching = { ...known, id: 990001, title: "Candidate" };
  const without = { ...matching, researchTaste: null };
  assert.ok(scoreAnime(matching, taste) > scoreAnime(without, taste));
  const reasons = detailedExplanationReasons(matching, taste);
  assert.ok(
    reasons.some((r) => r.includes("Shared trait") && r.includes("Good")),
  );
  assert.ok(reasons.filter((r) => r.includes("Shared trait")).length <= 3);
  const group = selected.filter((t) => t.familyKey === "physical-setting");
  const features = (ts) =>
    nuancedFeatures({
      ...known,
      researchTaste: { version: 1, observations: ts.map(observation) },
    }).features;
  const energy = (f) =>
    f
      .filter(([k]) => k.startsWith("nuance:"))
      .reduce((sum, [, v]) => sum + v * v, 0);
  assert.ok(
    Math.abs(energy(features(group)) - energy(features(group.slice(0, 1)))) <
      1e-9,
  );
  assert.ok(features(group).every(([k]) => !k.startsWith("nuanceblend:")));
  const musical = traits.find((t) => t.familyKey === "diegetic-audio");
  const targeted = attributedFeatures(
    [
      [`nuance:${musical.key}`, 1],
      [`nuance:${group[0].key}`, 1],
    ],
    "music",
  );
  assert.deepEqual(
    targeted.map(([, v]) => v),
    [1.5, 0.35],
  );
});

test("model question routing stays bounded, honors requested keys, and cannot store unoffered traits", async () => {
  const target = traits.find((t) => t.familyKey === "physical-setting");
  const requirements = [{ traitKey: target.key }];
  const selected = selectAnalysisVocabulary(
    researchVocabulary,
    { text: "dense urban neighborhoods" },
    requirements,
  );
  assert.ok(selected.length <= 236);
  assert.ok(selected.some((t) => t.key === target.key));
  const unselected = traits.find(
    (t) => !selected.some((s) => s.key === t.key) && !t.evidenceOnly,
  );
  let actualPrompt;
  const analyze = createCatalogAnalyzer({
    run: async (_model, payload) => {
      actualPrompt = payload.messages[0].content;
      return {
        response: {
          observations: [
            { ...observation(unselected), basis: "premise", evidence: [0] },
          ],
          dimensions: [],
        },
      };
    },
  });
  const result = await analyze(
    { ...anime, synopsis: "Dense urban neighborhoods surround the cast." },
    [],
    null,
    requirements,
  );
  assert.ok(actualPrompt.includes(target.key));
  assert.ok(!actualPrompt.includes(unselected.key));
  assert.equal(result.profile, null);
});

test("targeted model passes preserve earlier findings across restart on unchanged metadata", async () => {
  const db = storage(),
    research = createResearchStore(db);
  let clock = Date.now(),
    pass = 0;
  const requested = traits.filter((t) => t.matchingEnabled).slice(0, 2);
  const args = {
    storage: db,
    research,
    fetcher: async () => Response.json({ data: [] }),
    schedule: async () => {},
    now: () => clock,
    analyzer: async (_a, _rows, fingerprint) => {
      const p = bundle([requested[pass++]]).profiles[0];
      p.metadataFingerprint = fingerprint;
      return { profile: p, usage: {} };
    },
  };
  let model = createCatalogModel(args);
  model.enqueue(anime);
  await model.run();
  research.saveRequirements(
    {
      expectedDigest: createHash("sha256").update("[]").digest("hex"),
      requirements: [
        {
          key: "followup",
          label: "Check another trait",
          area: "premise",
          traitKey: requested[1].key,
        },
      ],
    },
    "owner",
  );
  model = createCatalogModel(args);
  model.refill();
  clock += 11000;
  await model.run();
  const saved = research.exportBatch({ kind: "automatic" }).profiles[0];
  assert.equal(pass, 2);
  assert.deepEqual(
    new Set(saved.observations.map((o) => o.key)),
    new Set(requested.map((t) => t.key)),
  );
  db.db.close();
});
