/** Explicit-content avoidance is a one-way suppression signal, never a boost. */
export function isExplicitTitle(anime) {
  return (
    anime?.nsfw === "black" ||
    anime?.ageRating === "rx" ||
    (anime?.genres || []).some((g) => /^hentai$/i.test(g))
  );
}
export function explicitAvoidancePenalty(anime, reactions = {}) {
  if (!isExplicitTitle(anime)) return 0;
  const rejected = Object.values(reactions).filter(
    (r) => ["bad", "nope"].includes(r.action) && isExplicitTitle(r.anime),
  ).length;
  return 0.35 + Math.min(1, rejected * 0.15);
}
