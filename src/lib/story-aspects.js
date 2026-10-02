import { synopsisTraits } from "./taste-traits.js";
// These are conservative story connections, not plot summaries inferred from
// genre labels or arbitrary shared words. Every required clue must occur in
// the same synopsis sentence. Negated descriptions are excluded.
const themes = [
  [
    "fast-pace",
    "a fast-paced or action-packed story",
    [/\b(fast.paced|action.packed|non.stop action)\b/i],
  ],
  [
    "reflective",
    "a reflective, contemplative story",
    [/\b(contemplative|meditative|introspective|reflective journey)\b/i],
  ],
  [
    "nonlinear",
    "a story told through interwoven timelines",
    [
      /\b(nonlinear|non.linear|interwoven timelines|multiple timelines|out of chronological order)\b/i,
    ],
  ],
  [
    "surreal",
    "surreal or dreamlike events",
    [
      /\b(surreal|dreamlike|dream.like)\b/i,
      /\b(world|journey|events|experience|story|reality)\b/i,
    ],
  ],

  // A practical, extensible set of tastes, inspired by multidimensional content
  // tagging and affect-aware recommendation. No rule claims a viewer’s mood,
  // visual quality, pacing, or a character preference without supporting data.
  [
    "friendship",
    "friendships becoming a source of support",
    [
      /\b(friends?|friendship|companions?|bond\w*)\b/i,
      /\b(support\w*|trust\w*|help\w*|together|close|loyal\w*)\b/i,
    ],
  ],
  [
    "found-family",
    "outsiders forming a family of their own",
    [/\b(found family|family of their own|family they never|like a family)\b/i],
  ],
  [
    "growth",
    "someone growing in confidence or finding their place",
    [
      /\b(confidence|self-discovery|find\w* (?:their|his|her) (?:place|purpose)|coming.of.age|grow\w* as a person)\b/i,
    ],
  ],
  [
    "mentorship",
    "a mentor helping someone develop their abilities",
    [
      /\b(mentor\w*|master|teacher)\b/i,
      /\b(train\w*|teach\w*|guide\w*|learn\w*|apprentice)\b/i,
    ],
  ],
  [
    "underdog",
    "an underdog trying to prove themselves",
    [
      /\b(underdog|weakest|powerless|outcast|no talent|without (?:powers?|talent))\b/i,
      /\b(prove|overcome|become|dream\w*|determined|strive\w*)\b/i,
    ],
  ],
  [
    "redemption",
    "someone trying to make up for past mistakes",
    [/\b(redemption|redeem\w*|atone\w*|make amends)\b/i],
  ],
  [
    "antihero",
    "a lead whose methods put them at odds with conventional heroes",
    [
      /\b(anti.?hero|morally (?:gray|grey)|ruthless protagonist|criminal protagonist)\b/i,
    ],
  ],
  [
    "trust-betrayal",
    "trust being tested by betrayal",
    [
      /\b(betray\w*|traitor|treachery)\b/i,
      /\b(friends?|allies|ally|trust\w*|team|companions?)\b/i,
    ],
  ],
  [
    "adult-life",
    "adults dealing with work and everyday responsibilities",
    [
      /\b(workplace|office|colleagues?|coworkers?|salaryman|career)\b/i,
      /\b(daily|everyday|relationships?|balance|life|struggle\w*)\b/i,
    ],
  ],
  [
    "quiet-life",
    "a quieter story about everyday life",
    [
      /\b(peaceful|tranquil|relax\w*|leisurely|gentle|laid.back)\b/i,
      /\b(daily|everyday|life|town|village|countryside|routine)\b/i,
    ],
  ],
  [
    "warmth",
    "people finding comfort and connection",
    [
      /\b(heartwarming|comfort\w*|heal\w*|warmth|kindness)\b/i,
      /\b(friend\w*|family|life|people|community|bond\w*)\b/i,
    ],
  ],
  [
    "absurd-comedy",
    "absurd situations and comic misunderstandings",
    [
      /\b(absurd|ridiculous|hilarious|comical|slapstick|misunderstanding\w*)\b/i,
      /\b(situation\w*|antics|adventures?|life|chaos|comedy)\b/i,
    ],
  ],
  [
    "dark-comedy",
    "comedy mixed with darker subject matter",
    [
      /\b(dark (?:comedy|humou?r)|black (?:comedy|humou?r)|morbid (?:comedy|humou?r))\b/i,
    ],
  ],
  [
    "psychological",
    "characters struggling with perception or psychological pressure",
    [
      /\b(psychological|paranoia|hallucinat\w*|sanity|mental torment)\b/i,
      /\b(pressure|struggle\w*|reality|mind|fear|break\w*|question\w*)\b/i,
    ],
  ],
  [
    "horror-atmosphere",
    "an unsettling threat and a sense of dread",
    [
      /\b(terrifying|dread|nightmar\w*|horror|sinister|eerie)\b/i,
      /\b(threat|presence|encounter\w*|curse\w*|creature\w*|happen\w*|fear|haunt\w*)\b/i,
    ],
  ],
  [
    "high-stakes",
    "a conflict with large-scale consequences",
    [
      /\b(fate of (?:the world|humanity)|save (?:the world|humanity)|destroy (?:the world|humanity)|humanity.s (?:last|survival)|extinction)\b/i,
    ],
  ],
  [
    "personal-stakes",
    "a goal built around someone’s personal life",
    [
      /\b(dream\w*|goal|ambition|determined)\b/i,
      /\b(career|family|friend\w*|school|love|artist|musician|chef|writer)\b/i,
    ],
  ],
  [
    "world-discovery",
    "exploring an unfamiliar world and its secrets",
    [
      /\b(explor\w*|journey|expedition|discover\w*)\b/i,
      /\b(unknown lands|unfamiliar world|ancient ruins|lost civilization|uncharted|secrets of (?:the|this) world)\b/i,
    ],
  ],
  [
    "historical",
    "life or conflict in a historical setting",
    [
      /\b(feudal|edo period|meiji|medieval|sengoku|historical|nineteenth.century|19th.century)\b/i,
    ],
  ],
  [
    "dystopia",
    "life under an oppressive future society",
    [/\b(dystopia\w*|totalitarian|surveillance state)\b/i],
  ],
  [
    "school-life",
    "relationships and everyday experiences at school",
    [
      /\b(school|classmates?|students?|school club)\b/i,
      /\b(daily|everyday|friendship\w*|relationships?|club activities)\b/i,
    ],
  ],
  [
    "craft",
    "people developing a craft or creative skill",
    [
      /\b(cook\w*|chef|artist\w*|paint\w*|manga artist|writer|craft\w*)\b/i,
      /\b(skill\w*|learn\w*|create\w*|improv\w*|dream\w*|career|ambition)\b/i,
    ],
  ],
  [
    "episodic",
    "separate stories or cases rather than one continuous plot",
    [
      /\b(anthology|self.contained (?:stories|episodes)|standalone (?:stories|episodes)|each episode|different case each)\b/i,
    ],
  ],
  [
    "slow-romance",
    "a relationship that develops gradually",
    [
      /\b(gradually|slowly|over time|slow.burn)\b/i,
      /\b(love|romance|romantic|feelings|relationship)\b/i,
    ],
  ],
  [
    "established-romance",
    "a couple navigating an existing relationship",
    [
      /\b(married couple|newlyweds|already dating|their marriage|their relationship)\b/i,
      /\b(life|navigate\w*|challenge\w*|adjust\w*|together)\b/i,
    ],
  ],

  [
    "antagonists",
    "an adversary whose plans drive the conflict",
    [
      /\b(villains?|antagonists?|nemesis|archenemy|enemy|enemies|criminal organization)\b/i,
      /\b(schemes?|plots?|plans?|pursu\w*|relentless|mastermind|ambition|ruthless|league|organization)\b/i,
    ],
  ],
  [
    "rivalry",
    "a rivalry that pushes the characters forward",
    [
      /\b(rival\w*|nemesis)\b/i,
      /\b(challeng\w*|compete\w*|surpass\w*|defeat\w*|duel\w*|ambition)\b/i,
    ],
  ],
  [
    "moral",
    "characters facing difficult moral choices",
    [
      /\b(moral\w*|justice|ethics?|right and wrong|innocent|guilt\w*)\b/i,
      /\b(dilemma|question\w*|sacrifice\w*|conflict\w*|choice\w*|corrupt\w*|cost)\b/i,
    ],
  ],
  [
    "intrigue",
    "political schemes and struggles for power",
    [
      /\b(political|government|empire|throne|ruler\w*)\b/i,
      /\b(conspir\w*|scheme\w*|betray\w*|coup|power struggle|manipulat\w*)\b/i,
    ],
  ],
  [
    "tactics",
    "battles decided through planning and strategy",
    [
      /\b(strategy|strategic|tactics?|outwit\w*|mind games)\b/i,
      /\b(battles?|fight\w*|opponent\w*|enemy|enemies|contest|win\w*)\b/i,
    ],
  ],

  [
    "survival",
    "people struggling to stay alive against a deadly threat",
    [
      /\b(surviv\w*|extinction|humanity|mankind)\b/i,
      /\b(monsters?|titans?|demons?|creatures?|zombies?|apocalypse|destroy\w*|annihilat\w*|devour\w*|deadly|death)\b/i,
    ],
  ],
  [
    "revenge",
    "someone pursuing revenge",
    [/\b(revenge|vengeance|avenge\w*)\b/i],
  ],
  [
    "military",
    "soldiers caught up in an armed conflict",
    [
      /\b(soldiers?|military|army|armies|troops)\b/i,
      /\b(war|battle\w*|combat|fight\w*|invasion|invad\w*)\b/i,
    ],
  ],
  [
    "rebellion",
    "resistance against an oppressive power",
    [
      /\b(rebel\w*|rebellion|resistance|overthrow\w*)\b/i,
      /\b(empire|government|regime|ruler|tyrann\w*|oppress\w*)\b/i,
    ],
  ],
  [
    "mystery",
    "an investigation into a crime or disappearance",
    [
      /\b(investigat\w*|detective\w*|clues?|solv\w*)\b/i,
      /\b(murder\w*|crime\w*|disappear\w*|missing|killer\w*)\b/i,
    ],
  ],
  [
    "competition",
    "competitors working toward a tournament or championship",
    [
      /\b(tournament|championship|competition)\b/i,
      /\b(train\w*|team\w*|rival\w*|compet\w*|win\w*|victory)\b/i,
    ],
  ],
  [
    "music",
    "performers chasing an ambition in music",
    [
      /\b(band|musician\w*|pianist\w*|singer\w*|orchestra|idol\w*)\b/i,
      /\b(dream\w*|perform\w*|concert\w*|career|stage|practic\w*)\b/i,
    ],
  ],
  [
    "romance",
    "feelings developing between classmates",
    [
      /\b(classmate\w*|school|student\w*)\b/i,
      /\b(falls? in love|romance|romantic|crush|confess\w*)\b/i,
    ],
  ],
  [
    "otherworld",
    "someone starting over in an unfamiliar world",
    [
      /\b(transport\w*|summon\w*|reincarnat\w*|reborn|trapped)\b/i,
      /\b(another world|different world|fantasy world|game world|virtual world)\b/i,
    ],
  ],
  [
    "time",
    "a chance to change events by going back in time",
    [
      /\b(time travel|travels? back|sent back|returns? to the past|time loop|reliv\w*)\b/i,
      /\b(change|prevent|save|past|repeat\w*|again|tragedy)\b/i,
    ],
  ],
  [
    "supernatural",
    "people confronting supernatural disturbances",
    [
      /\b(ghost\w*|spirits?|supernatural|curse\w*)\b/i,
      /\b(exorcis\w*|haunt\w*|investigat\w*|fight\w*|protect\w*)\b/i,
    ],
  ],
  [
    "space",
    "a journey through space",
    [
      /\b(space|galaxy|planets?|spaceship\w*)\b/i,
      /\b(travel\w*|journey|voyage|explor\w*|crew)\b/i,
    ],
  ],
  [
    "family",
    "people learning to care for a child",
    [
      /\b(child|children|daughter|son|baby)\b/i,
      /\b(adopt\w*|rais\w*|parent\w*|guardian|care for)\b/i,
    ],
  ],
  [
    "loss",
    "someone living with the loss of a loved one",
    [
      /\b(grief|griev\w*|death|died|loss)\b/i,
      /\b(mother|father|sister|brother|wife|husband|friend|family)\b/i,
    ],
  ],
];

const evidenceCache = new WeakMap();
export function storyAspects(anime) {
  if (evidenceCache.has(anime)) return evidenceCache.get(anime);
  const sentences = (anime.synopsis || "")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) =>
        !/\b(no|not|never|without|neither|unlike)\b|no longer|rather than/i.test(
          s.replace(/without (?:powers?|talent)/gi, "powerless"),
        ),
    );
  const result = new Map(
    themes.flatMap(([key, description, clues]) => {
      const matches = sentences.filter((s) =>
        clues.every((clue) => clue.test(s)),
      );
      return matches.length
        ? [
            [
              key,
              {
                description,
                sentence: matches[0].trim(),
                // Relative prominence is a conservative synopsis cue, not a confidence
                // probability or a claim about the proportion of actual screen time.
                strength:
                  0.5 + (0.5 * matches.length) / Math.max(1, sentences.length),
              },
            ],
          ]
        : [];
    }),
  );
  for (const [key, value] of synopsisTraits(anime)) result.set(key, value);
  evidenceCache.set(anime, result);
  return result;
}

const mech =
  /\b(mechs?|mecha|robots?|mobile suits?|gundams?|knightmares?|arm slaves?)\b/i;
const piloting = /\b(pilot\w*|operat\w*|control\w*|manned|cockpit)\b/i;
const combat =
  /\b(battle\w*|combat|war|fight\w*|weapon\w*|defend\w*|invad\w*|invasion)\b/i;
const contextCache = new WeakMap();
/** Distinguish a premise centered on piloted machine combat from mechs embedded
 * in another story. Sparse/ambiguous descriptions remain unknown. A Mecha tag
 * alone does not prove that the whole show revolves around robots. */
export function narrativeFeatures(anime) {
  if (contextCache.has(anime)) return contextCache.get(anime);
  const aspects = storyAspects(anime);
  const features = [...aspects.keys()].map((key) => [
    "aspect:" + key,
    (1.1 * aspects.get(key).strength) / Math.sqrt(aspects.size),
  ]);
  const keys = [...aspects.keys()]
    .sort(
      (a, b) =>
        aspects.get(b).strength - aspects.get(a).strength || a.localeCompare(b),
    )
    .slice(0, 10)
    .sort();
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      features.push([
        `blend:${keys[i]}:${keys[j]}`,
        (0.25 *
          Math.sqrt(
            aspects.get(keys[i]).strength * aspects.get(keys[j]).strength,
          )) /
          Math.sqrt(Math.max(1, keys.length - 1)),
      ]);

  const sentences = (anime.synopsis || "")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) => s.trim() && !/\b(not|never|without|unlike)\b|rather than/i.test(s),
    );
  const mechSentences = sentences.filter((s) => mech.test(s));
  const central = mechSentences.filter(
    (s) => piloting.test(s) && combat.test(s),
  );
  const hasTag = (anime.genres || []).includes("Mecha");
  let focus = null;
  if (central.length && central.length / Math.max(1, sentences.length) >= 0.5)
    focus = "central";
  else if (
    mechSentences.length &&
    aspects.size >= 2 &&
    central.length / sentences.length < 0.5
  )
    focus = "mixed";
  else if (mechSentences.length || hasTag) focus = "unspecified";
  if (focus) {
    features.push(["mecha:" + focus, focus === "unspecified" ? 0.2 : 0.9]);
    // Context interactions let a liked rebellion with mechs differ from machine
    // combat, even though both carry MAL’s Mecha tag.
    if (focus !== "unspecified")
      for (const key of aspects.keys())
        features.push([
          `context:${focus}:${key}`,
          (0.4 * aspects.get(key).strength) / Math.sqrt(aspects.size),
        ]);
  }
  const result = { aspects, focus, features };
  contextCache.set(anime, result);
  return result;
}
