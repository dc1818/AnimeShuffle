/** Viewer opinions, never inferred facts about a title. Unknown/unselected aspects
 * carry no signal. Notes are stored verbatim and are never used as labels. */
export const FEEDBACK_LIMIT = 12;
export const FEEDBACK_GROUPS = [
  {
    key: "visuals",
    label: "Visuals",
    items: ["animation", "art-style", "character-designs", "action-scenes"],
  },
  {
    key: "characters",
    label: "Characters",
    items: [
      "main-character",
      "supporting-cast",
      "villain",
      "character-development",
    ],
  },
  {
    key: "story",
    label: "Story",
    items: [
      "premise",
      "story-progression",
      "relationships",
      "romance",
      "ending",
      "worldbuilding",
      "mystery",
    ],
  },
  {
    key: "pacing",
    label: "Pacing",
    items: ["story-pace", "filler", "episode-structure"],
  },
  {
    key: "tone",
    label: "Tone / humor",
    items: ["humor", "mood", "emotional-impact", "fanservice"],
  },
  {
    key: "music",
    label: "Music / sound",
    items: ["soundtrack", "voice-acting", "sound-design"],
  },
];
// Match only supported structured catalog features, never a word in a synopsis
// as evidence of animation quality or good character writing.
const definitions = [
  ["animation", "Animation", /animation-execution|animation-quality/],
  ["art-style", "Art style", /art-style|visual-style|palette/],
  [
    "character-designs",
    "Character designs",
    /distinctive-design|villain-design|character-design/,
  ],
  [
    "action-scenes",
    "Action scenes",
    /choreograph|stealth-action|martial-technique|inventive-abilities/,
  ],
  ["main-character", "Main character", /protagonist|main-character/],
  ["supporting-cast", "Supporting cast", /supporting-cast|ensemble/],
  ["villain", "Villain / antagonist", /villain|antagonist/],
  [
    "character-development",
    "Character development",
    /character-writing|character-growth|earned-progression/,
  ],
  ["premise", "Premise", /^aspect:|^genre:/],
  [
    "story-progression",
    "Story progression",
    /narrative|serialized|progression/,
  ],
  [
    "relationships",
    "Relationships",
    /relationship|friendship|found-family|romance|romantic/,
  ],
  ["romance", "Romance", /romance|romantic|love-polygon|couple/i],
  ["ending", "Ending", /ending|resolution|conclusion/],
  ["worldbuilding", "Worldbuilding", /rich-world|worldbuilding|world-building/],
  ["mystery", "Mystery", /mystery|intrigue|procedural/i],
  ["story-pace", "Story pace", /pacing|slow-burn|brisk/],
  ["filler", "Filler", /filler/],
  ["episode-structure", "Episode structure", /episodic|serialized/],
  ["humor", "Humor", /humor|comedy|satir|absurd/i],
  ["mood", "Mood", /tone|comfort|bleak|hope|melanchol/],
  ["emotional-impact", "Emotional impact", /emotional|poignan|cathar/],
  ["fanservice", "Fanservice", /fanservice/],
  ["soundtrack", "Soundtrack", /memorable-music|soundtrack/],
  ["voice-acting", "Voice acting", /voice-acting/],
  ["sound-design", "Sound design", /sound-design/],
  ["artwork", "Artwork", /art-style|visual-style|character-design/],
  ["trailer", "Trailer", null],
  ["genre", "Genre", /^genre:/],
  ["length", "Length", /^length:/],
];
export const FEEDBACK_ASPECTS = definitions.map(([key, label, pattern]) => ({
  key,
  label,
  pattern,
}));
export const FEEDBACK_BY_KEY = new Map(FEEDBACK_ASPECTS.map((a) => [a.key, a]));
export const INTEREST_ASPECTS = [
  "artwork",
  "premise",
  "trailer",
  "genre",
  "length",
];
const seenKeys = new Set(FEEDBACK_GROUPS.flatMap((g) => g.items));
export const isSeenReaction = (action) => ["good", "bad"].includes(action);
export function normalizeFeedback(value, action) {
  const allowed = isSeenReaction(action)
    ? seenKeys
    : new Set(["watch", "nope"].includes(action) ? INTEREST_ASPECTS : []);
  const aspects = new Map();
  for (const a of Array.isArray(value?.aspects)
    ? value.aspects.slice(0, 100)
    : []) {
    if (allowed.has(a?.key) && ["liked", "disliked"].includes(a.sentiment)) {
      if (aspects.has(a.key) || aspects.size < FEEDBACK_LIMIT)
        aspects.set(a.key, { key: a.key, sentiment: a.sentiment });
    }
  }
  return {
    version: 1,
    aspects: [...aspects.values()],
    note:
      typeof value?.note === "string" ? value.note.trim().slice(0, 500) : "",
  };
}
export function feedbackExamples(features, feedback, action) {
  const cleaned = normalizeFeedback(feedback, action);
  const axis = isSeenReaction(action) ? "enjoyment" : "interest";
  const matches = cleaned.aspects
    .map((a) => ({
      ...a,
      features: features.filter(
        ([key]) =>
          !key.startsWith("text:") &&
          FEEDBACK_BY_KEY.get(a.key)?.pattern?.test(key),
      ),
    }))
    .filter((a) => a.features.length);
  // Total extra weight stays bounded, even if someone selects every option.
  return matches.map((a) => ({
    features: a.features,
    enjoyment: 0,
    interest: 0,
    [axis]: (a.sentiment === "liked" ? 0.6 : -0.6) / matches.length,
  }));
}
