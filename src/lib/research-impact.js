import { nuancedTraits } from "./nuanced-taste.js";

/** Compare actual ranking features. Counts reveal no private outcome labels. */
export function researchImpact(anime, profile, automatic = null) {
  const observations = profile?.observations || [];
  const usable = observations.filter(
    (o) =>
      Number.isFinite(o.score) &&
      o.confidence >= 0.45 &&
      ((o.score >= 0.3 &&
        ["central", "supporting", "incidental"].includes(o.prominence)) ||
        (o.score <= 0.1 && o.confidence >= 0.8)),
  );
  if (!usable.length && !automatic?.observations?.length)
    return {
      status: "no-active-traits",
      active: 0,
      added: 0,
      reweighted: 0,
      removed: 0,
      needsResearch: true,
    };
  if (!anime)
    return {
      status: "needs-metadata",
      active: usable.length,
      added: null,
      reweighted: null,
      removed: null,
      needsResearch: true,
    };
  const before = nuancedTraits({ ...anime, researchTaste: automatic });
  const combined = new Map(
    (automatic?.observations || []).map((o) => [o.key, o]),
  );
  for (const o of observations)
    if (o.score !== null || !combined.has(o.key)) combined.set(o.key, o);
  const after = nuancedTraits({
    ...anime,
    researchTaste: { version: 1, observations: [...combined.values()] },
  });
  let added = 0,
    reweighted = 0,
    removed = 0;
  for (const [key, value] of after) {
    if (!before.has(key)) added++;
    else if (Math.abs(before.get(key).strength - value.strength) > 1e-9)
      reweighted++;
  }
  for (const key of before.keys()) if (!after.has(key)) removed++;
  const status = added
    ? "adds-traits"
    : removed
      ? "removes-traits"
      : reweighted
        ? "reweights-existing"
        : usable.length ? "no-feature-change" : "no-active-traits";
  return {
    status,
    active: usable.length,
    added,
    reweighted,
    removed,
    needsResearch: !added && !removed,
  };
}
