# Official API trait importer

This batch tool imports explicit metadata tags through the official MyAnimeList
and optional TMDB JSON APIs. It does not use Jikan, Tenrai, HTML scraping, search
engines, Ollama, or paid model inference. It creates JSON accepted by AnimeShuffle's
existing Admin research importer. It does not change the site's automatic model
settings or upload anything without you selecting the generated file in Admin.

## First run on Windows, macOS, or Linux

1. Install Node.js 24 or newer and download/open the AnimeShuffle repository.
   This importer uses Node built-ins and project source; it does not need npm install.
2. In the repository folder, create `.env` (or add to the existing one):

   ```dotenv
   MAL_CLIENT_ID=your_own_registered_mal_application_client_id
   ```

   Reuse your AnimeShuffle MAL application ID, available in
   https://myanimelist.net/apiconfig. No client secret or user access token is needed
   for the public anime detail requests. Keep credentials out of source control.

3. Open a terminal in that folder and run a small pilot:

   ```sh
   npm run traits:api -- --ids 1,5,20 --output .data/api-traits/pilot
   ```

4. For your catalog, export the catalog from AnimeShuffle Admin, then run:

   ```sh
   npm run traits:api -- --input "catalog.json"
   ```

   Accepted inputs: Admin `{ "catalog": [...] }`, `{ "entries": [{ "anime": ... }] }`,
   research `{ "tasks": [...] }`, research `{ "profiles": [...] }`, an array of
   records with `id`/`malId`/`mal_id`, or a simple ID array such as `[1, 5, 20]`.
   Duplicate or invalid IDs are rejected before requests begin. Existing catalog
   fingerprints are preserved; IDs alone use a null fingerprint for Admin review.

5. Read `.data/api-traits/coverage-report.json`, then select
   `.data/api-traits/research-results.json` in Admin and review the merge preview.
   Existing detailed findings are not deliberately superseded by these imports.
   A no-match run writes a clearly marked, non-uploadable result instead of an
   invented profile. Only upload files with format `anime-shuffle-research`.

The command automatically reads `.env`. You can also set environment variables
normally. Everything produced defaults to the git-ignored `.data` folder.

## What the 3,000 traits mean here

The mapper considers the full vocabulary (3,000 detailed keys plus 188 legacy keys)
for mapping availability. **This does not research all 3,000 traits.** The initial
14 conservative mapping rules cover 12 legacy keys; none claim to establish the
very specific new traits from a broad genre. For example, `Martial Arts` supports
the martial-technique trait, but `Space` is not mapped to exploration or politics.

Only exact, case-insensitive normalized tag names match. No fuzzy matching,
synopsis keyword inference, automatic centrality, quality claims, or negative
claims are generated. A missing tag or mapping means unknown. Reports distinguish
unsupported vocabulary keys, unmatched provider labels, successful matches, and
API failures. All provider labels remain available in the cache for later mapping.
No-match titles still have a report entry.

Imported observations are preliminary, with presence score 1, unknown prominence,
and confidence weight 0.6. That weight is a conservative policy choice, not a
measured probability. Multiple APIs do not automatically increase confidence.
The remaining research areas stay not-researched. TMDB findings default to private
spoilers because its keyword endpoint provides no per-title spoiler flag.

## Optional TMDB keywords

TMDB has broader movie/TV keywords. Obtain your own API Read Access Token from your
TMDB account and add `TMDB_READ_TOKEN=...` to `.env`. Their API is free for
noncommercial use with required attribution; commercial use requires checking
their licensing. Keep the source attribution when using the imported data.

Add an explicit link to an input record:

```json
[
  {
    "malId": 1,
    "title": "Cowboy Bebop",
    "tmdb": { "type": "tv", "id": 30991, "scopeVerified": true }
  }
]
```

This illustrates the link format. Verify the TMDB record and its adaptation scope
yourself before setting `scopeVerified: true`. The tool intentionally does not
search by title and guess a match. TMDB series tags can cover multiple seasons;
do not link a franchise-wide record to one season unless that scope is valid.
The tool additionally requires TMDB's Animation genre to reject live-action
adaptations. `type` must be `tv` or `movie`. With no TMDB link, only MAL is called.

## Interruptions and provider errors

- Successful public JSON responses are written atomically to a seven-day disk
  cache. Restart the same command to reuse them, including after Ctrl+C.
- Profiles and coverage are checkpointed every ten titles and on graceful stop.
  Re-running rebuilds output from the input and cache; it does not append duplicates.
- API starts are spaced at least 1.1 seconds apart per provider. Timeouts and
  5xx/429 responses receive up to four attempts with exponential backoff.
- `Retry-After` seconds and dates are respected. A wait over 60 seconds stops that
  provider for the run instead of retrying early. Restart later.
- 404s are recorded and skipped, never retried as HTML requests. 401/403 and an
  exhausted 429 pause the affected provider. A paused MAL provider stops the batch;
  an optional TMDB failure does not discard successful MAL mappings.
- No API can guarantee freedom from outages, limits, or deleted records. Errors
  remain visible in the report; they never become evidence of trait absence.
- `.data/api-traits/runner.lock` prevents concurrent writers to the same output.
  After a hard crash, confirm no importer is running before deleting a stale lock.
- Exit codes: 0 completed, 1 setup/unexpected failure, 2 completed with API errors,
  130 interrupted or paused by the primary provider.

Remap saved responses without any network calls:

```sh
npm run traits:api -- --input catalog.json --offline
```

Use `--refresh` to deliberately bypass the fresh cache. Offline mode uses available
cached responses even after their normal expiry and retains their original access
dates. Use the same output directory to reuse a previous run's cache.

## Add reviewed mappings

Create a JSON file with the same `version` and `rules` shape as
`data/api-trait-mappings.json`, then supply `--mappings my-mappings.json`.
Additional rules are combined with the defaults. For each rule specify `provider`
(`mal` or `tmdb`), exact `labels`, an existing vocabulary `key`, a `rationale`, and
`containsSpoilers`. The importer rejects unknown and critical-evidence-only keys.
It accepts any of the 3,188 keys that can legitimately be supported by metadata;
you must review semantic equivalence before adding a rule. Reuse is the saving:
one correct mapping applies to all titles carrying that provider tag.

Do not add thousands of speculative mappings to improve a coverage number. Subtle
traits such as how a school operates need richer evidence than a `School` tag.

## API references

- MAL: https://myanimelist.net/apiconfig/references/api/v2
- TMDB authentication: https://developer.themoviedb.org/docs/authentication-application
- TV keywords: https://developer.themoviedb.org/reference/tv-series-keywords
- Movie keywords: https://developer.themoviedb.org/reference/movie-keywords
- TMDB terms/pricing: https://developer.themoviedb.org/docs/faq

Integration tests use simulated API responses and exercise the real website
validator. A live run requires your credentials; an offline test is not proof of
current provider availability or comprehensive trait coverage.
