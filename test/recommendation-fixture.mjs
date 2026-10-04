/** Neutral history for tests exercising already-unlocked recommendation behavior.
 * These empty metadata fixtures do not add genre, story, or studio preferences.
 * Boundary and real persistence behavior are tested separately in recommendation-access.
 */
export function unlockedReactions(existing = {}) {
  const reactions = { ...existing };
  for (let i = 0; Object.keys(reactions).length < 50; i++) {
    const id = 9000000 + i;
    reactions[id] = {
      action: "nope",
      at: 1,
      anime: { id, title: "", genres: [] },
    };
  }
  return reactions;
}
export function seedRecommendationHistory(store) {
  Object.assign(
    store.getSnapshot().reactions,
    unlockedReactions(store.getSnapshot().reactions),
  );
}
