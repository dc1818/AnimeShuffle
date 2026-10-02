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
  // Only explain aspects that made a positive contribution to this exact score.
  // Multiple liked examples support a tentative pattern; never invent a favorite villain.
  const ownNarrative = narrativeFeatures(anime);
  for (const key of contributing("aspect").slice(0, 2)) {
    const aspect = ownNarrative.aspects.get(key);
    const related = positive.filter((r) =>
      narrativeFeatures(r.anime).aspects.has(key),
    );
    if (!aspect || !related.length) continue;
    const enjoyed = related.filter((r) => r.enjoyment > 0.4);
    const anchor = enjoyed[0] || related[0];
    introduce(anchor);
    if (enjoyed.length >= 2)
      parts.push(
        `A few shows you liked have ${aspect.description}. That thread runs through this story too, which could be part of what appeals to you.`,
      );
    else if (enjoyed.length)
      parts.push(
        `Here, the story involves ${aspect.description}, a thread it has in common with ${title(anchor.anime)}. If that was part of what you enjoyed, this may appeal too.`,
      );
    else
      parts.push(
        `It also involves ${aspect.description}. If that was what caught your eye in the show you saved, this could be worth trying next.`,
      );
  }
  // Review prose never reaches the UI. Only allowlisted, non-plot attributes
  // with multi-review support and an actual positive model contribution qualify.
  const ownReviews = reviewTraits(anime);
  for (const key of contributing("review").slice(0, 2)) {
    const cue = ownReviews.get(key);
    const related = positive.filter((r) => reviewTraits(r.anime).has(key));
    if (!cue || !related.length) continue;
    const anchor = related.find((r) => r.enjoyment > 0.4) || related[0];
    introduce(anchor);
    parts.push(
      `Several MAL reviewers describe ${cue.description}. That also comes up in reviews of ${title(anchor.anime)}. ${anchor.enjoyment > 0.4 ? "If that was part of its appeal for you, this may be worth a look." : "Since that show is still a prospective choice, this is a tentative connection."}`,
    );
  }
  const communityLinks = contributing("community").map(Number);
  const neighbor = positive.find(
    (r) =>
      r.enjoyment > 0.4 &&
      communityLinks.includes(r.anime.id) &&
      anime.communityTaste?.some(
        (n) => n.id === r.anime.id && n.support >= 5 && n.affinity > 0,
      ),
  );
  if (neighbor && analysis.groups.community > 0.00001) {
    introduce(neighbor);
    parts.push(
      `Across other Anime Shuffle accounts, reactions to this title tend to line up with reactions to ${title(neighbor.anime)}. That adds a small supporting connection to your own choices.`,
    );
  }
  const mechContribution = analysis.contributions.find(
    (c) => c.key === "mecha:" + ownNarrative.focus,
  );
  if (
    mechContribution?.contribution > 0.00001 &&
    ownNarrative.focus !== "unspecified"
  ) {
    const liked = positive.filter(
      (r) =>
        r.enjoyment > 0.4 &&
        narrativeFeatures(r.anime).focus === ownNarrative.focus,
    );
    const avoidedCentral = [...taste.records.values()].some(
      (r) =>
        (r.enjoyment < -0.4 || r.interest < -0.4) &&
        narrativeFeatures(r.anime).focus === "central",
    );
    if (liked.length && ownNarrative.focus === "mixed" && avoidedCentral)
      parts.push(
        "Your choices suggest mechs can work for you when other story threads matter too. This synopsis mixes them with a broader story, rather than making piloted-machine combat the main premise.",
      );
    else if (liked.length && ownNarrative.focus === "central")
      parts.push(
        "Piloted-machine battles are central to the premise, as in a show you liked.",
      );
  }
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
        related.record.enjoyment > 0.4
          ? `Its ${related.shared.join(" and ")} side is another link to ${title(related.record.anime)}, though sharing genres doesn’t guarantee the same experience.`
          : `If the ${related.shared.join(" and ")} side of ${title(related.record.anime)} is what caught your eye, this could be worth a try. You haven’t marked that show as liked, so this is an early suggestion.`,
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
        `It also fits the ${formats[anime.format]} you’ve been choosing.`,
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
