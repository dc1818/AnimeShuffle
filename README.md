# Anime Shuffle

**Find your next anime and build a watchlist that fits your taste.**

[Try Anime Shuffle](https://animeshuffle.com) · [Sample demo](https://dc1818.github.io/AnimeShuffle/)

Anime Shuffle helps turn a long list of anime into something you actually want to watch. Browse one title at a time, tell it what you've enjoyed or would watch, and explore a shortlist based on those choices.

Connect MyAnimeList to start with your existing watch history and Plan to Watch list, create an Anime Shuffle account, or try it as a guest. Personal ratings help when you have them, but aren't required.

## How it works

### Discover

Start with favorite genres and a few anime you like, then browse individual cards with cover art, English titles where available, and expandable details. Choose one of four reactions:

| Reaction        | What it means                        |
| --------------- | ------------------------------------ |
| **Good**        | I've seen this and liked it.         |
| **Bad**         | I've seen this and didn't like it.   |
| **Would watch** | Add this to my watchlist.            |
| **Won't watch** | I'm not interested in watching this. |

Skip a title without rating it, or undo your last choice. Good and Bad are disabled for anime that haven't aired yet. Viewing preferences let you choose genres (or Any genre), formats, series lengths, and whether to include ongoing or upcoming releases. Selected genres restrict Discover and Recommendations to anime matching at least one choice. Cards on both pages show a small reminder of active genre selections; Any genre shows no reminder. Genre controls are available in preferences for guests and signed-in users.

Watch a trailer inside the Discover card, or open **More about this anime** for separate **Trailers** and **Images** tabs. Return to the cover to pause playback, then reopen it to continue. Media comes from MyAnimeList listings through Tenrai; availability varies by title. The image gallery supports arrow keys, on-screen arrows, and swiping on phones. Trailer lists filter known country restrictions using Cloudflare’s visitor country; videos without regional metadata are hidden.

### Recommendations

Explore up to 25 personalized picks in an expandable leaderboard. Each row has a numbered tier, with gold, silver, and bronze highlighting the first three matches. These tiers describe how a title ranks within your shortlist, not its overall quality or a guaranteed likelihood of enjoying it.

Open a card to see its details and why it was selected. Use the same reactions as Discover; selected rows stay marked until you refresh the batch. Saved and previously reacted-to titles are excluded from new batches. If there isn't enough information for a useful shortlist, the page points you back to Discover.

### Watchlist

Keep titles found on Anime Shuffle alongside your MyAnimeList Plan to Watch entries. The list defaults to what best matches your taste, with sorting by date added or total runtime and dropdown filters for genre, format, length, and release status. Search supports the Japanese and English titles supplied by MAL.

- Export a readable text list or a JSON backup.
- Import an Anime Shuffle text export or JSON backup with format validation and duplicate detection. JSON keeps full metadata; text restores titles by their MAL links and preserves saved dates to the day.
- Optionally add site saves and imports to MAL Plan to Watch.
- Remove entries from both lists after confirmation when the title is also on MAL.

MAL provides a last-updated timestamp rather than the original date a title was added to Plan to Watch. The app labels that distinction instead of guessing an added date.

## How recommendations are chosen

The recommender learns **enjoyment** and **interest in watching** separately. Good/Bad reactions and personal MAL ratings inform enjoyment; Would watch/Won't watch reactions and list statuses inform viewing interest. Unrated completed and currently watching anime still provide useful evidence, while dropped titles reduce interest. A MAL score of zero is treated as unrated.

Two regularized logistic models use genres, synopsis terms, narrative aspects, studios, format, and runtime. Story features include tone, relationships, character growth, rivalries, antagonist-driven conflict, moral choices, settings, story structure, and the context of mechs. Feature combinations distinguish, for example, a quiet school friendship from psychological suspense. Pacing cues are used only when explicitly described. These are learned automatically from existing reactions and personal ratings; no extra taste questionnaire is needed. A saved show is a weaker interest signal than a confirmed like and never counts as proof of enjoyment. Their scores are combined with a small nearest-neighbor component and a diversity adjustment. The neighbor component keeps different interests separate—for example, enjoying both cozy comedies and political thrillers does not require every suggestion to combine them. Discover occasionally explores beyond the closest matches; Recommendations focuses on the strongest candidates. Candidates come from MAL charts, seasonal listings, and recommendations associated with anime you like. Loaded recommendation batches stay in place until Refresh picks; each card has its own Undo while that reaction is in the current session history.

The app filters out known titles and checks direct prequel relationships before suggesting sequels. Seasons and parts remain separate MAL entries: a reaction or watchlist save affects only that entry. Direct sequel links from positive examples also retrieve follow-ups outside the current catalog pages. A small relationship score connects a candidate to its preceding entry, alongside that candidate’s own content; it never copies a rating across the franchise. Explanations name the preceding entry without revealing plot details. Children’s titles are off by default. Enabling them still requires clear positive interest in children’s shows, with a limit of one in ten Discover choices and one per recommendation batch. Unrated childhood viewing alone does not establish current interest. The default filter excludes Kids tags, PG · Children, and G · All ages. This intentionally excludes some general-audience titles too; a G rating by itself does not establish that a show is aimed at children. The app does not infer or store your age. Explanations use the features that contributed positively to a pick. **Time spent looking at a card is never used.**

Public MAL reviews from [Tenrai](https://api.tenrai.org/documentation) add supporting clues about pacing, visual direction, animation, music style, dialogue, writing consistency, repetition, and character dynamics. Background jobs sample one page of completed, non-spoiler reviews per anime. An attribute needs agreement from at least three distinct reviewers; contradictory descriptions reduce or remove it. Reviews are subjective, so these features have less weight than your own reactions. Only fixed, non-plot descriptions can appear in explanations. Raw review text and reviewer identities are never cached or sent to the browser. Optional model analysis receives only public review clauses, without reviewer identities.

The hosted app also learns small item-to-item correlations from saved site reactions, requiring at least five other accounts with overlapping choices. Private MAL lists and guest history are not pooled. Sparse or constant samples contribute nothing. Both kinds of enrichment fall back to the existing content model when unavailable and never replace an already loaded recommendation batch.

A second attribute layer separates mecha-focused stories from incidental mechs, romance subplots from romance-led stories, and reincarnation, transported-world, summoned-hero, and otome-game premises. It also tracks power-system rules, outcast progression, stealth versus supernatural combat, chibi cutaways versus a chibi art style, villain design versus motivation, and other story and presentation details. Attribute combinations help distinguish preferences that share a genre. Unknown attributes stay unknown; conflicting prominence claims are not treated as facts.

After a reaction, **Add a reason** lets you identify the part that mattered: characters, visuals, story, romance, mecha, sports, pacing, tone, or music. This directs more of that vote toward relevant known attributes instead of treating every part of the show as equally important. Feedback stays with the reaction and syncs with signed-in Cloudflare accounts. It does not create a blanket ban on a genre.

Episode flags are checked separately in the background, up to 150 requests per UTC day. Details shows how many episodes were checked and distinguishes partial from complete coverage. Only complete available episode lists contribute a filler-rate feature. Provider filler flags are not a canon judgment, and filler, recaps, slow pacing, and total length remain separate concepts.

**Cloudflare Workers AI** catalog analysis is enabled in `wrangler.jsonc` and runs in a separate persistent background queue. It combines the public synopsis with a bounded, spoiler-permissive sample of completed reviews for private research; no accounts, private lists, ratings, or reviewer identities are sent to the model. Premise traits require cited synopsis sentences; critical traits require at least three independent review authors. Invalid or unsupported output is discarded. The model can select from the full research vocabulary, distinguishing prominence and confidence. Automated profiles stay preliminary and never override owner-imported traits.

There is no default 20-request app cap. `AI_DAILY_REQUEST_LIMIT=0` runs until Cloudflare reports exhaustion; the queue pauses until after the next midnight UTC and resumes automatically. Temporary capacity errors back off separately. Set a positive limit to add an app cap, or `AI_TASTE_ENRICHMENT=false` to turn model work off. The `AI` binding is required. On a Workers Free account, Cloudflare enforces its free allowance. This mode is not a spending cap on a Paid account; choose a positive limit before upgrading if desired. Request counts and reported tokens appear in the dashboard; they are not a remaining-neuron meter.

Titles encountered in Discover, details and imported viewing history are queued, with history and opened titles prioritized. The background catalog scan starts with popular titles and advances one 50-title page every six hours, gradually widening coverage. Jobs, source fingerprints and accepted model profiles survive deployment and have no 2,000-profile eviction limit. Unchanged completed titles reuse their saved analysis; changed metadata or an analysis-version change queues reassessment. Airing/upcoming titles are checked again after 14 days. Identical evidence avoids another model call. A source outage retains the premise profile and retries review evidence later. Existing recommendations work throughout, and loaded picks are never replaced by background results.

The website model does not search the general web. Broader official/editorial research is supported by source-linked JSON imports through `/admin`. The bundled pilot includes that external research for five titles, with the other twenty marked preliminary. The local Node server runs rule analysis and supports research imports without a Workers AI binding.

The model never writes the explanation shown to a user. Explanations use fixed descriptions and the features that actually contributed to ranking. This reduces spoiler leakage and unsupported prose, but neither text rules nor a model can guarantee a correct reading of irony or subjective criticism. These are evidence-based guesses, not objective scores for writing or animation quality. There is no claim of a trained embedding model or visual analysis of trailers.

## Built with

| Layer                         | Technology                                                     |
| ----------------------------- | -------------------------------------------------------------- |
| Interface                     | React, JavaScript, responsive CSS                              |
| Frontend build                | esbuild                                                        |
| Hosted backend                | Cloudflare Workers and a SQLite-backed Durable Object          |
| Local backend                 | Node.js                                                        |
| Anime data and authentication | MyAnimeList API and OAuth; Tenrai for public review enrichment |
| Tests                         | Node's test runner, jsdom, and Miniflare                       |

On the hosted app, signed-in preferences, reactions, and watchlists persist across devices. The complete guest profile stays in the browser; the Cloudflare deployment reports a bounded anonymous snapshot for owner diagnostics. MAL authorization happens on MyAnimeList; credentials and tokens stay on the backend.

Public anime metadata is cached, concurrent reads are shared, and background synchronization keeps loaded cards visible. Background checks use a five-minute freshness window while the page is visible and online; manual refresh is also available. Returning to Discover keeps its loaded card in place. If it has since been added to MAL or reacted to elsewhere, its reaction buttons are disabled and Skip moves to the next eligible title.

Review enrichment runs automatically on the backend. Cloudflare uses persistent Durable Object alarms; the Node server uses a persistent SQLite queue. Requests are spaced at least 1.5 seconds apart, capped at 600 per UTC day, and backed off after upstream errors. Timeouts, rate limits, and server errors retain their queued titles and pause requests for progressively longer intervals (one minute up to one hour, or longer when requested by the upstream service). Retry state survives restarts and resumes automatically. Profiles refresh after 14 days; empty samples retry after two days. Set `REVIEW_ENRICHMENT=false` (the older `JIKAN_REVIEWS=false` setting is also supported) to disable the integration. Set `RECOMMENDATION_DEBUG=true` for backend timing/sample-count logs; logs omit review text and account information. No additional API key is needed.

For a read-only check from the browser console, run `await animeShuffleDebug.enrichment()`. It reports successful fetches, failures, queued jobs, cached profiles with supported traits, and their contribution to the current taste model, including nuanced attributes, episode coverage, and model status. An empty review sample is reported separately from a failed request. Loaded recommendation batches remain unchanged; new profile data is used when you request fresh picks.

## Run locally

Use a Node.js version supported by the development dependencies: **22.22.2+ in v22**, **24.15.0+ in v24**, or **26+**.

```sh
git clone https://github.com/dc1818/AnimeShuffle.git
cd AnimeShuffle
npm ci
npm run build
npm start
```

Open [localhost:5173](http://localhost:5173). Without MAL credentials, the app uses seven sample titles. The GitHub Pages demo uses the same sample set and does not provide accounts or live MAL access.

### Enable MyAnimeList locally

1. Register a **Web** application at [MyAnimeList API configuration](https://myanimelist.net/apiconfig).
2. Register `http://localhost:5173/auth/callback` as its redirect URL.
3. Copy `.env.example` to `.env` and enter your credentials:

```dotenv
MAL_CLIENT_ID=your_client_id
MAL_CLIENT_SECRET=your_client_secret
PORT=5173
```

Restart the server. The Client ID enables the live catalog; the Client Secret is also required for account authorization. If you change the port, update the registered callback to match. Keep `.env` out of version control.

The Node server stores account records in `.data/`. The hosted Cloudflare app uses persistent database storage; the local server is intended for development and does not provide the same cross-device persistence.

## Development

| Command                  | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `npm run build`          | Build the frontend into `dist/`                           |
| `npm start`              | Start the local Node server                               |
| `npm test`               | Run component, recommendation, API, and persistence tests |
| `npm run check`          | Check server and core logic syntax                        |
| `npm run build:pages`    | Build the standalone sample demo into `docs/`             |
| `npm run dev:cloudflare` | Build and run the Cloudflare development environment      |

Edit `src/` and rebuild to see frontend changes. The checked-in `dist/` supports the runnable local app; `docs/` serves the GitHub Pages demo. Regenerate both after frontend changes rather than editing generated files.

| Directory         | Contents                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `src/components/` | Discover cards, recommendation leaderboard, watchlist, and settings      |
| `src/lib/`        | Application state, recommendation models, filtering, and synchronization |
| `lib/`            | Shared MAL adapter, local accounts, and server utilities                 |
| `cloudflare/`     | Worker routes, persistent storage, and hosted authentication             |
| `public/`         | Static assets, app manifest, and policy pages                            |
| `test/`           | Automated tests and API fixtures                                         |

Tests cover rating behavior, title exclusions, backup validation, OAuth handling, account isolation, synchronization races, and UI state. External MAL responses are mocked in automated tests; recommendation quality still requires feedback from real use.

## Credits

Anime information and cover images are provided by [MyAnimeList](https://myanimelist.net). Anime Shuffle is an independent project and is not affiliated with MyAnimeList.

Third-party license notices are included in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

### Research workspace

The owner workspace at `/admin` manages shared anime taste profiles. It exports catalog batches with an analysis checklist and vocabulary, validates researched JSON before import, and keeps source links, confidence, scope, unknowns and revision history. The latest import can be undone. Imported profiles are stored separately from expiring API caches and are reused by Discover and Recommendations without running a model during a swipe.

Access uses an existing account and the server-side `ADMIN_ACCOUNT_IDS` allowlist; it is denied by default. Public exports contain anime metadata, never account records or OAuth tokens. A source-linked pilot includes 25 titles: five with additional critical research and 20 preliminary premise profiles. Scores describe evidence judgments, not probabilities or guarantees of enjoyment.

### Activate the owner workspace

1. Deploy the latest `main` commit to the existing Cloudflare Worker. Keep its existing `BACKEND` binding, stable object name, database migration and authentication secrets.
2. Sign in to your existing Anime Shuffle account and open `/admin`. The page displays your exact account ID if access has not yet been granted.
3. In that Worker's **Settings → Variables and Secrets**, add **Secret** `ADMIN_ACCOUNT_IDS` containing that ID. Multiple owner IDs can be comma-separated. Save and deploy, then refresh `/admin`. A username or MAL client ID is not an account ID. No visitor can self-assign admin access.
4. Confirm Background services shows model enabled, then a successful run or a specific pause reason. The repository enables `AI_TASTE_ENRICHMENT=true` and declares the `AI` binding. Check these in the deployed settings if the dashboard reports disabled.

The workspace shows source links, evidence notes, confidence, unknowns, coverage, model attempts/tokens, queue state, and import history. Export pending/catalog inputs for research, manual profiles for backup, or automatic profiles from the export selector. Validate a JSON file first, review the changes, then import. Changed inputs or revision conflicts require a fresh preview. Undo restores the previous manual profiles; automated background results never overwrite those records. Downloads contain public metadata and shared analyses only.

`data/research-seed.mjs` installs the 25-profile pilot once per database. Future deployments preserve imported revisions. Functional tests validate authorization, input validation, persistence, quota retries and ranking integration; model accuracy and recommendation quality still need real-user evaluation.

### Account administration and analytics

The hosted owner workspace has Overview, Accounts & tastes, Algorithm, and Anime research tabs. Overview shows API activity, errors, response times, country distribution, active signed-in accounts and audit activity. These are API request counts, not page views, unique visitors or conversion rates. The image proxy is excluded. Collection starts at deployment; historical registrations remain unknown unless recorded. Set `ADMIN_ANALYTICS=false` to pause collection.

Account inspection includes saved site reactions/watchlist choices, reason feedback, preferences, favorite anime, login provider, linked MAL ID, current status, timestamps and recent approximate location/IP. Only the latest network observation is retained, encrypted with the existing server vault key, for 30 days. Country/region/city/timezone come from trusted Cloudflare metadata, not client-supplied location fields. Aggregate activity is retained 90 days and admin audit records 180 days. Credentials never reach admin APIs. Private MAL lists are not copied into this workspace. Guest browsers report a bounded anonymous copy of their local choices and preferences, described below. Taste summaries use up to 1,000 site reactions; reaction paging allows inspecting the full stored history.

Account actions require a reason, account-ID confirmation and a matching version to prevent stale overwrites. Owners can edit viewing filters, rename local login usernames, restart onboarding, revoke sessions, suspend and restore accounts. Owner accounts cannot be suspended from the UI. Suspension and session revocation invalidate existing authenticated sessions, including legacy sessions; suspensions also block password and MAL login. Favorites and reaction history are preserved. Preference audit history can load a previous version into the editor for review and reapplication. Admin status still comes exclusively from the deployment allowlist.

Algorithm diagnostics show current reaction totals, genre response patterns, explicit reasons, title-level disagreement and research coverage. The account candidate inspector runs the same content-model code on a bounded stored-data sample and exposes contributions and neighbor evidence without changing live picks. It is explicitly not an exact replay of private MAL history, client state, eligibility, diversity or community signals. Location never becomes a preference feature, and aggregate response counts are not claims of causal recommendation quality.


### Guest-browser diagnostics

Cloudflare sessions advertise whether analytics is enabled. Each guest browser keeps a random identifier in its localStorage profile and IndexedDB backup. Reporting begins after the local profile is restored and is debounced after changes. The server stores a keyed hash, not the browser identifier. Failed reports never block local saves or recommendations. Signed-in sessions do not send guest snapshots.

`/admin` includes Guest browsers, with first/last activity, approximate location and recent encrypted IP, onboarding, viewing preferences, reasons, current reactions and taste evidence. Overview distinguishes active signed-in accounts from guest browsers and counts return activity on distinct UTC days. Algorithm diagnostics combine both cohorts and expose their separate counts. Guest history is limited to 1,000 latest choices per browser; reported total count and partial coverage remain visible. Repeated reports, reaction changes, Undo and removals update existing records. Guest snapshots expire after 90 inactive days; network details expire after 30 days. Set `ADMIN_ANALYTICS=false` to disable collection. Browser resets/devices can create multiple identities, and self-reported snapshots are not verified unique people or grounds for automatic global-weight changes.

### Reusable analysis depth and free-plan enrichment

The model queue uses `@cf/meta/llama-3.1-8b-instruct-fp8-fast` by default, with `AI_DAILY_REQUEST_LIMIT=0` meaning no application request cap. It runs one background job at a time, keeps queued work through quota exhaustion, pauses until after midnight UTC on Cloudflare error 3036, and backs off temporary capacity failures. On Workers Free, Cloudflare enforces its daily neuron allowance. Popular-catalog discovery checks every ten minutes while the queue holds fewer than 100 jobs; encountered titles/history retain priority. Completed profiles persist separately from expiring metadata/review caches. Unchanged evidence reuses an existing result, and completed titles do not undergo routine time-based model reruns. Changing the analysis version deliberately queues a new pass for added capabilities.

New automatic profiles may contain up to 48 evidence-backed ranking observations and 24 reusable `dimensions`, with `{key,area,description,basis,confidence,sources}`. Dimensions retain context beyond today's fixed taxonomy across premise, world, characters, powers, relationships, conflict, structure, pacing, tone, comedy, presentation and music. `coverage` records partial/unknown areas; old import files remain compatible. These notes are preserved in imports/exports and displayed only in the owner workspace. They never become executable ranking rules or generated public explanations. Synopsis cannot support execution judgments, and automatic critical descriptions still require three review authors.

A bounded synopsis/review sample is not exhaustive research. Unsupported facets, detailed adaptation research and new tastes absent from the retained evidence need further sources and another analysis. Existing starter/imported profiles do not gain depth simply because the schema expanded. The model does not browse external websites on its own; separately researched uploads can cite external sources.


### Research questions and spoiler controls

Private model research may use spoiler-tagged reviews to assess relationships, character arcs and long-term payoffs. It still analyzes only the exact adaptation and retains original bounded summaries, source references and confidence rather than raw reviews or reviewer identities. `spoilersAllowed` records the policy and dimensions can carry `containsSpoilers`. All profile free text is hidden by default in admin, including scope, evidence, coverage notes, dimensions, caveats and sources. Each profile has an explicit Reveal private research button; refreshing hides it again. Shared recommendation endpoints contain numeric observations and fixed vocabulary labels only. Owner exports preserve private research and may contain spoilers.

The Research tab can register questions with a stable `dimensionKey`, human-readable label and research area. Questions are persistent, exported alongside catalog batches, passed to future model calls, and included in the analysis-version hash. Saving them queues refreshed model analysis without discarding existing profiles. The coverage audit checks exact stored keys and reports supported, partial, missing, unknown or changed evidence, with paginated JSON exports that omit private plot notes. A question is a research requirement, not evidence about a show and not an automatically enabled ranking feature. New abstract tastes may still need taxonomy/algorithm changes plus additional sources. Missing keys cannot establish semantic absence, and no bounded profile is guaranteed to answer every future question.
