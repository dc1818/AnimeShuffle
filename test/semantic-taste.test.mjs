import test from "node:test";
import assert from "node:assert/strict";
import { createSemanticAnalyzer } from "../lib/semantic-enrichment.mjs";
import {
  semanticSimilarity,
  semanticPreference,
} from "../src/lib/semantic-taste.js";
const vector = (i = 0) =>
  Array.from({ length: 384 }, (_, n) => (n === i ? 1 : 0));
const profile = (i = 0) => ({ model: "bge", version: "1", premise: vector(i) });
test("semantic matching rejects mismatched models and missing data, keeps reactions on their axes", () => {
  assert.equal(
    semanticSimilarity(profile(), { ...profile(), model: "minilm" }),
    null,
  );
  assert.equal(semanticSimilarity(profile(), null), null);
  assert.equal(semanticSimilarity(profile(), profile()), 1);
  const a = { id: 2, semanticTaste: profile() };
  const records = new Map([
    [
      1,
      { anime: { id: 1, semanticTaste: profile() }, enjoyment: 1, interest: 0 },
    ],
  ]);
  const liked = semanticPreference(a, records);
  assert.ok(liked > 0 && liked <= 0.12);
  records.get(1).enjoyment = -1;
  assert.ok(semanticPreference(a, records) < 0);
  records.get(1).enjoyment = 0;
  records.get(1).interest = 0.4;
  assert.ok(
    semanticPreference(a, records) > 0 &&
      semanticPreference(a, records) < liked,
  );
  assert.equal(
    semanticPreference({ ...a, semanticTaste: undefined }, records),
    0,
  );
});
test("embeddings receive bounded public passages and return validated vectors without storing review prose", async () => {
  let sent;
  const analyzer = createSemanticAnalyzer({
    async run(model, input) {
      sent = input;
      return { data: input.text.map(() => vector()) };
    },
  });
  const result = await analyzer(
    {
      id: 1,
      title: "Test",
      synopsis: "A lonely traveler finds a family among strangers.",
      account: "PRIVATE",
    },
    [],
  );
  assert.ok(sent.text.length > 0);
  assert.ok(sent.text.every((t) => t.length <= 350));
  assert.ok(!JSON.stringify(sent).includes("PRIVATE"));
  assert.equal(result.premise.length, 384);
  assert.equal(result.review, null);
  assert.ok(!JSON.stringify(result).includes("traveler"));
  await assert.rejects(
    createSemanticAnalyzer({
      async run() {
        return { data: [[1, 2]] };
      },
    })({ id: 1, synopsis: "A traveler explores the world." }, []),
    /Invalid embedding/,
  );
});
