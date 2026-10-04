export const RECOMMENDATION_MINIMUM = 50;
export function reactionCount(reactions = {}) {
  return Object.values(reactions).filter((r) =>
    ["good", "bad", "watch", "nope"].includes(r?.action),
  ).length;
}
export const recommendationsUnlocked = (reactions) =>
  reactionCount(reactions) >= RECOMMENDATION_MINIMUM;
