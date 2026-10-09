import {
  researchVocabulary,
  RESEARCH_AREAS,
  validateResearchBundle,
} from "./research-profiles.mjs";
import { TRAIT_CATALOG_VERSION } from "../src/lib/extended-research-traits.js";

const clean = (value, max = 300) =>
  String(value || "")
    .replace(/[<>\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
const normalized = (value) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const terms = new Map(researchVocabulary.map((x) => [x.key, x]));

export function validateMappings(config) {
  if (
    typeof config?.version !== "string" ||
    !config.version ||
    !Array.isArray(config.rules)
  )
    throw Error("Mappings need a version and rules array.");
  for (const rule of config.rules) {
    if (
      !["mal", "tmdb"].includes(rule.provider) ||
      !terms.has(rule.key) ||
      terms.get(rule.key).evidenceOnly ||
      !Array.isArray(rule.labels) ||
      !rule.labels.length ||
      rule.labels.some((x) => typeof x !== "string" || !x.trim()) ||
      typeof rule.rationale !== "string" ||
      !rule.rationale.trim() ||
      typeof rule.containsSpoilers !== "boolean"
    )
      throw Error(
        `Invalid or evidence-only API mapping: ${rule.key || "missing key"}`,
      );
  }
  return config;
}

export function readAnimeInput(input) {
  const rows = Array.isArray(input)
    ? input
    : input?.catalog || input?.entries || input?.tasks || input?.profiles;
  if (!Array.isArray(rows) || !rows.length)
    throw Error(
      "Input needs a nonempty catalog, entries, tasks, profiles, or array of MAL IDs.",
    );
  const seen = new Set();
  return rows.map((row) => {
    const anime = row?.anime || row;
    const malId =
      typeof row === "number"
        ? row
        : (anime?.malId ?? anime?.mal_id ?? anime?.id);
    if (
      !Number.isSafeInteger(malId) ||
      malId < 1 ||
      malId > 10000000 ||
      seen.has(malId)
    )
      throw Error("Input MAL IDs must be unique positive integers.");
    seen.add(malId);
    const metadataFingerprint =
      row?.metadataFingerprint ?? anime?.metadataFingerprint ?? null;
    if (
      metadataFingerprint !== null &&
      !/^[a-f0-9]{64}$/.test(metadataFingerprint)
    )
      throw Error(`Invalid catalog fingerprint for ${malId}.`);
    return {
      malId,
      title: clean(anime?.title),
      metadataFingerprint,
      tmdb: row?.tmdb ?? anime?.tmdb,
    };
  });
}

export function mappingCoverage(config) {
  const mapped = new Set(config.rules.map((r) => r.key));
  return {
    taxonomyVersion: TRAIT_CATALOG_VERSION,
    totalTraits: researchVocabulary.length,
    detailedTraits: researchVocabulary.filter((t) => t.familyKey).length,
    ruleCoveredTraits: mapped.size,
    rules: config.rules.length,
    noMappingKeys: researchVocabulary
      .filter((t) => !mapped.has(t.key))
      .map((t) => t.key),
    meaning:
      "Every vocabulary key is considered for mapping availability. A missing rule or tag is unknown, never absent. This is not a full research assessment.",
  };
}

export function mapApiTraits(
  entry,
  results,
  config,
  analyzedAt = new Date().toISOString(),
) {
  validateMappings(config);
  const observations = new Map(),
    sources = [],
    unmatchedLabels = [];
  for (const result of results) {
    const sourceId = `${result.provider}-metadata`;
    sources.push({
      id: sourceId,
      type: "official",
      title: `${result.provider.toUpperCase()} structured metadata`,
      url: result.url,
      accessedAt: result.accessedAt,
      independenceKey: `${result.provider}-metadata`,
    });
    for (const label of new Set(result.labels)) {
      const matches = config.rules.filter(
        (rule) =>
          rule.provider === result.provider &&
          rule.labels.some((l) => normalized(l) === normalized(label)),
      );
      if (!matches.length)
        unmatchedLabels.push({
          provider: result.provider,
          label: clean(label),
        });
      for (const rule of matches) {
        const old = observations.get(rule.key);
        // More databases do not automatically imply independent evidence or higher certainty.
        observations.set(rule.key, {
          key: rule.key,
          score: 1,
          confidence: 0.6,
          prominence: "unknown",
          basis: "premise",
          sources: [...new Set([...(old?.sources || []), sourceId])],
          evidence: clean(
            [
              old?.evidence,
              `${result.provider.toUpperCase()} tag "${clean(label)}": ${rule.rationale}`,
            ]
              .filter(Boolean)
              .join(" "),
            600,
          ),
          containsSpoilers: !!old?.containsSpoilers || rule.containsSpoilers,
        });
      }
    }
  }
  const report = {
    malId: entry.malId,
    title: clean(
      entry.title ||
        results.find((r) => r.provider === "mal")?.data.title ||
        `MAL ${entry.malId}`,
    ),
    state: observations.size ? "mapped" : "no_supported_mappings",
    matchedKeys: [...observations.keys()],
    unknownTraits: researchVocabulary.length - observations.size,
    unmatchedLabels,
    providers: results.map((r) => ({
      provider: r.provider,
      accessedAt: r.accessedAt,
      cached: r.cached,
    })),
  };
  if (!observations.size) return { profile: null, report };
  const profile = {
    malId: entry.malId,
    title: report.title,
    scope: `Exact MAL anime ID ${entry.malId}; structured metadata only. TMDB, if supplied, uses an explicitly verified adaptation link.`,
    metadataFingerprint: entry.metadataFingerprint,
    status: "preliminary",
    analyzedAt,
    analyzer: "official-api-mapper-v1",
    sources,
    observations: [...observations.values()],
    dimensions: [],
    coverage: RESEARCH_AREAS.map((area) => ({
      area,
      state: area === "premise" ? "partial" : "not-researched",
      notes:
        area === "premise"
          ? "Only explicit provider tags with reviewed mappings were imported."
          : "API metadata does not establish detailed research coverage.",
    })),
    spoilersAllowed: true,
    caveats: [
      "Provider tags are preliminary evidence; they do not establish prominence, quality, or consensus. Confidence 0.6 is a conservative policy weight, not a calibrated probability.",
      "No LLM analysis or web scraping was performed. Missing tags do not establish absence.",
    ],
    appeal: [],
    unknowns: [
      "Traits without matching rules or tags remain unknown. The entire catalog has not been independently researched.",
    ],
  };
  return {
    profile: validateResearchBundle({
      format: "anime-shuffle-research",
      schemaVersion: 1,
      profiles: [profile],
    }).profiles[0],
    report,
  };
}
