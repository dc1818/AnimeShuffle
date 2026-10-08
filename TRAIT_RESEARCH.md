# Expanded anime research tracking

The registry has 2,588 stable keys: the existing 188 plus 2,400 additions in
120 families. Definitions are not anime findings. Do not fill every field,
copy observations between seasons, or convert missing data into absence.

## Admin workflow

1. Open **Anime research**, then **Search the complete trait catalog**. Filter
   by area, family or matching use; download selected definitions for a research
   session. That definitions file is a research aid, not an anime-profile upload.
2. Export catalog inputs or existing profiles. Exports include vocabulary,
   definitions, family questions, evidence requirements, taxonomy version and
   merge instructions. Use the exact MAL ID and supplied metadata fingerprint.
3. Research supported findings and upload `anime-shuffle-research` JSON with
   `schemaVersion: 1` through the existing preview/import workflow. Existing
   batch files stay compatible; a repeated MAL ID fills gaps rather than
   replacing all stored research. Existing 1,000-profile transport chunking
   and request-size limits remain in place.
4. In a stored profile, expand **Trait coverage for this anime**. The matrix
   displays 40 rows at a time, searches every supported trait, and distinguishes
   not assessed, researched but unknown, low confidence, uncertain, presence
   and evidence of absence. Imported and automatic profiles have separate views;
   recommendation projection combines eligible findings from both.

## Observation contract

Use each trait's exact stable `key`. An observation stores:

| Field              | Meaning                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `score`            | Presence/intensity from 0 to 1; `null` is unknown. It is not a quality rating.                                                    |
| `confidence`       | Evidence confidence from 0 to 1; not a calibrated probability.                                                                    |
| `prominence`       | `central`, `supporting`, `incidental`, or `unknown`.                                                                              |
| `basis`            | `premise`, `critical`, or `production`. Critical-only definitions reject synopsis inference.                                      |
| `sources`          | IDs of source records included in this profile.                                                                                   |
| `evidence`         | Short original evidence summary, always private.                                                                                  |
| `containsSpoilers` | Whether revealing the **trait assignment** would spoil this exact title. New traits default to private unless explicitly `false`. |
| `supersedes`       | Optional `true` for an intentional sourced correction. Required to clear a saved spoiler warning.                                 |

The top-level profile still needs scope, status, analyzer, dates, sources and
the existing schema fields. Start from the admin export; do not upload the
brainstorm catalog as if it contained assessed anime profiles.

Private outcome/advisory families are always tracking-only, even when marked
`containsSpoilers:false`. They and other spoiler-marked observations are removed
from public API projections and current client-side ranking. Admin labels and
evidence stay hidden until **Reveal private research**. A privacy warning survives
ordinary merges regardless of which score has higher confidence.

## Matching and analysis

- 2,160 new definitions are eligible for matching; 240 are private research.
  A matching-eligible definition still needs a spoiler-safe, evidenced assignment.
- Matching requires at least 0.45 confidence, 0.3 presence and known prominence.
  Strong evidence of absence can remove an existing same-key feature; it does
  not create a generic affinity for all anime lacking that trait.
- Expanded family members share a normalized weight budget. Only one member
  per family enters the top-eight conjunction pool. This limits tag inflation;
  it does not prove complete semantic independence across different families.
- Shared supported features can appear in succinct personalized explanation
  bullets. Free-form research prose never becomes public explanation text.
- Cloudflare selects the original vocabulary plus at most 48 new questions
  using evidence relevance and owner-requested trait keys. Routing is not
  classification: generated findings still need valid evidence references.
  Each call is selective, not an assessment of all 2,588 traits.
- The analysis version changes to queue an update through the existing bounded
  background pipeline. Targeted passes on unchanged metadata retain earlier
  findings. Quota handling and saved-profile reuse remain in effect.

## Verification

`test/expanded-traits.test.mjs` imports all new keys into the real SQLite-backed
store, reopens it, checks merge preservation, verifies spoiler filtering, trains
the actual recommender, checks family weight bounds, and exercises targeted
model persistence. `test/trait-tracker-ui.test.mjs` exercises pagination,
unknown/missing filters and explicit reveal/hide behavior in React.

These checks establish compatibility and algorithm consumption. They do not
establish factual correctness of future research or improved user satisfaction.
