import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildTaste } from "../src/lib/recommend.js";
import { communitySimilarities } from "../lib/community-taste.mjs";

/** Chronological replay of explicit labels only. Current metadata is available
 * at prediction time in this replay; it is not a historical catalog archive. */
export function evaluateRecommendations(data) {
  if (data?.app !== "anime-shuffle-evaluation" || !Array.isArray(data.users))
    throw new Error("Use the admin recommendation evaluation export.");
  const users = data.users.map((u, index) => ({
    user: index,
    reactions: (u.reactions || [])
      .filter(
        (r) =>
          Number.isFinite(r.at) &&
          r.at > 0 &&
          r.anime?.id &&
          ["good", "bad", "watch", "nope"].includes(r.action),
      )
      .sort((a, b) => a.at - b.at || a.anime.id - b.anime.id),
  }));
  const totals = {};
  for (const axis of ["enjoyment", "interest"])
    for (const model of ["content", "hybrid"])
      totals[axis + ":" + model] = {
        users: 0,
        pairs: 0,
        correct: 0,
        precisionAt5Sum: 0,
      };
  let evaluated = 0;
  for (const user of users) {
    if (user.reactions.length < 10) continue;
    const split = Math.floor(user.reactions.length * 0.8);
    const cutoff = user.reactions[split].at;
    const training = user.reactions.filter((r) => r.at < cutoff);
    const heldout = user.reactions.filter((r) => r.at >= cutoff);
    if (!training.length) continue;
    // Other users' future reactions and ALL target-user reactions are excluded
    // from the shared graph. Neither held-out label can influence its training.
    const rows = users
      .filter((u) => u.user !== user.user)
      .flatMap((u) =>
        u.reactions
          .filter((r) => r.at < cutoff)
          .map((r) => ({
            account_id: String(u.user),
            anime_id: r.anime.id,
            action: r.action,
          })),
      );
    const graph = communitySimilarities(rows);
    const reactions = Object.fromEntries(training.map((r) => [r.anime.id, r]));
    const corpus = user.reactions.map((r) => ({
      ...r.anime,
      communityTaste: [],
    }));
    const taste = buildTaste(reactions, [], {}, corpus);
    evaluated++;
    for (const [axis, positive, negative] of [
      ["enjoyment", "good", "bad"],
      ["interest", "watch", "nope"],
    ]) {
      const candidates = heldout.filter((r) =>
        [positive, negative].includes(r.action),
      );
      const positives = candidates.filter((r) => r.action === positive),
        negatives = candidates.filter((r) => r.action === negative);
      if (!positives.length || !negatives.length) continue;
      for (const model of ["content", "hybrid"]) {
        const score = (r) =>
          taste.model.score({
            ...r.anime,
            communityTaste: model === "hybrid" ? graph[r.anime.id] || [] : [],
          })[axis];
        const scores = new Map(candidates.map((r) => [r.anime.id, score(r)]));
        const result = totals[axis + ":" + model];
        result.users++;
        for (const p of positives)
          for (const n of negatives) {
            const diff = scores.get(p.anime.id) - scores.get(n.anime.id);
            result.pairs++;
            result.correct += diff > 0 ? 1 : diff === 0 ? 0.5 : 0;
          }
        const top = [...candidates]
          .sort(
            (a, b) =>
              scores.get(b.anime.id) - scores.get(a.anime.id) ||
              a.anime.id - b.anime.id,
          )
          .slice(0, 5);
        result.precisionAt5Sum +=
          top.filter((r) => r.action === positive).length / top.length;
      }
    }
  }
  return {
    users: data.users.length,
    usersWithTemporalSplit: evaluated,
    note: "Latest 20% of dated explicit reactions held out. Metrics cover only later labeled titles, not the full catalog; selection/exposure bias remains. No unobserved title or Skip is treated as a dislike. Current metadata can differ from metadata available historically. This measures community blending against the same content/similarity model, not against a deployed earlier version.",
    metrics: Object.fromEntries(
      Object.entries(totals).map(([k, r]) => [
        k,
        {
          users: r.users,
          pairs: r.pairs,
          pairwiseAccuracy: r.pairs ? r.correct / r.pairs : null,
          meanPrecisionAt5: r.users ? r.precisionAt5Sum / r.users : null,
        },
      ]),
    ),
    recordedExposures: data.users.reduce(
      (n, u) =>
        n + (u.events || []).filter((e) => e.kind === "impression").length,
      0,
    ),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (!process.argv[2])
      throw new Error(
        "Usage: node scripts/evaluate-recommendations.mjs anime-shuffle-evaluation.json [report.json]",
      );
    const report = evaluateRecommendations(
      JSON.parse(await readFile(process.argv[2], "utf8")),
    );
    const text = JSON.stringify(report, null, 2) + "\n";
    if (process.argv[3]) await writeFile(process.argv[3], text);
    console.log(text);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
