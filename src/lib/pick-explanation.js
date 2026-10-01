import { primaryTitle, englishTitle } from "./titles.js";

// These are conservative story connections, not plot summaries inferred from
// genre labels or arbitrary shared words. Every required clue must occur in
// the same synopsis sentence. Negated descriptions are excluded.
const themes = [
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
const positiveCache = new WeakMap();
function positiveRecords(taste) {
  if (!positiveCache.has(taste))
    positiveCache.set(
      taste,
      [...taste.records.values()]
        .filter((r) => r.weight > 0.1)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 400),
    );
  return positiveCache.get(taste);
}
function evidence(anime) {
  if (evidenceCache.has(anime)) return evidenceCache.get(anime);
  const sentences = (anime.synopsis || "")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(
      (s) =>
        !/\b(not|never|without|neither|unlike)\b|no longer|rather than/i.test(
          s,
        ),
    );
  const result = new Map(
    themes.flatMap(([key, description, clues]) => {
      const sentence = sentences.find((s) =>
        clues.every((clue) => clue.test(s)),
      );
      return sentence
        ? [[key, { description, sentence: sentence.trim() }]]
        : [];
    }),
  );
  evidenceCache.set(anime, result);
  return result;
}
const title = (anime) => englishTitle(anime) || primaryTitle(anime);
function personalConnection(record) {
  const name = title(record.anime);
  if (record.source === "favorite") return `${name} is one of your favorites.`;
  if (record.action === "good") return `You liked ${name}.`;
  if (record.action === "watch")
    return `${name} caught your eye for a future watch.`;
  if (record.source === "list" && record.anime.listStatus?.score >= 6)
    return `You rated ${name} ${record.anime.listStatus.score}/10 on MyAnimeList.`;
  const status = record.anime.listStatus?.status;
  if (status === "watching") return `You’re currently watching ${name}.`;
  if (status === "plan_to_watch") return `You’ve planned to watch ${name}.`;
  if (status === "completed") return `You’ve finished ${name}.`;
  return `${name} is another show that caught your interest.`;
}

export function storyConnection(anime, taste) {
  const own = evidence(anime);
  return positiveRecords(taste)
    .filter((r) => r.anime.id !== anime.id)
    .map((record) => {
      const other = evidence(record.anime);
      return {
        record,
        shared: [...own.keys()]
          .filter((key) => other.has(key))
          .map((key) => own.get(key)),
      };
    })
    .filter((match) => match.shared.length)
    .sort(
      (a, b) =>
        b.shared.length - a.shared.length || b.record.weight - a.record.weight,
    )[0];
}

/** The explanation is a supported content comparison, not a claim that a
 * feature caused a particular model score. No settings/artwork contrast is invented. */
export function explainPick(
  anime,
  taste,
  { cold = false, explore = false, mode = "discover" } = {},
) {
  const match = storyConnection(anime, taste);
  if (match) {
    return `${personalConnection(match.record)} Both stories involve ${match.shared
      .slice(0, 2)
      .map((t) => t.description)
      .join(" and ")}.`;
  }
  const positive = positiveRecords(taste).filter(
    (r) => r.anime.id !== anime.id,
  );
  const studioMatch = positive.find((r) =>
    (anime.studios || []).some((s) => r.anime.studios?.includes(s)),
  );
  if (studioMatch) {
    const studios = (anime.studios || []).filter((s) =>
      studioMatch.anime.studios?.includes(s),
    );
    return `${personalConnection(studioMatch)} This is another production from ${studios.join(" and ")}.`;
  }
  const genres = (anime.genres || [])
    .filter((g) => (taste.genres.get(g)?.sum || 0) > 0)
    .sort((a, b) => taste.genres.get(b).sum - taste.genres.get(a).sum)
    .slice(0, 2);
  if (genres.length) {
    const related = positive
      .filter((r) => genres.some((g) => r.anime.genres?.includes(g)))
      .sort((a, b) => b.weight - a.weight)[0];
    return `${related ? personalConnection(related) + " " : ""}This pick follows your interest in ${genres.join(" and ")}. There isn’t a specific story parallel to point to from the available descriptions.`;
  }
  if (cold) return "A starting point while we get to know your taste.";
  if (explore)
    return "A change of pace from your usual picks—something to try outside your familiar favorites.";
  return mode === "recommendations"
    ? "This is a tentative pick. A few more choices in Discover will help find closer matches."
    : "Something new to try while we get a better feel for what you like.";
}
