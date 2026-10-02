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
  const training = examples.map((r) => ({ ...r, features: features(r.anime) }));
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
  const combinedScore = (e, i) =>
    0.65 * Math.tanh(e / 2) + 0.35 * Math.tanh(i / 2);
  return {
    trainedIds: new Set(examples.map((r) => r.anime.id)),
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
        contributions,
        groups: Object.fromEntries(
          [...groups].map(([key, [de, di]]) => [
            key,
            baseline - combinedScore(e - de, i - di),
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
        score: 0.65 * enjoymentScore + 0.35 * interestScore,
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
