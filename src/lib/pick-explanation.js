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
        .filter(
          (r) =>
            r.weight > 0.1 &&
            (!taste.model?.trainedIds ||
              taste.model.trainedIds.has(r.anime.id)),
        )
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

/** Combine genuine positive score contributions with concrete examples from
 * the training history. Shared metadata alone never earns a positive rationale. */
export function explainPick(
  anime,
  taste,
  {
    cold = false,
    explore = false,
    mode = "discover",
    tier,
    varietyAdjusted = false,
  } = {},
) {
  if (cold) return "A starting point while we get to know your taste.";
  const analysis = taste.model?.explain(anime);
  if (!analysis)
    return "More choices in Discover will help us find a personal match.";
  const contributing = (prefix) =>
    analysis.contributions
      .filter((c) => c.key.startsWith(prefix + ":") && c.contribution > 0.00001)
      .sort((a, b) => b.contribution - a.contribution)
      .map((c) => c.key.slice(prefix.length + 1));
  const genres = contributing("genre").slice(0, 3);
  const studios = contributing("studio");
  const positive = positiveRecords(taste).filter(
    (r) => r.anime.id !== anime.id,
  );
  const parts = [],
    mentioned = new Set();
  const introduce = (record) => {
    if (!mentioned.has(record.anime.id)) {
      parts.push(personalConnection(record));
      mentioned.add(record.anime.id);
    }
  };
  const match = storyConnection(anime, taste);
  const words = contributing("text");
  const supportedThemes =
    match?.shared.filter((theme) =>
      words.some(
        (word) =>
          new RegExp("\\b" + word + "\\b", "i").test(theme.sentence) &&
          new RegExp("\\b" + word + "\\b", "i").test(
            match.record.anime.synopsis || "",
          ),
      ),
    ) || [];
  if (match && analysis.groups.text > 0.00001 && supportedThemes.length) {
    introduce(match.record);
    parts.push(
      `Both stories involve ${supportedThemes
        .slice(0, 2)
        .map((t) => t.description)
        .join(" and ")}.`,
    );
  }
  if (genres.length && analysis.groups.genre > 0.00001) {
    const related = positive
      .map((record) => ({
        record,
        shared: genres.filter((g) => record.anime.genres?.includes(g)),
      }))
      .filter((r) => r.shared.length)
      .sort(
        (a, b) =>
          b.shared.length - a.shared.length ||
          b.record.weight - a.record.weight,
      )[0];
    if (related) {
      const already = mentioned.has(related.record.anime.id);
      if (!already) introduce(related.record);
      parts.push(
        `The ${related.shared.join(" and ")} mix you found in ${title(related.record.anime)} is part of the appeal here${genres.filter((g) => !related.shared.includes(g)).length ? `, along with your interest in ${genres.filter((g) => !related.shared.includes(g)).join(" and ")}` : ""}.`,
      );
    } else
      parts.push(
        `Your interest in ${genres.join(" and ")} makes this a promising pick.`,
      );
  }
  if (studios.length && analysis.groups.studio > 0.00001) {
    const related = positive.find((r) =>
      studios.some((studio) => r.anime.studios?.includes(studio)),
    );
    if (related) {
      const shared = studios.filter((studio) =>
        related.anime.studios?.includes(studio),
      );
      const already = mentioned.has(related.anime.id);
      if (!already) introduce(related);
      parts.push(
        `${shared.join(" and ")} also made ${title(related.anime)}, so the studio is another connection.`,
      );
    }
  }
  if (mode === "recommendations" && analysis.groups.format > 0.00001) {
    const formats = {
      tv: "TV series",
      ona: "web series",
      movie: "movies",
      ova: "OVAs",
      special: "specials",
      music: "music videos",
    };
    if (formats[anime.format])
      parts.push(
        `You’ve also tended to respond well to ${formats[anime.format]}.`,
      );
  }
  if (!parts.length) {
    if (explore)
      return "A change of pace from your usual picks—something to try outside your familiar favorites.";
    return "This is a tentative pick. A few more choices in Discover will help find closer matches.";
  }
  if (
    mode === "recommendations" &&
    tier === 1 &&
    taste.model.score(anime).score > 0
  )
    parts.push(
      "Together, these connections make it your strongest overall match in this batch.",
    );
  else if (mode === "recommendations" && varietyAdjusted)
    parts.push("It also brings a different mix of genres to your shortlist.");
  if (explore)
    parts.unshift("A change of pace, with a few familiar connections.");
  return parts.join(" ");
}
