import { EXTENDED_RESEARCH_TRAITS } from "../src/lib/extended-research-traits.js";

const stop = new Set(
  "with from through their about within without between character characters story anime evidence role major public private alongside using being different shared across before after".split(
    " ",
  ),
);
const words = (text) =>
  new Set(
    (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !stop.has(w)),
  );
const candidates = EXTENDED_RESEARCH_TRAITS.map((t) => ({
  trait: t,
  words: words(`${t.label} ${t.category}`),
}));
const frequency = new Map();
for (const c of candidates)
  for (const w of c.words) frequency.set(w, (frequency.get(w) || 0) + 1);

/** Lexical overlap only chooses questions to ask, never asserts a trait.
 * Owner-requested keys take priority; output still needs cited evidence. */
export function selectAnalysisVocabulary(
  baseVocabulary,
  evidence,
  requirements = [],
) {
  const base = baseVocabulary.filter((t) => !t.familyKey);
  const requested = new Set(
    requirements.map((r) => r.traitKey).filter(Boolean),
  );
  const tokens = words(JSON.stringify(evidence));
  const ranked = candidates
    .map((c) => ({
      ...c,
      score: [...c.words].reduce(
        (s, w) => s + (tokens.has(w) ? 1 / Math.sqrt(frequency.get(w)) : 0),
        0,
      ),
    }))
    .filter((c) => c.score > 0 || requested.has(c.trait.key))
    .sort(
      (a, b) =>
        Number(requested.has(b.trait.key)) -
          Number(requested.has(a.trait.key)) ||
        b.score - a.score ||
        a.trait.key.localeCompare(b.trait.key),
    );
  const selected = [],
    counts = new Map();
  for (const c of ranked) {
    if (selected.length >= 48) break;
    const count = counts.get(c.trait.familyKey) || 0;
    if (count >= 4 && !requested.has(c.trait.key)) continue;
    selected.push(c.trait);
    counts.set(c.trait.familyKey, count + 1);
  }
  return [...base, ...selected];
}

export const ANALYSIS_TRAITS_PER_PASS = 32;

/** Stable, exhaustive traversal. Relevance routing may prioritize ad-hoc work,
 * but must never exclude a key from the durable full-catalog assessment. */
export function analysisVocabularyPass(vocabulary, cursor = 0) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > vocabulary.length)
    throw Error("invalid_trait_cursor");
  return {
    vocabulary: vocabulary.slice(cursor, cursor + ANALYSIS_TRAITS_PER_PASS),
    cursor,
    nextCursor: Math.min(cursor + ANALYSIS_TRAITS_PER_PASS, vocabulary.length),
    total: vocabulary.length,
  };
}
