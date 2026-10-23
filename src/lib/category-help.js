import glossary from "./category-glossary.json" with { type: "json" };

// Editorial reading help only: never used to assign anime tags or score recommendations.
export const categoryDefinition = (node) =>
  glossary[node?.id] ||
  node?.definition ||
  "A definition is not available for this category yet.";
export const categoryNotes = {
  "real-robot": {
    points: [
      "Machines have operational limits and practical constraints.",
      "Military deployment and tactics often shape the conflict.",
    ],
    note: "This is a storytelling convention, not a promise of scientific accuracy.",
  },
  seinen: {
    note: "An audience label, not an age rating. It does not necessarily mean dark, violent or explicit.",
  },
  shounen: {
    note: "An audience label, not a synonym for action or battles. Viewers of any gender can enjoy these works.",
  },
  josei: {
    note: "An audience label, not a synonym for romance. Viewers of any gender can enjoy these works.",
  },
};
