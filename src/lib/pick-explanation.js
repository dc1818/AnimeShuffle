import { nuancedTraits } from "./nuanced-taste.js";
import { genreLabel } from "./genres.js";
import { reviewTraits } from "./taste-traits.js";
import {
  storyAspects as evidence,
  narrativeFeatures,
} from "./story-aspects.js";
import { primaryTitle, englishTitle } from "./titles.js";

const positiveCache = new WeakMap();
function positiveRecords(taste) {
  if (!positiveCache.has(taste))
    positiveCache.set(
      taste,
      [...taste.records.values()]
        .filter(
          (r) =>
            r.weight > 0 &&
            (!taste.model?.trainedIds ||
              taste.model.trainedIds.has(r.anime.id)),
        )
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 400),
    );
  return positiveCache.get(taste);
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

export function continuationConnection(anime, taste) {
  const best = (taste.model?.continuations?.(anime) || [])
    .filter((match) => match.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)[0];
  return best ? taste.records.get(best.id) : null;
}

export function continuationReason(record) {
  const name = title(record.anime);
  if (record.action === "good" || record.source === "favorite")
    return `A follow-up to ${name}, which you liked.`;
  if (record.source === "list" && record.anime.listStatus?.score >= 7)
    return `A follow-up to ${name}, which you rated highly.`;
  return `A follow-up to ${name}, another entry in your viewing history.`;
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

// Closely related features may help ranking separately, but should be described
// only once. These families are editorial deduplication, not scoring weights.
const family = (key) =>
  ({
    "animation-execution": "animation-craft",
    "character-writing": "character-depth",
    "memorable-music": "soundtrack-craft",
    "rich-world": "worldbuilding",
    "political-intrigue": "intrigue",
    "moral-dilemmas": "moral",
    "fluid-combat": "combat-choreography",
    "deadpan-comedy": "dry-humor",
    "absurdist-comedy": "absurd-comedy",
    "outcast-ascent": "underdog",
    "established-couple": "established-romance",
    "soundtrack-atmosphere": "atmospheric-music",
    "strategic-action": "tactics",
    "episodic-style": "episodic",
    "gradual-romance": "slow-romance",
    "moral-ambiguity": "moral",
    "absurd-humor": "absurd-comedy",
    "dark-humor": "dark-comedy",
    brisk: "fast-pace",
    comfort: "warmth",
    subtext: "character-depth",
  })[key] || key;
const naturalDescription = (key, description) =>
  ({
    survival: "a struggle to stay alive against a deadly threat",
    friendship: "friendships that become a source of support",
    "high-stakes": "conflicts with large-scale consequences",
    growth: "characters growing in confidence and finding their place",
    tactics: "battles decided through planning and strategy",
  })[key] || description;
function connectionClause(record) {
  if (record.source === "favorite") return "one of your favorites";
  if (record.action === "good") return "which you marked Good";
  if (record.action === "watch") return "which you saved for a future watch";
  const status = record.anime.listStatus;
  if (status?.score >= 6)
    return `which you rated ${status.score}/10 on MyAnimeList`;
  return (
    {
      watching: "which you’re currently watching",
      plan_to_watch: "which you’ve planned to watch",
      completed: "which you’ve finished",
    }[status?.status] || "another show that caught your interest"
  );
}
const join = (values) =>
  values.length <= 2
    ? values.join(" and ")
    : values.slice(0, -1).join(", ") + ", and " + values.at(-1);

/** Compose a small set of distinct, positively contributing reasons. Raw review
 * prose never reaches this function; all review descriptions are allowlisted. */
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
  const continuation = continuationConnection(anime, taste);
  if (cold)
    return continuation
      ? continuationReason(continuation) +
          " Your reaction and watchlist save apply to this entry separately."
      : "A starting point while we get to know your taste.";
  const analysis = taste.model?.explain(anime);
  if (!analysis)
    return "More choices in Discover will help us find a personal match.";
  const contributing = (prefix) =>
    analysis.contributions
      .filter((c) => c.key.startsWith(prefix + ":") && c.contribution > 0.00001)
      .sort((a, b) => b.contribution - a.contribution)
      .map((c) => c.key.slice(prefix.length + 1));
  const positive = positiveRecords(taste).filter(
    (r) => r.anime.id !== anime.id,
  );
  const own = narrativeFeatures(anime);
  const used = new Set(),
    mentioned = new Set(),
    groups = new Map(),
    parts = [];
  if (continuation) {
    parts.push(continuationReason(continuation));
    mentioned.add(continuation.anime.id);
  }
  const nuances = nuancedTraits(anime);
  const nuanceKeys = [
    ...new Set([
      ...contributing("nuance"),
      ...contributing("nuanceblend").flatMap((k) => k.split(":")),
      ...(analysis.neighbors || [])
        .filter((n) => n.contribution > 0)
        .flatMap((n) => n.keys),
    ]),
  ];
  const nuanceMatches = positive
    .map((record) => ({
      record,
      keys: nuanceKeys.filter(
        (k) => nuances.has(k) && nuancedTraits(record.anime).has(k),
      ),
    }))
    .filter((m) => m.keys.length)
    .sort(
      (a, b) =>
        b.keys.length - a.keys.length || b.record.weight - a.record.weight,
    );
  if (nuanceMatches.length) {
    const { record, keys } = nuanceMatches[0];
    const chosen = keys.slice(0, 2),
      descriptions = chosen.map((k) => nuances.get(k).description);
    const reviewBased = chosen.some((k) => nuances.get(k).source === "reviews");
    parts.push(personalConnection(record));
    parts.push(
      `${reviewBased ? "Reviewers point to" : "The connection here is"} ${join(descriptions)}${reviewBased ? ", a combination also described in that show" : "—qualities also present in that show"}.`,
    );
    for (const k of chosen) used.add(family(k));
    mentioned.add(record.anime.id);
    const contrast = chosen.find((k) =>
      ["mecha-incidental", "romance-subplot", "chibi-gags"].includes(k),
    );
    const opposing = {
      "mecha-incidental": "mecha-central",
      "romance-subplot": "romance-central",
      "chibi-gags": "chibi-dominant",
    }[contrast];
    if (
      opposing &&
      [...taste.records.values()].filter(
        (r) =>
          (r.enjoyment < -0.4 || r.interest < -0.4) &&
          nuancedTraits(r.anime).has(opposing),
      ).length >= 2
    )
      parts.push(
        "Your choices have leaned away from shows where that element takes over; here it plays a smaller part.",
      );
  }
  let storyCount = 0;
  function addStory(key, aspect, related) {
    if (!aspect || !related.length || used.has(family(key)) || storyCount >= 3)
      return;
    const enjoyed = related.filter((r) => r.enjoyment > 0.4);
    const candidates = enjoyed.length ? enjoyed : related;
    const anchor =
      candidates.find((r) => groups.has(r.anime.id)) || candidates[0];
    if (
      !groups.has(anchor.anime.id) &&
      groups.size >= (nuanceMatches.length ? 1 : 2)
    )
      return;
    const group = groups.get(anchor.anime.id) || { anchor, descriptions: [] };
    if (group.descriptions.length >= 2) return;
    group.descriptions.push(naturalDescription(key, aspect.description));
    groups.set(anchor.anime.id, group);
    used.add(family(key));
    storyCount++;
  }
  for (const key of contributing("aspect"))
    addStory(
      key,
      own.aspects.get(key),
      positive.filter((r) => evidence(r.anime).has(key)),
    );

  // Lexical overlap can fill a missing reason, never restate an aspect already used.
  const words = contributing("text");
  if (analysis.groups.text > 0.00001)
    for (const [key, aspect] of own.aspects) {
      const related = positive.filter(
        (r) =>
          evidence(r.anime).has(key) &&
          words.some(
            (word) =>
              new RegExp("\\b" + word + "\\b", "i").test(aspect.sentence) &&
              new RegExp("\\b" + word + "\\b", "i").test(
                r.anime.synopsis || "",
              ),
          ),
      );
      addStory(key, aspect, related);
    }
  for (const { anchor, descriptions } of groups.values()) {
    if (!parts.length) {
      parts.push(personalConnection(anchor));
      parts.push(`This also involves ${join(descriptions)}.`);
    } else {
      parts.push(
        `Another connection to ${title(anchor.anime)}, ${connectionClause(anchor)}, is ${join(descriptions)}.`,
      );
    }
    mentioned.add(anchor.anime.id);
  }

  const reviews = reviewTraits(anime),
    reviewGroups = new Map();
  let reviewCount = 0;
  for (const key of contributing("review")) {
    if (reviewCount >= 2 || used.has(family(key))) continue;
    const cue = reviews.get(key);
    const related = positive.filter((r) => reviewTraits(r.anime).has(key));
    if (!cue || !related.length) continue;
    const anchor = related.find((r) => r.enjoyment > 0.4) || related[0];
    const group = reviewGroups.get(anchor.anime.id) || {
      anchor,
      descriptions: [],
    };
    group.descriptions.push(cue.description);
    reviewGroups.set(anchor.anime.id, group);
    used.add(family(key));
    reviewCount++;
  }
  // Merge review descriptions into one sentence per reference, without repeating
  // the same confidence disclaimer after every attribute.
  for (const { anchor, descriptions } of reviewGroups.values()) {
    const context = mentioned.has(anchor.anime.id)
      ? ""
      : `, ${connectionClause(anchor)}`;
    parts.push(
      `MAL reviewers describe ${join(descriptions)} in both this title and ${title(anchor.anime)}${context}.`,
    );
    if (anchor.enjoyment <= 0.4)
      parts.push(
        "That is a tentative connection to something you’re interested in watching.",
      );
    mentioned.add(anchor.anime.id);
  }
  const mech = analysis.contributions.find(
    (c) => c.key === "mecha:" + own.focus,
  );
  if (mech?.contribution > 0.00001 && own.focus !== "unspecified") {
    const liked = positive.some(
      (r) =>
        r.enjoyment > 0.4 && narrativeFeatures(r.anime).focus === own.focus,
    );
    const avoided = [...taste.records.values()].some(
      (r) =>
        (r.enjoyment < -0.4 || r.interest < -0.4) &&
        narrativeFeatures(r.anime).focus === "central",
    );
    if (liked && own.focus === "mixed" && avoided)
      parts.push(
        "Your choices suggest mechs work better for you as part of a broader story. That is how they appear in this premise, rather than making piloted-machine combat its main focus.",
      );
    else if (liked && own.focus === "central")
      parts.push(
        "Piloted-machine battles are central here, as in a show you liked.",
      );
  }
  const genres = contributing("genre").slice(0, 3);
  if (
    genres.length &&
    analysis.groups.genre > 0.00001 &&
    storyCount < 2 &&
    reviewCount < 2
  ) {
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
      if (!mentioned.has(related.record.anime.id))
        parts.push(personalConnection(related.record));
      parts.push(
        `Its ${join(related.shared.map(genreLabel))} mix is another reason it may suit you.`,
      );
      mentioned.add(related.record.anime.id);
    } else
      parts.push(`It fits your interest in ${join(genres.map(genreLabel))}.`);
  }
  const studios = contributing("studio");
  if (studios.length && analysis.groups.studio > 0.00001) {
    const anchor = positive.find((r) =>
      studios.some((studio) => r.anime.studios?.includes(studio)),
    );
    if (anchor) {
      const names = join(
        studios.filter((studio) => anchor.anime.studios?.includes(studio)),
      );
      parts.push(
        `${names} also made ${title(anchor.anime)}${mentioned.has(anchor.anime.id) ? "" : ", " + connectionClause(anchor)}.`,
      );
      mentioned.add(anchor.anime.id);
    }
  }
  const community = contributing("community").map(Number);
  const neighbor = positive.find(
    (r) =>
      r.enjoyment > 0.4 &&
      community.includes(r.anime.id) &&
      anime.communityTaste?.some(
        (n) => n.id === r.anime.id && n.support >= 5 && n.affinity > 0,
      ),
  );
  if (neighbor && analysis.groups.community > 0.00001)
    parts.push(
      `Choices from other Anime Shuffle accounts also connect this title with ${title(neighbor.anime)}.`,
    );
  if (!parts.length)
    return explore
      ? "A change of pace from your usual picks—something to try outside your familiar favorites."
      : "This is a tentative pick. A few more choices in Discover will help find closer matches.";
  if (
    mode === "recommendations" &&
    tier === 1 &&
    taste.model.score(anime).score > 0
  )
    parts.push("It’s your strongest overall match in this batch.");
  else if (mode === "recommendations" && varietyAdjusted)
    parts.push("It also brings a different mix to your shortlist.");
  if (explore)
    parts.unshift("A change of pace, with a few familiar connections.");
  return parts.join(" ");
}
