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
// Additional focused opinions. These are viewer preferences, never inferred facts.
FEEDBACK_GROUPS.find((g) => g.key === "visuals").items.push(
  "expressive-faces",
  "background-art",
  "lighting",
  "visual-direction",
);
FEEDBACK_GROUPS.find((g) => g.key === "characters").items.push(
  "character-chemistry",
  "complex-motivations",
  "relatable-characters",
  "character-banter",
);
FEEDBACK_GROUPS.find((g) => g.key === "story").items.push(
  "plot-twists",
  "foreshadowing",
  "satisfying-payoffs",
);
FEEDBACK_GROUPS.find((g) => g.key === "pacing").items.push(
  "slow-burn",
  "brisk-pacing",
  "quiet-moments",
);
FEEDBACK_GROUPS.find((g) => g.key === "music").items.push(
  "opening-ending",
  "music-timing",
);
FEEDBACK_GROUPS.push(
  {
    key: "relationships",
    label: "Relationships",
    items: [
      "friendship",
      "found-family",
      "romantic-chemistry",
      "rivalries",
      "mentorship",
      "family-bonds",
    ],
  },
  {
    key: "action",
    label: "Action / tension",
    items: [
      "fight-choreography",
      "tactical-battles",
      "creative-powers",
      "high-stakes",
      "suspense",
    ],
  },
  {
    key: "world",
    label: "World / setting",
    items: [
      "worldbuilding",
      "world-rules",
      "sense-of-place",
      "lore",
      "exploration",
    ],
  },
  {
    key: "themes",
    label: "Themes / meaning",
    items: [
      "moral-dilemmas",
      "identity",
      "growing-up",
      "grief-healing",
      "social-commentary",
      "hope-resilience",
    ],
  },
  {
    key: "comedy",
    label: "Comedy",
    items: [
      "dry-humor",
      "absurd-comedy",
      "comic-timing",
      "visual-comedy",
      "running-jokes",
    ],
  },
);
export const CUSTOM_REASON_LENGTH = 200;
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
const focusedDefinitions = [
  ["expressive-faces", "Expressive faces", /expressive.*animation/],
  ["background-art", "Background artwork", /background-art/],
  ["lighting", "Lighting / color", /palette|lighting/],
  [
    "visual-direction",
    "Visual storytelling",
    /visual-storytelling|cinematograph/,
  ],
  ["character-chemistry", "Cast chemistry", /character-chemistry/],
  [
    "complex-motivations",
    "Complex motivations",
    /villain-motivation|complex-motivation/,
  ],
  ["relatable-characters", "Relatable characters", null],
  ["character-banter", "Character banter", /banter/],
  ["plot-twists", "Plot twists", /plot-twist/],
  ["foreshadowing", "Foreshadowing", /foreshadow/],
  ["satisfying-payoffs", "Satisfying payoffs", /payoff|resolution/],
  ["slow-burn", "Slow-burn development", /slow-burn/],
  ["brisk-pacing", "Brisk pacing", /brisk/],
  ["quiet-moments", "Room to breathe", /quiet-moment|contemplative/],
  ["opening-ending", "Opening / ending songs", null],
  ["music-timing", "Music at the right moment", null],
  ["friendship", "Supportive friendships", /friendship/],
  ["found-family", "Found family", /found-family/],
  ["romantic-chemistry", "Romantic chemistry", /romantic-chemistry/],
  ["rivalries", "Compelling rivalries", /rivalry|rivalries/],
  ["mentorship", "Mentor / student bonds", /mentor/],
  ["family-bonds", "Family relationships", /family-bond|family-relationship/],
  ["fight-choreography", "Fight choreography", /choreograph|martial-technique/],
  ["tactical-battles", "Tactical battles", /tactical|strategic-combat/],
  ["creative-powers", "Creative abilities", /inventive-abilities/],
  ["high-stakes", "Meaningful stakes", /high-stakes/],
  ["suspense", "Building suspense", /suspense|tension/],
  ["world-rules", "Consistent world rules", /rule-based-powers/],
  ["sense-of-place", "Atmosphere of the setting", null],
  ["lore", "Lore / history", /lore/],
  ["exploration", "Discovery / exploration", /exploration/],
  ["moral-dilemmas", "Moral dilemmas", /moral-dilemma/],
  ["identity", "Identity / belonging", /identity|belonging/],
  ["growing-up", "Coming of age", /coming-of-age/],
  ["grief-healing", "Grief / healing", /grief|healing/],
  ["social-commentary", "Social commentary", /social-commentary/],
  ["hope-resilience", "Hope / resilience", /hope|resilien/],
  ["dry-humor", "Dry humor", /dry-humor/],
  ["absurd-comedy", "Absurd comedy", /absurd/],
  ["comic-timing", "Comic timing", null],
  ["visual-comedy", "Visual comedy", /visual-comedy|slapstick/],
  ["running-jokes", "Running jokes", /running-gag/],
];
definitions.push(...focusedDefinitions);
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
  const customReasons = [];
  const customSeen = new Set();
  for (const raw of Array.isArray(value?.customReasons)
    ? value.customReasons.slice(0, 100)
    : []) {
    if (!allowed.size || typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CUSTOM_REASON_LENGTH);
    const key = text.toLocaleLowerCase();
    if (
      !text ||
      customSeen.has(key) ||
      customReasons.length + aspects.size >= FEEDBACK_LIMIT
    )
      continue;
    customSeen.add(key);
    customReasons.push(text);
  }
  return {
    version: 1,
    aspects: [...aspects.values()],
    ...(customReasons.length ? { customReasons } : {}),
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
