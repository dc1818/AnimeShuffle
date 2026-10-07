import { nuancedTraits } from "./nuanced-taste.js";
import { buildTaste } from "./recommend.js";
import { storyAspects } from "./story-aspects.js";
import { reviewTraits } from "./taste-traits.js";

// Compact names for visual navigation; full evidence stays on the cards.
const SHORT_LABELS = {
  "strategic-action": "Tactical action",
  strategy: "Strategy",
  tactics: "Strategy",
  "character-focus": "Character stories",
  worldbuilding: "Worldbuilding",
  "moral-ambiguity": "Moral ambiguity",
  ensemble: "Ensemble casts",
  "competent-lead": "Resourceful leads",
  comfort: "Comfort",
  "found-family": "Found family",
  friendship: "Friendship",
  growth: "Personal growth",
  mentorship: "Mentorship",
  "slow-burn": "Slow burn",
  serialized: "Connected stories",
  "villain-strategy": "Cunning villains",
  "villain-charisma": "Charismatic villains",
  "character-depth": "Layered characters",
  "animation-craft": "Animation craft",
  "soundtrack-craft": "Memorable music",
  "emotional-resonance": "Emotional impact",
};

/** Read-only view of existing evidence: no extra API calls or model training.
 * Prospective choices never count as enjoyed anime. Only fixed trait labels
 * reach the UI; synopsis/review sentences are deliberately excluded. */
export function profileTaste(state) {
  const { records } = buildTaste(
    state.reactions,
    state.list,
    state.preferences,
    state.recommendationPool || [],
    false,
  );
  const groups = new Map();
  for (const record of records.values()) {
    const anime = record.anime;
    if (!anime?.id) continue;
    const traits = new Map([
      ...storyAspects(anime),
      ...reviewTraits(anime),
      ...nuancedTraits(anime),
    ]);
    if (traits.has("strategic-action")) traits.delete("tactics");
    const bucket =
      record.enjoyment > 0.4
        ? "liked"
        : record.enjoyment < -0.4
          ? "disliked"
          : record.interest > 0.2
            ? "curious"
            : null;
    if (!bucket) continue;
    for (const [key, trait] of traits) {
      if (!groups.has(key))
        groups.set(key, {
          key,
          label: trait.description,
          shortLabel:
            SHORT_LABELS[key] ||
            trait.description.replace(/^(a |an |the )/, ""),
          liked: [],
          disliked: [],
          curious: [],
        });
      groups.get(key)[bucket].push({
        anime,
        evidence:
          record.action === "good"
            ? "Marked Good"
            : record.action === "bad"
              ? "Marked Bad"
              : record.source === "favorite"
                ? "An initial favorite"
                : bucket === "curious"
                  ? record.action === "watch"
                    ? "Would Watch"
                    : "On your MAL list"
                  : `MAL rating: ${anime.listStatus?.score}/10`,
      });
    }
  }
  const all = [...groups.values()];
  const interests = all
    .filter((g) => g.liked.length >= 2 && g.liked.length > g.disliked.length)
    .sort(
      (a, b) =>
        b.liked.length -
          b.disliked.length -
          (a.liked.length - a.disliked.length) || a.key.localeCompare(b.key),
    )
    .slice(0, 6);
  const curious = all
    .filter((g) => g.curious.length >= 2 && g.liked.length < 2)
    .sort((a, b) => b.curious.length - a.curious.length)
    .slice(0, 3);
  const contrasts = all
    .filter((g) => g.liked.length >= 2 && g.disliked.length >= 2)
    .slice(0, 2);
  // Edges mean shared liked titles, not an invented causal relationship.
  const edges = [];
  interests.forEach((a, i) =>
    interests.slice(i + 1).forEach((b, j) => {
      if (a.liked.some((x) => b.liked.some((y) => x.anime.id === y.anime.id)))
        edges.push([i, i + j + 1]);
    }),
  );
  return { interests, curious, contrasts, edges };
}
