// Reproduce with: node scripts/prove-research-ranking.mjs /path/to/batch.json
// This is a deterministic integration check, not a recommendation-quality study.
import fs from "node:fs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { researchImpact } from "../src/lib/research-impact.js";
import {
  createResearchStore,
  validateResearchBundle,
} from "../lib/research-profiles.mjs";
import {
  buildTaste,
  scoreAnime,
  rankRecommendations,
  detailedExplanationReasons,
} from "../src/lib/recommend.js";
const bundle = validateResearchBundle(
  JSON.parse(fs.readFileSync(process.argv[2], "utf8")),
);
let sourceCoverageAudit = null;
if (process.argv[3]) {
  const entries = JSON.parse(fs.readFileSync(process.argv[3], "utf8")).entries;
  const metadata = new Map(
    entries.map(({ anime: a }) => [
      a.mal_id,
      {
        id: a.mal_id,
        title: a.title,
        synopsis: a.synopsis || "",
        genres: [
          ...(a.genres || []),
          ...(a.explicit_genres || []),
          ...(a.themes || []),
          ...(a.demographics || []),
        ].map((g) => g.name),
      },
    ]),
  );
  const counts = {};
  for (const p of bundle.profiles) {
    const impact = researchImpact(metadata.get(p.malId), p);
    counts[impact.status] = (counts[impact.status] || 0) + 1;
  }
  sourceCoverageAudit = {
    comparison:
      "Full Tenrai metadata used to generate this batch; production stored metadata may differ.",
    counts,
  };
}
const db = new DatabaseSync(":memory:");
const storage = {
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
const store = createResearchStore(storage),
  preview = store.preview(bundle);
store.commit(
  bundle,
  preview.revision,
  preview.digest,
  "proof",
  "proof-batch:0",
  "Actual preliminary batch",
);
const known = bundle.profiles.find((p) => p.malId === 9916),
  candidate = bundle.profiles.find((p) => p.malId === 19947);
assert.ok(
  known && candidate,
  "This proof expects Samurai Giants and Ikkyuu-san (1978) from batch one.",
);
// Identical sparse public metadata deliberately isolates the imported channel.
// Real catalog text may already provide the same premise signals.
const anime = (p) => ({
  id: p.malId,
  title: p.title,
  genres: [],
  synopsis: "",
  format: "tv",
  nsfw: "white",
  prequels: [],
});
const k = anime(known),
  c = anime(candidate),
  control = {
    ...c,
    id: 1,
    title: "Identical metadata, no imported traits (test control)",
  };
function run(enriched) {
  const liked = enriched ? store.attach(k) : k,
    match = enriched ? store.attach(c) : c;
  const reactions = { [k.id]: { anime: liked, action: "good", at: 1 } },
    taste = buildTaste(reactions, []);
  return {
    candidateScore: scoreAnime(match, taste),
    controlScore: scoreAnime(control, taste),
    order: rankRecommendations([control, match], { reactions }).map(
      (p) => p.anime.id,
    ),
    reasons: detailedExplanationReasons(match, taste),
  };
}
const before = run(false),
  after = run(true);
assert.equal(before.candidateScore, before.controlScore);
assert.ok(after.candidateScore > after.controlScore);
assert.equal(before.order[0], control.id);
assert.equal(after.order[0], c.id);
assert.ok(
  after.reasons.some((r) => r.includes(k.title) && r.includes("sports")),
);
const unknown = bundle.profiles.find((p) =>
  p.observations.every((o) => o.score === null),
);
const unknownAnime = anime(unknown),
  taste = buildTaste(
    { [k.id]: { anime: store.attach(k), action: "good", at: 1 } },
    [],
  );
const unknownBefore = scoreAnime(unknownAnime, taste),
  unknownAfter = scoreAnime(store.attach(unknownAnime), taste);
assert.equal(unknownBefore, unknownAfter);
const publicProjection = store.projection(c.id);
assert.ok(
  publicProjection.observations.every((o) =>
    Object.keys(o).every((k) =>
      ["key", "score", "confidence", "prominence"].includes(k),
    ),
  ),
);
const rollbackRevision = store.stats().revision;
store.rollback(rollbackRevision, "proof");
assert.equal(store.projection(c.id), null);
console.log(
  JSON.stringify(
    {
      scope:
        "Actual batch imported into an isolated in-memory database; controlled sparse metadata and simulated user reaction. No live account or production database changed.",
      batch: {
        profiles: bundle.profiles.length,
        withAssessedTraits: bundle.profiles.filter((p) =>
          p.observations.some((o) => o.score !== null),
        ).length,
        assessedTraits: bundle.profiles
          .flatMap((p) => p.observations)
          .filter((o) => o.score !== null).length,
      },
      sourceCoverageAudit,
      userLiked: { id: k.id, title: k.title },
      candidate: { id: c.id, title: c.title },
      before,
      after,
      checks: {
        rankingChanged: true,
        personalizedExplanation: true,
        unknownAddsNoScore: unknownBefore === unknownAfter,
        publicProjectionHasNoPrivateProse: true,
        rollbackRemovedImportedSignal: true,
      },
      limitation:
        "Proves storage-to-ranking-to-explanation integration. Does not measure user satisfaction or establish incremental value beyond signals already extractable from a full synopsis.",
    },
    null,
    2,
  ),
);
db.close();
