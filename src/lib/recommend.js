import { normalizePreferences, matchesPreferences } from "./preferences.js";
/**
 * Pure recommendation functions: no network, React, or browser-storage dependencies.
 * Missing numeric scores represent unknown preference, not a zero-star review.
 * Explicit reactions are stronger than signals inferred from MAL list statuses.
 */
export const REACTIONS = ["good", "bad", "watch", "nope"];
export const reactionWeight = { good: 3, bad: -3, watch: 1.8, nope: -1.3 };
/** Convert optional MAL scores/statuses to weak preference evidence. */
export function preferenceWeight(entry, meanScore = 7) {
  const s = entry.listStatus || {},
    score = Number(s.score) || 0;
  const ratedWeight = Math.max(
    -2.5,
    Math.min(3, (score - meanScore) * 0.7 + 0.5),
  );
  // Dropping is negative interest even when an old numeric rating was positive.
  if (s.status === "dropped")
    return score > 0 ? Math.min(-0.8, ratedWeight) : -1;
  if (score > 0) return ratedWeight;
  return (
    {
      watching: 1.6,
      plan_to_watch: 1.1,
      completed: 1,
      on_hold: 0,
      dropped: -1,
    }[s.status] || 0
  );
}
/** Merge by anime ID so a direct reaction replaces, rather than doubles, MAL evidence. */
export function buildTaste(reactions, list, preferences) {
  const initial = normalizePreferences(preferences);
  const genres = new Map(),
    formats = new Map();
  const rated = list.filter((a) => a.listStatus?.score > 0);
  const mean = rated.length
    ? rated.reduce((s, a) => s + a.listStatus.score, 0) / rated.length
    : 7;
  const statuses = new Map(
    list.map((anime) => [anime.id, anime.listStatus?.status]),
  );
  const records = new Map(
    list.map((a) => [
      a.id,
      { anime: a, weight: preferenceWeight(a, mean), source: "list" },
    ]),
  );
  // A chosen favorite is explicit evidence, stronger than an unrated MAL status.
  for (const anime of initial.favoriteAnime)
    records.set(anime.id, { anime, weight: 3, source: "favorite" });
  for (const [id, r] of Object.entries(reactions)) {
    // A past plan is superseded by subsequent MAL progress. Good/Bad stay authoritative.
    const status = statuses.get(Number(id));
    if (r.action === "watch" && ["completed", "dropped"].includes(status))
      continue;
    records.set(Number(id), {
      anime: r.anime,
      weight: reactionWeight[r.action] || 0,
      source: "reaction",
    });
  }
  for (const { anime, weight, source } of records.values()) {
    const gs = anime.genres || [];
    const w = weight / Math.sqrt(Math.max(1, gs.length));
    for (const g of gs) {
      const p = genres.get(g) || { sum: 0, count: 0, explicit: 0 };
      p.sum += w;
      p.count++;
      if (source === "reaction") p.explicit++;
      genres.set(g, p);
    }
    const f = formats.get(anime.format) || { sum: 0, count: 0 };
    f.sum += weight;
    f.count++;
    formats.set(anime.format, f);
  }
  for (const g of initial.favoriteGenres) {
    const p = genres.get(g) || { sum: 0, count: 0, explicit: 0 };
    p.sum += 2;
    p.count++;
    genres.set(g, p);
  }
  return { genres, formats, records };
}
/** Normalize genre evidence to reduce bias toward titles with many genre tags. */
export function scoreAnime(anime, taste) {
  const gs = anime.genres || [];
  const genre =
    gs.reduce((sum, g) => {
      const x = taste.genres.get(g);
      return sum + (x ? x.sum / Math.sqrt(x.count + 2) : 0);
    }, 0) / Math.sqrt(gs.length || 1);
  const f = taste.formats.get(anime.format);
  return genre + (f?.count ? (0.15 * f.sum) / Math.sqrt(f.count + 2) : 0);
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
  if (
    !a ||
    reactions[a.id] ||
    normalizePreferences(preferences).favoriteAnime.some(
      (x) => x.id === a.id,
    ) ||
    skipped.has(a.id) ||
    (a.nsfw !== "white" && !a.demo)
  )
    return false;
  if (!matchesPreferences(a, preferences)) return false;
  const existing = list.find((x) => x.id === a.id)?.listStatus?.status;
  if (existing && !(allowPlan && existing === "plan_to_watch")) return false;
  const seen = new Set(
    list
      .filter((x) => ["completed", "watching"].includes(x.listStatus?.status))
      .map((x) => x.id),
  );
  for (const [id, r] of Object.entries(reactions))
    if (["good", "bad"].includes(r.action)) seen.add(Number(id));
  for (const favorite of normalizePreferences(preferences).favoriteAnime)
    seen.add(favorite.id);
  if ((a.prequels || []).some((id) => !seen.has(id))) return false;
  return true;
}
/** Balance learned preferences, recent variety, and a 20% exploration branch. */
export function chooseNext(
  pool,
  {
    reactions = {},
    list = [],
    skipped = new Set(),
    recent = [],
    random = Math.random,
    preferences,
  } = {},
) {
  const available = pool.filter((a) =>
    isEligible(a, reactions, list, skipped, false, preferences),
  );
  if (!available.length) return null;
  const taste = buildTaste(reactions, list, preferences),
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
      let score = scoreAnime(a, taste);
      if (cold) {
        const overlap = (a.genres || []).filter((g) =>
          recent.slice(-4).some((x) => x.genres?.includes(g)),
        ).length;
        score = 2 - overlap * 0.9 + random() * 0.3;
        if (count === 0 && a.id === 1) score += 5;
      } else if (explore) score = random();
      else {
        const overlap = (a.genres || []).filter((g) =>
          recent.slice(-2).some((x) => x.genres?.includes(g)),
        ).length;
        score -= overlap * 0.18;
        score += random() * 0.3;
      }
      return { a, score, index };
    })
    .sort((a, b) => b.score - a.score);
  const anime = ranked[0].a;
  let reason = "A fresh discovery";
  if (cold) reason = `Finding your taste · ${Math.min(count + 1, 8)} of 8`;
  else if (explore) reason = "A little outside your usual";
  else {
    const best = [...(anime.genres || [])].sort(
      (a, b) =>
        (taste.genres.get(b)?.sum || 0) - (taste.genres.get(a)?.sum || 0),
    )[0];
    if (best && (taste.genres.get(best)?.sum || 0) > 0)
      reason = `A little more ${best.toLowerCase()}`;
    else if (list.length) reason = "Inspired by your MAL list";
  }
  return { anime, reason };
}

/**
 * A deterministic shortlist, unlike Discover's exploration mix. Numbered tiers are
 * positions among eligible candidates, not objective quality or probability scores.
 * Saved, planned, seen and rejected entries train taste but never reappear as candidates.
 */
export function rankRecommendations(
  pool,
  { reactions = {}, list = [], preferences, limit = 25 } = {},
) {
  const exclusions = reactions;
  // Calculate one taste profile for the whole batch, including explicit saved interests.
  const taste = buildTaste(reactions, list, preferences);
  const unique = new Map(pool.map((a) => [a.id, a]));
  return [...unique.values()]
    .filter((a) =>
      isEligible(a, exclusions, list, new Set(), false, preferences),
    )
    .map((anime) => {
      const saved =
        reactions[anime.id]?.action === "watch" ||
        list.some(
          (a) => a.id === anime.id && a.listStatus?.status === "plan_to_watch",
        );
      const score = scoreAnime(anime, taste) + (saved ? 0.4 : 0);
      const best = (anime.genres || [])
        .filter((g) => (taste.genres.get(g)?.sum || 0) > 0)
        .sort((a, b) => taste.genres.get(b).sum - taste.genres.get(a).sum)
        .slice(0, 2);
      const reason = best.length
        ? `Matches your interest in ${best.join(" and ")}`
        : saved
          ? "Already on your want-to-watch list"
          : "An early suggestion while we learn your taste";
      return { anime, score, reason, saved };
    })
    .sort((a, b) => b.score - a.score || a.anime.id - b.anime.id)
    .slice(0, limit)
    .map((pick, index) => ({ ...pick, tier: index + 1 }));
}
