import test from "node:test";
import assert from "node:assert/strict";
import { researchImpact } from "../src/lib/research-impact.js";
const o = {
  key: "strategic-conflict",
  score: 0.9,
  confidence: 0.8,
  prominence: "central",
};
const profile = { observations: [o] };
test("contribution audit distinguishes new features, repeated evidence, absent metadata and unknowns", () => {
  assert.equal(researchImpact(null, profile).status, "needs-metadata");
  assert.equal(
    researchImpact(null, { observations: [{ ...o, score: null }] }).status,
    "no-active-traits",
  );
  const base = { id: 1, title: "Fixture", synopsis: "", genres: [] };
  assert.equal(researchImpact(base, profile).status, "adds-traits");
  assert.equal(
    researchImpact(base, profile, { version: 1, observations: [o] }).status,
    "no-feature-change",
  );
  assert.equal(
    researchImpact(base, profile, {
      version: 1,
      observations: [{ ...o, score: 0.5 }],
    }).status,
    "reweights-existing",
  );
  assert.equal(
    researchImpact(
      base,
      { observations: [{ ...o, score: 0, confidence: 0.95 }] },
      { version: 1, observations: [o] },
    ).status,
    "removes-traits",
  );
  const unknown = { observations: [{ ...o, score: null }] };
  assert.equal(
    researchImpact(base, unknown, { version: 1, observations: [o] }).status,
    "no-active-traits",
  );
  assert.equal(
    researchImpact(base, { observations: [{ ...o, confidence: 0.2 }] }).status,
    "no-active-traits",
  );
});
