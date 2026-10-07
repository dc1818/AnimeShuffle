import { analyzeNuances } from "../src/lib/nuanced-taste.js";
import {
  TASTE_TRAITS,
  TASTE_VERSION,
  evidenceClauses,
} from "../src/lib/taste-traits.js";
/** Analyze a small review sample, not a verdict about quality. Each author gets
 * one vote per attribute. Unmentioned attributes are unknown, never negative.
 * Raw reviews and reviewer identities exist only for this function invocation. */
export function analyzeReviews(rows = []) {
  const seen = new Set(),
    texts = new Set(),
    counts = new Map(),
    denials = new Map();
  let sampleSize = 0;
  for (const row of rows.slice(0, 30)) {
    if (
      row?.is_spoiler !== false ||
      row?.is_preliminary !== false ||
      typeof row.review !== "string"
    )
      continue;
    const author = row.user?.username?.trim().toLowerCase();
    if (!author || seen.has(author)) continue;
    const normalized = row.review.trim().toLowerCase().replace(/\s+/g, " ");
    if (texts.has(normalized)) continue;
    texts.add(normalized);
    seen.add(author);
    // Normalize common contractions before checking explicit denials. A review
    // containing only criticism still counts as opposing evidence.
    const prose = row.review
      .replace(/isn[’']t/gi, "is not")
      .replace(/wasn[’']t/gi, "was not")
      .replace(/aren[’']t/gi, "are not");
    const negativeClauses = prose
      .slice(0, 24000)
      .replace(/<[^>]*>/g, " ")
      .split(/(?<=[.!?;])\s+|\n+|\bbut\b|\bhowever\b/i)
      .filter((s) => /\b(no|not|never|hardly|barely|lacks?|lacking)\b/i.test(s))
      .map((s) =>
        s
          .replace(/\b(no|not|never|hardly|barely|lacks?|lacking)\b/gi, "")
          .replace(/\s+/g, " "),
      );
    const clauses = evidenceClauses(prose).filter(
      (s) =>
        !/\b(spoilers?|ending|finale|final episode|dies|death|killer|reveal\w*|plot twist|betray\w*|turns out|secret identity|last episode)\b/i.test(
          s,
        ),
    );
    if (!clauses.length && !negativeClauses.length) continue;
    sampleSize++;
    for (const t of TASTE_TRAITS) {
      if (t.source === "synopsis") continue;
      if (negativeClauses.some((s) => t.pattern.test(s))) {
        denials.set(t.key, (denials.get(t.key) || 0) + 1);
        continue;
      }
      if (clauses.some((s) => t.pattern.test(s)))
        counts.set(t.key, (counts.get(t.key) || 0) + 1);
    }
  }
  const traits = [];
  for (const t of TASTE_TRAITS) {
    const support = counts.get(t.key) || 0;
    const opposing = (counts.get(t.opposite) || 0) + (denials.get(t.key) || 0);
    if (support < 3 || support / (support + opposing) < 0.75) continue;
    // Shrink tiny samples and contradictory opinions; long reviews gain no extra votes.
    traits.push({
      key: t.key,
      support,
      strength: Number(
        ((support / (support + 4)) * (support / (support + opposing))).toFixed(
          3,
        ),
      ),
    });
  }
  return {
    version: TASTE_VERSION,
    source: "mal-reviews",
    sampleSize,
    traits,
    nuance: analyzeNuances(rows),
  };
}
