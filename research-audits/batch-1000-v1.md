# First 1,000-title batch contribution audit

File: `anime-research-batch-1000-preliminary.json`

Result: **requires substantive research before it can be called an enriched batch**.

The actual upload contains 1,000 preliminary profiles. 165 profiles contain 179 assessed traits; 835 contain only unknown observations. Compared with the full Tenrai metadata used to produce this file, 165 profiles reweight existing features and zero introduce new ranking traits. The file was produced by premise/metadata extraction, not an in-depth LLM review of every anime. Collected reviews were not incorporated into this deliverable. Import compatibility is not evidence of enrichment quality.

A controlled integration check imports the actual batch into a temporary database, simulates a Good reaction to Samurai Giants (9916), and ranks Ikkyuu-san (1978, 19947) against an identical-metadata test control. With deliberately sparse metadata, the imported sports trait changes the candidate score from 0.010898 to 0.039383, moves it ahead of the control, and produces a sports connection to the liked title. This isolates the imported feature channel. It does not establish an improvement over full existing metadata or measure user satisfaction. Unknown-only profiles add no score; rollback removes imported signals; public projections contain no private research prose.

To reproduce both checks:

```sh
node scripts/prove-research-ranking.mjs /path/to/anime-research-batch-1000-preliminary.json /path/to/catalog-1000.json
```

The admin contribution audit compares each import with metadata and automatic profiles actually stored on the site. Its results may differ where production metadata is absent or incomplete. It exports title IDs and classifications without private plot evidence, identifying work to redo.

The next research pass should add independently supported, adaptation-specific distinctions absent from the existing premise extraction: character motivations and dynamics, element prominence, power constraints, romance behavior, conflict mechanisms, presentation, pacing and disagreements. Unknowns should remain unknown where evidence is insufficient. General Good/Bad reactions must not treat little or no filler as a positive content affinity.
