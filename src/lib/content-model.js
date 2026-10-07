import { attributedFeatures } from "./reaction-reasons.js";
import { nuancedFeatures } from "./nuanced-taste.js";
import { reviewFeatures } from "./taste-traits.js";
import { narrativeFeatures } from "./story-aspects.js";
/** Sparse content model trained only from explicit choices and MAL history.
 * Two regularized logistic heads estimate enjoyment and watch interest separately.
 * Synopsis features are lexical TF-IDF, not neural embeddings or viewing-time signals.
 */
const stop = new Set(
  "the and for that with this from they their them into when which about have has had was were are its his her she him who but not all can will one after before through also than then been being more most some such each other anime series story follows written source mal synopsis".split(
    " ",
  ),
);
export function terms(anime) {
  return [
    ...new Set(
      (anime.synopsis || "")
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, " ")
        .match(/[a-z]{3,}/g) || [],
    ),
  ]
    .filter((w) => !stop.has(w))
    .slice(0, 120);
}
const dot = (weights, features) =>
  features.reduce((n, [key, value]) => n + (weights.get(key) || 0) * value, 0);
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, x))));
export function trainContentModel(records, favoriteGenres = [], corpus = []) {
  // Prefer strong evidence; retain examples from both sides of each preference axis.
  const sorted = [...records.values()].sort(
    (a, b) =>
      Math.max(Math.abs(b.enjoyment), Math.abs(b.interest)) -
        Math.max(Math.abs(a.enjoyment), Math.abs(a.interest)) ||
      a.anime.id - b.anime.id,
  );
  const buckets = [[], [], [], []];
  for (const r of sorted)
    buckets[
      r.enjoyment < 0 || r.interest < 0
        ? 1
        : r.source === "reaction" || r.source === "favorite"
          ? 0
          : 2
    ].push(r);
  const examples = [];
  for (let i = 0; examples.length < 400 && buckets.some((b) => b[i]); i++)
    for (const b of buckets)
      if (b[i] && examples.length < 400) examples.push(b[i]);
  const docs = [
    ...new Map(
      [...examples.map((r) => r.anime), ...corpus].map((a) => [a.id, a]),
    ).values(),
  ];
  const hasCommunity = docs.some(
    (a) =>
      Array.isArray(a.communityTaste) &&
      a.communityTaste.some(
        (n) => Number.isInteger(n.support) && n.support >= 5,
      ),
  );
  const frequency = new Map();
  for (const a of docs)
    for (const t of terms(a)) frequency.set(t, (frequency.get(t) || 0) + 1);
  const cache = new WeakMap();
  function features(a) {
    if (cache.has(a)) return cache.get(a);
    const f = [];
    // A small collaborative feature family. Self features teach each known item;
    // candidate neighbors carry only aggregate, sufficiently supported correlations.
    if (hasCommunity && Number.isSafeInteger(a.id))
      f.push(["community:" + a.id, 0.25]);
    for (const neighbor of (a.communityTaste || []).slice(0, 20)) {
      if (
        !Number.isSafeInteger(neighbor.id) ||
        neighbor.id === a.id ||
        !Number.isInteger(neighbor.support) ||
        neighbor.support < 5 ||
        !Number.isFinite(neighbor.affinity) ||
        Math.abs(neighbor.affinity) > 1
      )
        continue;
      f.push([
        "community:" + neighbor.id,
        (0.25 * neighbor.affinity) /
          Math.sqrt(Math.max(1, a.communityTaste.length)),
      ]);
    }
    for (const g of a.genres || [])
      // Broad labels should not drown out plot/context differences. In particular,
      // liking one Mecha title is weak evidence for every robot-centered show.
      f.push([
        "genre:" + g,
        (g === "Mecha" ? 0.15 : 0.65) / Math.sqrt(a.genres.length),
      ]);
    f.push(...nuancedFeatures(a).features);
    const narrative = narrativeFeatures(a);
    f.push(...narrative.features);
    const reviews = reviewFeatures(a);
    f.push(...reviews.features);
    // Bounded interactions let a visual/style preference depend on story context.
    // Sparse or absent reviews add no negative evidence.
    const strongest = [...reviews.traits]
      .sort((a, b) => b[1].strength - a[1].strength || a[0].localeCompare(b[0]))
      .slice(0, 4);
    const context = [...narrative.aspects]
      .sort((a, b) => b[1].strength - a[1].strength || a[0].localeCompare(b[0]))
      .slice(0, 4);
    const blendNorm = Math.sqrt(strongest.length * context.length) || 1;
    for (const [key, value] of strongest)
      for (const [aspect, cue] of context)
        f.push([
          `reviewblend:${key}:${aspect}`,
          (0.3 * value.strength * cue.strength) / blendNorm,
        ]);
    if (a.format && a.format !== "unknown") f.push(["format:" + a.format, 0.2]);
    for (const studio of a.studios || [])
      f.push(["studio:" + studio, 0.3 / Math.sqrt(a.studios.length)]);
    const minutes = Number(a.duration) * Number(a.episodes);
    if (minutes > 0)
      f.push([
        "length:" +
          (minutes < 120
            ? "short"
            : minutes < 400
              ? "single"
              : minutes < 800
                ? "double"
                : "long"),
        0.2,
      ]);
    const words = terms(a).map((t) => [
      t,
      1 + Math.log((docs.length + 1) / ((frequency.get(t) || 0) + 1)),
    ]);
    const norm = Math.hypot(...words.map(([, v]) => v)) || 1;
    for (const [t, v] of words) f.push(["text:" + t, (0.9 * v) / norm]);
    cache.set(a, f);
    return f;
  }
  const enjoyment = new Map(),
    interest = new Map();
  const training = examples.map((r) => ({
    ...r,
    features: attributedFeatures(features(r.anime), r.reason),
  }));
  for (const genre of favoriteGenres)
    training.push({
      features: [["genre:" + genre, 1]],
      enjoyment: 0.4,
      interest: 0.4,
    });
  // Fixed passes and bounded samples keep learning deterministic and inexpensive.
  for (let epoch = 0; epoch < 16; epoch++) {
    const rate = 0.22 / (1 + epoch * 0.1);
    for (const r of training)
      for (const [head, signal] of [
        [enjoyment, r.enjoyment],
        [interest, r.interest],
      ]) {
        if (!signal) continue; // Unknown evidence is not a negative label.
        const error =
          ((signal + 1) / 2 - sigmoid(dot(head, r.features))) *
          Math.abs(signal);
        for (const [key, value] of r.features)
          head.set(
            key,
            (head.get(key) || 0) * (1 - rate * 0.025) + rate * error * value,
          );
      }
  }
  const nuanceVector = (a) =>
    new Map(
      nuancedFeatures(a).features.filter(([k]) => k.startsWith("nuance:")),
    );
  const vectors = examples.map((r) => ({
    ...r,
    vector: new Map(attributedFeatures([...nuanceVector(r.anime)], r.reason)),
  }));
  const neighborhoodCache = new WeakMap();
  function neighborhood(a) {
    if (neighborhoodCache.has(a)) return neighborhoodCache.get(a);
    const v = nuanceVector(a),
      norm = Math.hypot(...v.values());
    if (!norm || v.size < 2) return { score: 0, matches: [] };
    const matches = vectors
      .filter((r) => r.anime.id !== a.id && r.vector.size >= 2)
      .map((r) => {
        const shared = [...v.keys()].filter((k) => r.vector.has(k));
        const sim =
          shared.reduce((sum, k) => sum + v.get(k) * r.vector.get(k), 0) /
          (norm * Math.hypot(...r.vector.values()) || 1);
        return { ...r, shared, sim };
      })
      .filter((r) => r.shared.length >= 2 && r.sim >= 0.35);
    const strongest = (sign) =>
      matches
        .filter((r) => sign * (0.65 * r.enjoyment + 0.35 * r.interest) > 0)
        .sort((a, b) => b.sim - a.sim || a.anime.id - b.anime.id)
        .slice(0, 3);
    const selected = [...strongest(1), ...strongest(-1)];
    const score =
      selected.reduce(
        (n, r) => n + r.sim * (0.65 * r.enjoyment + 0.35 * r.interest),
        0,
      ) /
      Math.max(
        3,
        selected.reduce((n, r) => n + r.sim, 0),
      );
    const result = {
      score,
      matches: selected.map((r) => ({
        id: r.anime.id,
        contribution: r.sim * (0.65 * r.enjoyment + 0.35 * r.interest),
        keys: r.shared.map((k) => k.slice(7)),
      })),
    };
    neighborhoodCache.set(a, result);
    return result;
  }
  // Direct MAL relationships are a small additional signal. Never merge votes
  // across a franchise or infer connections from overlapping title words.
  const predecessorRecords = new Map();
  for (const record of records.values())
    for (const id of record.anime.sequels || []) {
      if (!Number.isSafeInteger(id) || id === record.anime.id) continue;
      const predecessors = predecessorRecords.get(id) || new Set();
      predecessors.add(record.anime.id);
      predecessorRecords.set(id, predecessors);
    }
  const continuationCache = new WeakMap();
  function continuation(a) {
    if (continuationCache.has(a)) return continuationCache.get(a);
    const ids = new Set([
      ...(a.prequels || []),
      ...(predecessorRecords.get(a.id) || []),
    ]);
    ids.delete(a.id);
    const related = [...ids].map((id) => records.get(id)).filter(Boolean);
    const matches = related.map((record) => ({
      id: record.anime.id,
      contribution:
        (0.1 * (0.8 * record.enjoyment + 0.2 * record.interest)) /
        Math.max(1, related.length),
    }));
    const result = {
      score: matches.reduce((sum, match) => sum + match.contribution, 0),
      matches,
    };
    continuationCache.set(a, result);
    return result;
  }
  const combinedScore = (e, i) =>
    0.65 * Math.tanh(e / 2) + 0.35 * Math.tanh(i / 2);
  return {
    trainedIds: new Set(examples.map((r) => r.anime.id)),
    continuations: (a) => continuation(a).matches,
    // Leave-one-feature-out score differences use the very same trained heads
    // as ranking. These are contributions to a match, not confidence percentages.
    explain(a) {
      const f = features(a),
        e = dot(enjoyment, f),
        i = dot(interest, f);
      const baseline = combinedScore(e, i);
      const groups = new Map();
      const contributions = f.map(([key, value]) => {
        const de = (enjoyment.get(key) || 0) * value;
        const di = (interest.get(key) || 0) * value;
        const group = key.split(":")[0];
        const sum = groups.get(group) || [0, 0];
        groups.set(group, [sum[0] + de, sum[1] + di]);
        return { key, contribution: baseline - combinedScore(e - de, i - di) };
      });
      return {
        neighbors: neighborhood(a).matches,
        continuations: continuation(a).matches,
        contributions: contributions.map((c) => ({
          ...c,
          contribution: c.contribution * 0.8,
        })),
        groups: Object.fromEntries(
          [...groups].map(([key, [de, di]]) => [
            key,
            0.8 * (baseline - combinedScore(e - de, i - di)),
          ]),
        ),
      };
    },
    score(a) {
      const f = features(a);
      const enjoymentScore = Math.tanh(dot(enjoyment, f) / 2);
      const interestScore = Math.tanh(dot(interest, f) / 2);
      return {
        enjoyment: enjoymentScore,
        interest: interestScore,
        continuation: continuation(a).score,
        score:
          0.8 * (0.65 * enjoymentScore + 0.35 * interestScore) +
          0.2 * neighborhood(a).score +
          continuation(a).score,
      };
    },
    support(a) {
      const f = features(a);
      return (
        f.reduce(
          (n, [key, v]) =>
            n + (enjoyment.has(key) || interest.has(key) ? v * v : 0),
          0,
        ) / (f.reduce((n, [, v]) => n + v * v, 0) || 1)
      );
    },
  };
}
