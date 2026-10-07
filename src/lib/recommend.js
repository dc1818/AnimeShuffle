import { normalizeReactionReason } from "./reaction-reasons.js";
import { isNonCanonMovie } from "./movie-continuity.js";
import { primaryTitle, englishTitle } from "./titles.js";
import {
  explainPick,
  explainPickReasons,
  storyConnection,
  continuationConnection,
  continuationReason,
} from "./pick-explanation.js";
import { trainContentModel, terms } from "./content-model.js";
import { normalizePreferences, matchesPreferences } from "./preferences.js";
/**
 * Pure recommendation functions: no network, React, or browser-storage dependencies.
 * Missing numeric scores represent unknown preference, not a zero-star review.
 * Explicit reactions are stronger than signals inferred from MAL list statuses.
 */
export const REACTIONS = ["good", "bad", "watch", "nope"];
/** Preserve absolute score meaning while gently adjusting for established rating habits. */
export function ratingSignal(score, mean = 7, count = 0) {
  if (!Number.isInteger(score) || score < 1 || score > 10) return 0;
  const absolute = (score - 5.5) / 4.5;
  const adjustment =
    (Math.max(-0.15, Math.min(0.15, ((score - mean) / 4.5) * 0.25)) * count) /
    (count + 15);
  return Math.max(-1, Math.min(1, absolute + adjustment));
}
export function preferenceSignals(entry, mean = 7, count = 0) {
  const status = entry.listStatus?.status;
  const rating = ratingSignal(Number(entry.listStatus?.score), mean, count);
  const rated =
    Number(entry.listStatus?.score) >= 1 &&
    Number(entry.listStatus?.score) <= 10;
  return {
    enjoyment: rated
      ? rating
      : { completed: 0.15, dropped: -0.15 }[status] || 0,
    interest:
      { watching: 0.55, plan_to_watch: 0.25, completed: 0.15, dropped: -0.8 }[
        status
      ] || 0,
  };
}
export function preferenceWeight(entry, mean = 7, count = 0) {
  const r = preferenceSignals(entry, mean, count);
  return 0.65 * r.enjoyment + 0.35 * r.interest;
}
/** Merge by ID, then train enjoyment and viewing-interest heads without duplicate votes. */
export function buildTaste(
  reactions = {},
  list = [],
  preferences,
  corpus = [],
  train = true,
) {
  const initial = normalizePreferences(preferences);
  const metadata = new Map(corpus.map((a) => [a.id, a]));
  const enrich = (a) => ({
    ...a,
    ...(metadata.get(a.id) || {}),
    listStatus: a.listStatus,
  });
  const rated = list.filter(
    (a) => a.listStatus?.score >= 1 && a.listStatus?.score <= 10,
  );
  const mean = rated.length
    ? rated.reduce((n, a) => n + a.listStatus.score, 0) / rated.length
    : 7;
  const records = new Map(
    list.map((a) => [
      a.id,
      {
        anime: enrich(a),
        ...preferenceSignals(a, mean, rated.length),
        source: "list",
      },
    ]),
  );
  for (const a of initial.favoriteAnime)
    records.set(a.id, {
      anime: enrich(a),
      enjoyment: 1,
      interest: 0,
      source: "favorite",
    });
  for (const [id, r] of Object.entries(reactions)) {
    const old = records.get(Number(id));
    const status = old?.anime.listStatus?.status;
    if (r.action === "watch" && ["completed", "dropped"].includes(status))
      continue;
    const signals =
      r.action === "good" || r.action === "bad"
        ? { enjoyment: r.action === "good" ? 1 : -1, interest: 0 }
        : {
            // A prospective choice never becomes an enjoyment label.
            enjoyment: 0,
            interest: r.action === "watch" ? 0.4 : -0.8,
          };
    records.set(Number(id), {
      anime: { ...old?.anime, ...enrich(r.anime) },
      ...signals,
      source: "reaction",
      action: r.action,
      reason: normalizeReactionReason(r.reason),
    });
  }
  const genres = new Map(),
    formats = new Map();
  for (const r of records.values()) {
    r.weight = 0.65 * r.enjoyment + 0.35 * r.interest;
    for (const g of r.anime.genres || []) {
      const value = genres.get(g) || { sum: 0, count: 0 };
      value.sum += r.weight / Math.sqrt(r.anime.genres.length);
      value.count++;
      genres.set(g, value);
    }
  }
  for (const g of initial.favoriteGenres) {
    const value = genres.get(g) || { sum: 0, count: 0 };
    value.sum += 0.4;
    value.count++;
    genres.set(g, value);
  }
  const anchors = [...records.values()]
    .filter((r) => r.enjoyment > 0.4)
    .sort((a, b) => b.enjoyment - a.enjoyment || a.anime.id - b.anime.id)
    .slice(0, 50)
    .map((r) => ({ ...r, terms: terms(r.anime) }));
  return {
    records,
    genres,
    formats,
    anchors,
    model: train
      ? trainContentModel(records, initial.favoriteGenres, corpus)
      : null,
  };
}
export function scoreAnime(anime, taste) {
  return taste.model.score(anime).score;
}
function explanation(anime, taste) {
  const continuation = continuationConnection(anime, taste);
  if (continuation) return continuationReason(continuation);
  const analysis = taste.model?.explain(anime);
  const match = storyConnection(anime, taste);
  // Use the same positive features as the full rationale, never mere tag overlap.
  if (
    match &&
    analysis?.contributions.some(
      (c) =>
        c.contribution > 0.00001 &&
        (c.key.startsWith("text:") || c.key.startsWith("aspect:")),
    )
  )
    return `A story connection to ${englishTitle(match.record.anime) || primaryTitle(match.record.anime)}.`;
  const best = (analysis?.contributions || [])
    .filter((c) => c.key.startsWith("genre:") && c.contribution > 0.00001)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map((c) => c.key.slice(6));
  return best.length
    ? `More ${best.join(" and ")} for your watchlist.`
    : "Something a little different to try.";
}
export const detailedExplanation = explainPick;
export const detailedExplanationReasons = explainPickReasons;
function similarity(a, b) {
  const one = new Set(a.genres || []),
    two = new Set(b.genres || []);
  const overlap = [...one].filter((g) => two.has(g)).length;
  return overlap / (new Set([...one, ...two]).size || 1);
}
/** Positive seeds retrieve possible candidates, including tentative watch interest.
 * Retrieval does not promote a plan to confirmed enjoyment; final ranking keeps
 * the two signals separate and excludes every already-known title. */
export function recommendationSeeds(reactions, list, preferences) {
  return [
    ...buildTaste(reactions, list, preferences, [], false).records.values(),
  ]
    .filter((r) => r.weight > 0.05 && r.anime.listStatus?.status !== "dropped")
    .sort((a, b) => b.weight - a.weight || a.anime.id - b.anime.id)
    .map((r) => r.anime);
}
/** Audience preference is about the title, never an inferred age for the viewer.
 * A general-audience rating, art style or young protagonist is not a Kids tag. */
export function isChildrenTitle(anime) {
  return (
    anime.ageRating === "pg" ||
    (anime.genres || []).some((genre) => genre.toLowerCase() === "kids")
  );
}
// This setting deliberately excludes G-rated general-audience works too. G is
// not proof of a children's target audience; it is a conservative user filter.
export function isAudienceFilteredTitle(anime) {
  return anime.ageRating === "g" || isChildrenTitle(anime);
}
function childrenInterest(reactions, list, preferences) {
  let positive = 0,
    confirmed = 0,
    negative = 0;
  const detailedReactions = Object.fromEntries(
    Object.entries(reactions).filter(([, reaction]) => reaction?.anime?.id),
  );
  const { records } = buildTaste(
    detailedReactions,
    list,
    preferences,
    [],
    false,
  );
  for (const r of records.values()) {
    if (!isAudienceFilteredTitle(r.anime)) continue;
    if (r.action === "bad" || r.action === "nope") {
      negative++;
      continue;
    }
    if (r.source === "favorite" || r.action === "good") {
      positive++;
      confirmed++;
      continue;
    }
    // Saves are tentative; one planned title must not open this audience group.
    if (r.action === "watch") {
      positive += 0.25;
      continue;
    }
    const status = r.anime.listStatus?.status;
    const score = Number(r.anime.listStatus?.score) || 0;
    if (status === "dropped" || (score > 0 && score <= 4)) negative++;
    else if (score >= 7) {
      positive += 1;
      confirmed++;
    } else if (["watching", "plan_to_watch"].includes(status) && !score)
      positive += 0.1;
    // Unrated completed shows may be old childhood viewing, not current interest.
  }
  return confirmed >= 2 && positive > 2 * negative;
}

/** Exclude known titles, unsafe/unknown content labels, and unmet direct prequels. */
export function isEligible(
  a,
  reactions,
  list,
  skipped,
  allowPlan = false,
  preferences,
) {
  return eligibilityFilter(reactions, list, skipped, allowPlan, preferences)(a);
}
/** Build membership sets once per candidate batch, rather than once per anime. */
function eligibilityFilter(reactions, list, skipped, allowPlan, preferences) {
  const initial = normalizePreferences(preferences);
  const allowChildren =
    initial.childrenTitles === "include" &&
    childrenInterest(reactions, list, initial);
  const favorites = new Set(initial.favoriteAnime.map((a) => a.id));
  const statuses = new Map(list.map((a) => [a.id, a.listStatus?.status]));
  const seen = new Set(
    list
      .filter((a) => ["completed", "watching"].includes(a.listStatus?.status))
      .map((a) => a.id),
  );
  for (const [id, r] of Object.entries(reactions))
    if (["good", "bad"].includes(r.action)) seen.add(Number(id));
  for (const id of favorites) seen.add(id);
  return (a) => {
    if (
      !a ||
      reactions[a.id] ||
      favorites.has(a.id) ||
      skipped.has(a.id) ||
      (!a.demo &&
        !(initial.includeNsfw
          ? ["white", "gray", "black"].includes(a.nsfw)
          : a.nsfw === "white"))
    )
      return false;
    if (!allowChildren && isAudienceFilteredTitle(a)) return false;
    if (!initial.includeNonCanonMovies && isNonCanonMovie(a)) return false;
    // Selected viewing genres match any one genre, not every selected genre.
    if (
      initial.favoriteGenres.length &&
      !(a.genres || []).some((genre) => initial.favoriteGenres.includes(genre))
    )
      return false;
    if (!matchesPreferences(a, initial)) return false;
    const status = statuses.get(a.id);
    if (status && !(allowPlan && status === "plan_to_watch")) return false;
    return !(a.prequels || []).some((id) => !seen.has(id));
  };
}
/** Cheap eligibility pass for catalog fill checks; no taste-model training or ranking. */
export function eligibleCandidates(
  pool,
  { reactions = {}, list = [], preferences } = {},
) {
  return pool.filter(
    eligibilityFilter(reactions, list, new Set(), false, preferences),
  );
}
/** Balance learned preferences, recent variety, and a 20% exploration branch. */
export function chooseNext(pool, options = {}) {
  return chooseNextBatch(pool, { ...options, limit: 1 })[0] || null;
}

/** Train and score once per search batch; explain a pick only when it is displayed. */
export function chooseNextBatch(
  pool,
  {
    reactions = {},
    list = [],
    skipped = new Set(),
    recent = [],
    random = Math.random,
    readyIds = new Set(),
    limit = 6,
    preferences,
  } = {},
) {
  const audienceMode = normalizePreferences(preferences).childrenTitles;
  const available = pool
    .filter(eligibilityFilter(reactions, list, skipped, false, preferences))
    .filter(
      (anime) =>
        audienceMode !== "include" ||
        !isAudienceFilteredTitle(anime) ||
        !recent.slice(-9).some(isAudienceFilteredTitle),
    );
  if (!available.length) return [];
  const taste = buildTaste(reactions, list, preferences, pool),
    count = Object.keys(reactions).length;
  // Cold start: emphasize breadth across genres, not a wall of similar top-ranked shows.
  const initial = normalizePreferences(preferences);
  const cold =
    count < 8 &&
    list.length === 0 &&
    !initial.favoriteGenres.length &&
    !initial.favoriteAnime.length;
  const explore = !cold && random() < 0.2;
  const ranked = available
    .map((a, index) => {
      const match = taste.model.score(a);
      let score = match.score;
      if (isAudienceFilteredTitle(a)) score -= 0.15;
      if (cold) {
        const overlap = (a.genres || []).filter((g) =>
          recent.slice(-4).some((x) => x.genres?.includes(g)),
        ).length;
        score = 2 - overlap * 0.9 + random() * 0.3 + match.continuation;
        if (count === 0 && a.id === 1) score += 5;
      } else if (explore) {
        // Evidence-aware exploration, not a claim of calibrated bandit uncertainty.
        score += 0.25 * (1 - taste.model.support(a));
        score -=
          0.15 * Math.max(0, ...recent.slice(-4).map((b) => similarity(a, b)));
        score += random() * 0.08;
      } else {
        const overlap = (a.genres || []).filter((g) =>
          recent.slice(-2).some((x) => x.genres?.includes(g)),
        ).length;
        score -= overlap * 0.03;
        score += random() * 0.025;
      }
      return { a, score, index };
    })
    .sort((a, b) => b.score - a.score);
  // Prefer a verified candidate only among near-equal matches.
  // A materially stronger uncached match still wins, preserving exploration and taste.
  const nearBest = ranked.filter(
    (p) => p.score >= ranked[0].score - (cold ? 0.3 : 0.025),
  );
  const first = nearBest.find((p) => readyIds.has(p.a.id)) || ranked[0];
  return [first, ...ranked.filter((p) => p !== first)]
    .slice(0, Math.max(1, Math.min(6, limit)))
    .map(({ a: anime }) => ({
      anime,
      get reason() {
        const continuation = continuationConnection(anime, taste);
        if (continuation) return continuationReason(continuation);
        if (cold) return "Let’s find something you’ll enjoy.";
        if (explore) return "How about something a little different?";
        return explanation(anime, taste);
      },
      get detailReason() {
        return detailedExplanation(anime, taste, { cold, explore });
      },
      get whyReasons() {
        return detailedExplanationReasons(anime, taste, { cold, explore });
      },
    }));
}

/**
 * A deterministic shortlist, unlike Discover's exploration mix. Numbered tiers are
 * positions among eligible candidates, not objective quality or probability scores.
 * Saved, planned, seen and rejected entries train taste but never reappear as candidates.
 */
export function rankRecommendations(
  pool,
  { reactions = {}, list = [], preferences, limit = 25, metadata = [] } = {},
) {
  const taste = buildTaste(reactions, list, preferences, [
    ...metadata,
    ...pool,
  ]);
  const available = [...new Map(pool.map((a) => [a.id, a])).values()]
    .filter(eligibilityFilter(reactions, list, new Set(), false, preferences))
    .map((anime) => ({ anime, ...taste.model.score(anime), saved: false }));
  const selected = [];
  const audienceMode = normalizePreferences(preferences).childrenTitles;
  // Greedy diversity reranking: first place is the strongest match, later places balance variety.
  while (selected.length < limit && available.length) {
    let best = 0,
      bestScore = -Infinity;
    for (let i = 0; i < available.length; i++) {
      if (
        audienceMode === "include" &&
        isAudienceFilteredTitle(available[i].anime) &&
        selected.filter((pick) => isAudienceFilteredTitle(pick.anime)).length >=
          1
      )
        continue;
      const adjusted =
        available[i].score -
        0.06 *
          Math.max(
            0,
            ...selected.map((p) => similarity(p.anime, available[i].anime)),
          );
      if (
        adjusted > bestScore ||
        (adjusted === bestScore &&
          available[i].anime.id < available[best].anime.id)
      ) {
        best = i;
        bestScore = adjusted;
      }
    }
    if (bestScore === -Infinity) break;
    const varietyAdjusted =
      available[best].score < Math.max(...available.map((p) => p.score));
    const [pick] = available.splice(best, 1);
    selected.push({
      ...pick,
      reason: explanation(pick.anime, taste),
      whyReasons: detailedExplanationReasons(pick.anime, taste, {
        mode: "recommendations",
        tier: selected.length + 1,
        varietyAdjusted,
      }),
      detailReason: detailedExplanation(pick.anime, taste, {
        mode: "recommendations",
        tier: selected.length + 1,
        varietyAdjusted,
      }),
      tier: selected.length + 1,
    });
  }
  return selected;
}

/** Eight informative titles is an onboarding heuristic, not a statistical confidence score. */
export function tasteReadiness(reactions = {}, list = [], preferences) {
  const taste = buildTaste(reactions, list, preferences, [], false);
  const informative = [...taste.records.values()].filter(
    (r) => r.weight !== 0 && r.anime.genres?.length,
  );
  const positive =
    normalizePreferences(preferences).favoriteGenres.length > 0 ||
    informative.some((r) => r.weight > 0);
  return {
    reactionCount: Object.keys(reactions).length,
    knownTitles: informative.length,
    remaining: Math.max(0, 8 - informative.length),
    needsMore: informative.length < 8 || !positive,
    positive,
  };
}
