import { writeFile } from "node:fs/promises";
import {
  EXTENDED_RESEARCH_TRAITS,
  TRAIT_FAMILIES,
  TRAIT_CATALOG_VERSION,
} from "../src/lib/extended-research-traits.js";
import { researchVocabulary } from "../lib/research-profiles.mjs";
const path = process.argv[2] || "data/anime-trait-catalog-3000.json";
const familyByKey = new Map(TRAIT_FAMILIES.map((f) => [f.key, f]));
const catalog = {
  format: "anime-shuffle-trait-catalog",
  schemaVersion: 2,
  taxonomyVersion: TRAIT_CATALOG_VERSION,
  title: "Anime Shuffle: 3,000 detailed traits",
  status: "registered-for-evidence-assessment",
  candidateCount: EXTENDED_RESEARCH_TRAITS.length,
  traitCount: EXTENDED_RESEARCH_TRAITS.length,
  familyCount: TRAIT_FAMILIES.length,
  legacyTraitCount: researchVocabulary.filter((t) => !t.familyKey).length,
  totalAcceptedTraitCount: researchVocabulary.length,
  isAnimeProfileUpload: false,
  purpose:
    "Definitions for the complete per-anime research checklist, not assessments of any anime. Original 188 keys remain accepted separately.",
  assessmentContract: {
    scope:
      "Assess the exact MAL adaptation. Check all detailed keys; keep unsupported traits unknown and distinguish unchecked work.",
    presence:
      "null means unknown; zero requires affirmative evidence of absence.",
    role: "central / supporting / incidental / unknown",
    evidence:
      "Cite sources, independence, access dates and relevant episode/adaptation scope. Preserve disagreements.",
    confidence:
      "Evidence confidence, never an enjoyment prediction. Do not treat tag relevance as calibrated confidence.",
    privacy:
      "Per-title spoiler review is required. Private families remain excluded from public explanations and matching.",
  },
  families: TRAIT_FAMILIES.map((f) => ({
    ...f,
    candidateCount: EXTENDED_RESEARCH_TRAITS.filter(
      (t) => t.familyKey === f.key,
    ).length,
  })),
  traits: EXTENDED_RESEARCH_TRAITS.map((t) => ({
    ...t,
    value: t.label.includes(": ")
      ? t.label.slice(t.label.indexOf(": ") + 2)
      : t.label,
    status: "registered",
    evidenceMode: familyByKey.get(t.familyKey).evidenceMode,
    publicExplanationEnabled: false,
  })),
};
if (
  catalog.traitCount !== 3000 ||
  new Set(catalog.traits.map((t) => t.key)).size !== 3000
)
  throw Error("Expected exactly 3,000 unique detailed keys");
await writeFile(path, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `Exported ${catalog.traitCount} detailed traits (${catalog.totalAcceptedTraitCount} accepted keys) to ${path}`,
);
