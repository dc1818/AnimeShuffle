import { EXTENDED_TRAIT_BY_KEY } from "./extended-research-traits.js";
/** A reason attributes this particular vote. It is never an automatic global
 * exclusion: the same aspect can work differently in another story. */
export const REACTION_REASONS = [
  {
    key: "characters",
    label: "Characters",
    pattern: /villain|character|lead|ensemble|design|outcast/,
  },
  {
    key: "visuals",
    label: "Visual style & action",
    pattern:
      /animation|visual|chibi|combat|choreograph|design|art-style|palette/,
  },
  {
    key: "story",
    label: "Story & themes",
    pattern:
      /aspect:|blend:|isekai|magic|intrigue|moral|procedural|subtext|ironic|writing|power|progression/,
  },
  {
    key: "romance",
    label: "Romance",
    pattern: /romance|romantic|love-polygon|couple/,
  },
  { key: "mecha", label: "Mecha focus", pattern: /mecha|mech/ },
  {
    key: "sports",
    label: "Sports & competition",
    pattern: /sports|sport|tournament|martial|competition/i,
  },
  {
    key: "pacing",
    label: "Pacing & filler",
    pattern: /pac\w*|filler|brisk|slow-burn|length:|episodic|serialized/,
  },
  {
    key: "tone",
    label: "Tone & humor",
    pattern:
      /tone|humor|comedy|comfort|bleak|hope|emotion|melanchol|satir|absurd/,
  },
  { key: "music", label: "Music & sound", pattern: /music|sound|voice/ },
];
export const normalizeReactionReason = (value) =>
  REACTION_REASONS.some((r) => r.key === value) ? value : null;
export function attributedFeatures(features, reason) {
  const rule = REACTION_REASONS.find((r) => r.key === reason);
  const relevant = (key) =>
    rule &&
    (rule.pattern.test(key) ||
      key
        .split(":")
        .slice(1)
        .some((part) => {
          const trait = EXTENDED_TRAIT_BY_KEY.get(part);
          if (!trait) return false;
          return {
            characters: ["characters", "relationships"],
            visuals: ["presentation"],
            story: ["premise", "world", "powers", "conflict", "structure"],
            pacing: ["pacing"],
            tone: ["tone", "comedy"],
            music: ["music"],
          }[reason]?.includes(trait.area);
        }));
  if (!rule || !features.some(([key]) => relevant(key))) return features;
  // Attenuate unrelated evidence rather than invent an attribute missing from
  // the catalog. An explicit reason contributes a stronger targeted example.
  return features.map(([key, value]) => [
    key,
    value * (relevant(key) ? 1.5 : 0.35),
  ]);
}
