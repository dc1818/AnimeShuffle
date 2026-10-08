import { createHash } from "node:crypto";
import { AppError } from "./mal.mjs";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique = (values) => [...new Set(values)];
const strength = {
  "not-researched": 0,
  unknown: 0,
  "insufficient-evidence": 1,
  partial: 2,
  supported: 3,
  "not-applicable": 3,
  disputed: 4,
};

/** Merge one exact MAL entry. Re-uploading thin research must not erase work.
 * Canonical source IDs prevent the same local ID in two files changing the
 * meaning of old citations, and repeated uploads do not multiply evidence.
 */
export function mergeResearchProfile(previous, incoming) {
  const sources = new Map();
  function canonical(profile) {
    if (!profile) return null;
    const ids = new Map();
    for (const source of profile.sources) {
      const key =
        "src-" +
        digest([source.url, source.type, source.independenceKey || ""]).slice(
          0,
          24,
        );
      ids.set(source.id, key);
      const old = sources.get(key);
      if (!old || Date.parse(source.accessedAt) >= Date.parse(old.accessedAt))
        sources.set(key, { ...source, id: key });
    }
    const remap = (rows) =>
      (rows || []).map((row) => ({
        ...row,
        sources: unique(row.sources.map((id) => ids.get(id))),
      }));
    return {
      ...profile,
      observations: remap(profile.observations),
      dimensions: remap(profile.dimensions),
    };
  }
  const old = canonical(previous),
    next = canonical(incoming);
  const observations = new Map(
    (old?.observations || []).map((o) => [o.key, o]),
  );
  const changes = {
    addedTraits: 0,
    filledTraits: 0,
    retainedTraits: 0,
    revisedTraits: 0,
    refinedTraits: 0,
    addedDimensions: 0,
  };
  for (const supplied of next.observations) {
    const { supersedes, ...observation } = supplied;
    const prior = observations.get(observation.key);
    if (
      prior?.score !== null &&
      prior?.score !== undefined &&
      observation.score === null
    ) {
      changes.retainedTraits++;
      continue;
    }
    if (
      prior?.score !== null &&
      prior?.score !== undefined &&
      observation.score !== null
    ) {
      // Scores encode prominence, not a yes/no vote at 0.5. Incidental and
      // central descriptions can both establish presence. Only explicit
      // absence versus supported presence requires an intentional correction.
      const conflicts =
        (prior.score >= 0.3 && observation.score <= 0.1) ||
        (prior.score <= 0.1 && observation.score >= 0.3);
      if (conflicts && !supersedes)
        throw new AppError(
          `Conflicting assessed findings for MAL ID ${incoming.malId}. Export its saved profile and reconcile the evidence; use supersedes:true on an observation only for an intentional sourced correction.`,
          400,
          "research_conflict",
        );
      if (supersedes) {
        observations.set(observation.key, observation);
        changes.revisedTraits++;
      } else {
        const best =
          observation.confidence >= prior.confidence ? observation : prior;
        observations.set(observation.key, {
          ...best,
          // A privacy warning is not outweighed by a higher numeric confidence.
          // Clearing it requires an intentional, sourced superseding revision.
          ...(prior.containsSpoilers !== undefined ||
          observation.containsSpoilers !== undefined
            ? {
                containsSpoilers:
                  prior.containsSpoilers === true ||
                  observation.containsSpoilers === true,
              }
            : {}),
          sources: unique([...prior.sources, ...observation.sources]),
        });
        if (
          best === observation &&
          (observation.score !== prior.score ||
            observation.confidence !== prior.confidence ||
            observation.prominence !== prior.prominence)
        )
          changes.refinedTraits++;
        changes.retainedTraits++;
      }
    } else {
      observations.set(observation.key, observation);
      if (observation.score !== null)
        changes[prior ? "filledTraits" : "addedTraits"]++;
    }
  }
  const dimensions = new Map((old?.dimensions || []).map((d) => [d.key, d]));
  for (const dimension of next.dimensions || []) {
    const prior = dimensions.get(dimension.key);
    if (!prior) {
      dimensions.set(dimension.key, dimension);
      changes.addedDimensions++;
    } else if (
      prior.description === dimension.description &&
      prior.area === dimension.area &&
      prior.basis === dimension.basis
    ) {
      dimensions.set(dimension.key, {
        ...prior,
        confidence: Math.max(prior.confidence, dimension.confidence),
        containsSpoilers: prior.containsSpoilers || dimension.containsSpoilers,
        sources: unique([...prior.sources, ...dimension.sources]),
      });
    } else {
      // Keep distinct interpretations instead of silently losing reusable detail.
      const key =
        dimension.key.slice(0, 60) +
        "-" +
        digest([dimension.description, dimension.area, dimension.basis]).slice(
          0,
          12,
        );
      if (!dimensions.has(key)) {
        dimensions.set(key, { ...dimension, key });
        changes.addedDimensions++;
      }
    }
  }
  const coverage = new Map((old?.coverage || []).map((c) => [c.area, c]));
  for (const supplied of next.coverage || []) {
    const { supersedes, ...entry } = supplied;
    const prior = coverage.get(entry.area);
    if (!prior || supersedes || strength[entry.state] >= strength[prior.state])
      coverage.set(entry.area, entry);
  }
  changes.retainedTraits =
    (old?.observations || []).filter((o) => o.score !== null).length -
    changes.revisedTraits;
  return {
    profile: {
      ...next,
      scope:
        old?.status === "researched" && next.status === "preliminary"
          ? old.scope
          : next.scope,
      status: old?.status === "researched" ? "researched" : next.status,
      analyzedAt:
        old &&
        (!(
          changes.addedTraits +
          changes.filledTraits +
          changes.revisedTraits +
          changes.refinedTraits +
          changes.addedDimensions
        ) ||
          Date.parse(old.analyzedAt) > Date.parse(next.analyzedAt))
          ? old.analyzedAt
          : next.analyzedAt,
      metadataFingerprint:
        next.metadataFingerprint || old?.metadataFingerprint || null,
      sources: [...sources.values()],
      observations: [...observations.values()],
      dimensions: [...dimensions.values()],
      coverage: [...coverage.values()],
      spoilersAllowed: !!(old?.spoilersAllowed || next.spoilersAllowed),
      caveats: unique([
        ...(old?.caveats || []),
        ...next.caveats,
        ...(old?.metadataFingerprint &&
        next.metadataFingerprint &&
        old.metadataFingerprint !== next.metadataFingerprint
          ? [
              "Catalog metadata changed since retained earlier findings were analyzed. Recheck those findings against the current adaptation evidence.",
            ]
          : []),
      ]),
      appeal: unique([...(old?.appeal || []), ...next.appeal]),
      unknowns: unique([...(old?.unknowns || []), ...next.unknowns]),
    },
    changes,
  };
}
