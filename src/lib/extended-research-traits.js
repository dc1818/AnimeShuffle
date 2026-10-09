import { EXTENDED_TRAIT_ROWS, TRAIT_FAMILIES } from "./extended-trait-data.js";
export {
  TRAIT_CATALOG_VERSION,
  TRAIT_FAMILIES,
} from "./extended-trait-data.js";

const families = new Map(TRAIT_FAMILIES.map((f) => [f.key, f]));
export const EXTENDED_RESEARCH_TRAITS = EXTENDED_TRAIT_ROWS.map(
  ([key, label, familyKey]) => {
    const family = families.get(familyKey);
    const matchingEnabled =
      family.recommendedUse === "ranking-candidate" &&
      family.visibility !== "private";
    return {
      key,
      label,
      familyKey,
      area: family.area,
      category: family.label,
      definition: `Assess ${label}. ${family.question}${family.scopeRule ? ` ${family.scopeRule}` : ""}`,
      evidenceOnly: family.evidenceMode === "critical",
      trackingEnabled: true,
      requiresSpoilerReview: true,
      matchingEnabled,
      explanationSafe: matchingEnabled,
      usage: matchingEnabled ? "matching" : "private-research",
    };
  },
);
export const EXTENDED_TRAIT_BY_KEY = new Map(
  EXTENDED_RESEARCH_TRAITS.map((t) => [t.key, t]),
);

/** Families are not synonyms. Never automatically transfer an assessment from
 * a related legacy tag or from another season, and never manufacture absence. */
export function traitTrackingState(observation) {
  if (!observation) return "not-assessed";
  if (observation.score === null) return "unknown";
  if (observation.confidence < 0.45) return "low-confidence";
  if (observation.score <= 0.1 && observation.confidence >= 0.8)
    return "absent";
  if (observation.score >= 0.3) return "present";
  return "uncertain";
}
