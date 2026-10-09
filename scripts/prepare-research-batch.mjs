/** Prepare research tasks, NOT invented analyses or an uploadable placeholder batch.
 * node scripts/prepare-research-batch.mjs SOURCE_DIRECTORY OUTPUT_JSON [--live]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANALYSIS_GUIDE,
  RESEARCH_QUESTIONS,
} from "../src/lib/research-taxonomy.js";
import {
  researchVocabulary,
  validateResearchBundle,
} from "../lib/research-profiles.mjs";

const [directory, output, live] = process.argv.slice(2);
if (!directory || !output)
  throw new Error("Supply the existing batch directory and output JSON path.");
const baseline = validateResearchBundle(
  JSON.parse(
    await readFile(
      join(directory, "anime-research-batch-1000-preliminary.json"),
      "utf8",
    ),
  ),
);
const catalog = JSON.parse(
  await readFile(join(directory, "catalog-1000.json"), "utf8"),
);
const metadata = new Map(catalog.entries.map((e) => [e.anime.mal_id, e.anime]));
const liveProfiles = {},
  liveReadFailures = [];
let adminStatus = null;
if (live === "--live") {
  try {
    adminStatus = (
      await fetch("https://animeshuffle.com/api/admin/status", {
        signal: AbortSignal.timeout(25000),
      })
    ).status;
  } catch {
    adminStatus = "unavailable";
  }
  for (let offset = 0; offset < baseline.profiles.length; offset += 150) {
    const ids = baseline.profiles
      .slice(offset, offset + 150)
      .map((p) => p.malId);
    try {
      const response = await fetch(
        "https://animeshuffle.com/api/taste?ids=" + ids.join(","),
        { signal: AbortSignal.timeout(25000) },
      );
      if (!response.ok) throw Error("HTTP " + response.status);
      Object.assign(liveProfiles, (await response.json()).research || {});
    } catch (error) {
      liveReadFailures.push({ ids, error: error.message });
    }
    console.log(
      `Checked live projections for ${Math.min(offset + 150, baseline.profiles.length)} titles`,
    );
  }
}
const tasks = [];
for (const profile of baseline.profiles) {
  const anime = metadata.get(profile.malId);
  let evidence;
  try {
    evidence = JSON.parse(
      await readFile(
        join(directory, "evidence", `reviews-${profile.malId}.json`),
        "utf8",
      ),
    );
  } catch {}
  const reviews = evidence?.response?.data || [];
  const authors = new Set(reviews.map((r) => r.user?.username).filter(Boolean));
  tasks.push({
    malId: profile.malId,
    title: profile.title,
    scope: profile.scope,
    researchStatus: "not-researched-beyond-preliminary-batch",
    catalogMetadata: anime
      ? {
          format: anime.type,
          status: anime.status,
          episodes: anime.episodes,
          genres: (anime.genres || []).map((g) => g.name),
          themes: (anime.themes || []).map((g) => g.name),
          studios: (anime.studios || []).map((g) => g.name),
        }
      : null,
    sourceLinks: {
      mal: anime?.url || `https://myanimelist.net/anime/${profile.malId}`,
      reviews: `https://api.tenrai.org/v4/anime/${profile.malId}/reviews`,
      detail: `https://api.tenrai.org/v4/anime/${profile.malId}/full`,
    },
    existingLocalProfile: profile,
    livePublicRankingProjection: liveProfiles[profile.malId] || null,
    evidenceInventory: {
      accessedAt: evidence?.accessedAt || null,
      cachedReviewCount: reviews.length,
      distinctReviewAuthors: authors.size,
      spoilerReviews: reviews.filter((r) => r.is_spoiler).length,
      preliminaryReviews: reviews.filter((r) => r.is_preliminary).length,
      hasMoreReviewPages:
        evidence?.response?.pagination?.has_next_page === true,
      reviewReferences: reviews
        .map((r) => ({
          url: r.url,
          containsSpoilers: r.is_spoiler === true,
          preliminary: r.is_preliminary === true,
          episodesWatched: r.episodes_watched ?? null,
        }))
        .filter((r) => r.url),
      assessed: false,
      note: "Collection is not analysis. Retrieve and read evidence before asserting traits. Raw review text and reviewer identities are not included.",
    },
    gaps: Object.keys(RESEARCH_QUESTIONS).map((area) => ({
      area,
      state:
        profile.coverage.find((c) => c.area === area)?.state === "partial"
          ? "partial"
          : "not-researched",
      task: "Assess the shared researchQuestions for this area; collect missing sources and record supported, disputed, insufficient-evidence or not-applicable with reasons.",
    })),
    requiredBeforeAnalysis:
      "Reconcile against a fresh Admin catalog/profile export. The local baseline is not an authenticated snapshot of current private research. Never erase existing findings.",
  });
}
const prepared = {
  format: "anime-shuffle-research-work-queue",
  schemaVersion: 1,
  preparedAt: new Date().toISOString(),
  taskCount: tasks.length,
  completedDeepAnalyses: 0,
  uploadReady: false,
  warning:
    "Research INPUTS, not completed results. Do not upload this work queue to Admin. Produce validated anime-shuffle-research profiles after evidence assessment. Private research may contain spoilers.",
  liveCheck: {
    performed: live === "--live",
    adminStatus,
    publicProfilesFound: Object.keys(liveProfiles).length,
    failures: liveReadFailures,
  },
  analysisInstructions: ANALYSIS_GUIDE,
  researchQuestions: RESEARCH_QUESTIONS,
  controlledVocabulary: researchVocabulary,
  assessmentPlan: {
    scope: "full-catalog",
    totalTraits: researchVocabulary.length,
    perAnime: true,
    unsupported: "unknown",
    unexamined: "not-assessed",
  },
  qualityGates: [
    "Exact anime adaptation and episode range verified; no manga/later-season leakage.",
    "All twelve areas explicitly assessed or marked with a specific research gap; no fabricated facts to fill a quota.",
    "Independent agreement weighted above single reviews; mirrored/syndicated sources not counted twice; disagreements retained.",
    "Supported observations map to controlled ranking keys; detailed dimensions capture additional reusable context without claiming current ranking use.",
    "Current Admin preview compared against catalog and saved evidence; reweighting and duplicated metadata distinguished from genuinely new matching traits.",
    "Private spoilers remain in research only; public reasons use controlled spoiler-safe labels and real user-taste connections.",
    "Validate each completed profile and test a varied pilot before delivering the full 1000; review weakest and contradictory cases individually.",
  ],
  outputContract: {
    format: "anime-shuffle-research",
    schemaVersion: 1,
    profiles:
      "Array of completed profile objects. Unique MAL IDs within a file; repeating an ID from a previous upload is allowed and merges.",
    profileFields: [
      "malId",
      "title",
      "scope",
      "status",
      "analyzedAt",
      "analyzer",
      "metadataFingerprint",
      "sources",
      "observations",
      "dimensions",
      "coverage",
      "spoilersAllowed",
      "caveats",
      "appeal",
      "unknowns",
    ],
    sourceFields: [
      "id",
      "url",
      "title",
      "type",
      "accessedAt",
      "independenceKey (optional)",
    ],
    sourceTypes: [
      "official",
      "synopsis",
      "review",
      "editorial",
      "production",
      "episode-guide",
    ],
    observationFields: [
      "key (controlled vocabulary)",
      "score (0..1 or null)",
      "confidence (0..1)",
      "prominence (central/supporting/incidental/unknown)",
      "basis (premise/critical/production)",
      "sources (source IDs)",
      "evidence (original summary, max 600 chars)",
      "supersedes (optional true only for deliberate sourced correction)",
    ],
    dimensionFields: [
      "key (stable lowercase hyphenated key)",
      "area",
      "description (max 600 chars)",
      "basis",
      "confidence",
      "sources",
      "containsSpoilers",
    ],
    coverageStates: [
      "not-researched",
      "insufficient-evidence",
      "partial",
      "supported",
      "disputed",
      "not-applicable",
    ],
    validation:
      "node scripts/validate-research-batch.mjs completed-batch.json; then Admin preview before import. Never fabricate a fingerprint; export the current catalog.",
  },
  tasks,
};
if (new Set(tasks.map((t) => t.malId)).size !== tasks.length)
  throw Error("Duplicate task IDs");
await writeFile(output, JSON.stringify(prepared, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    tasks: tasks.length,
    publicProfiles: Object.keys(liveProfiles).length,
    reviewTitles: tasks.filter((t) => t.evidenceInventory.cachedReviewCount > 0)
      .length,
    completedDeepAnalyses: 0,
    adminStatus,
  }),
);
