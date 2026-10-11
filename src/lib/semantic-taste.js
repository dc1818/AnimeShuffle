// Optional shared embeddings supply a small similarity signal, never trait labels.
const valid = (v) =>
  Array.isArray(v) && v.length === 384 && v.every(Number.isFinite);
function cosine(a, b) {
  if (!valid(a) || !valid(b)) return null;
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm
    ? Math.max(-1, Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / norm))
    : null;
}
export function semanticSimilarity(a, b) {
  if (!a?.model || a.model !== b?.model || a.version !== b.version) return null;
  const premise = cosine(a.premise, b.premise),
    review = cosine(a.review, b.review);
  if (premise === null && review === null) return null;
  return premise === null
    ? review
    : review === null
      ? premise
      : 0.8 * premise + 0.2 * review;
}
export function semanticPreference(anime, records) {
  if (!anime.semanticTaste) return 0;
  const matches = [...records.values()]
    .filter((r) => r.anime.id !== anime.id && r.anime.semanticTaste)
    .map((r) => ({
      r,
      sim: semanticSimilarity(anime.semanticTaste, r.anime.semanticTaste),
    }))
    .filter((x) => x.sim !== null && x.sim > 0.5)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 8);
  let total = 0,
    weight = 0;
  for (const { r, sim } of matches) {
    const w = (sim - 0.5) * 2;
    total += w * (0.65 * r.enjoyment + 0.35 * r.interest);
    weight += w;
  }
  return (0.12 * total) / Math.max(2, weight);
}
