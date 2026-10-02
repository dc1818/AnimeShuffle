# Anime Shuffle

**Find your next anime and build a watchlist that fits your taste.**

[Try Anime Shuffle](https://animeshuffle.com) · [Sample demo](https://dc1818.github.io/AnimeShuffle/)

Anime Shuffle helps turn a long list of anime into something you actually want to watch. Browse one title at a time, tell it what you've enjoyed or would watch, and explore a shortlist based on those choices.

Connect MyAnimeList to start with your existing watch history and Plan to Watch list, create an Anime Shuffle account, or try it as a guest. Personal ratings help when you have them, but aren't required.

## How it works

### Discover

Start with favorite genres and a few anime you like, then browse individual cards with cover art, English titles where available, and expandable details. Choose one of four reactions:

| Reaction | What it means |
| --- | --- |
| **Good** | I've seen this and liked it. |
| **Bad** | I've seen this and didn't like it. |
| **Would watch** | Add this to my watchlist. |
| **Won't watch** | I'm not interested in watching this. |

Skip a title without rating it, or undo your last choice. Good and Bad are disabled for anime that haven't aired yet. Viewing preferences let you choose genres (or Any genre), formats, series lengths, and whether to include ongoing or upcoming releases. Selected genres restrict Discover and Recommendations to anime matching at least one choice. Cards on both pages show a small reminder of active genre selections; Any genre shows no reminder. Genre controls are available in preferences for guests and signed-in users.

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

Two regularized logistic models use genres, synopsis terms, studios, format, and runtime. Their scores are combined with a diversity adjustment. Discover occasionally explores beyond the closest matches; Recommendations focuses on the strongest candidates. Candidates come from MAL charts, seasonal listings, and recommendations associated with anime you like.

The app filters out known titles and checks direct prequel relationships before suggesting sequels. Children’s titles default to Automatic: MAL’s Kids tag requires positive audience interest, with a limit of one in five Discover choices and two per recommendation batch. Unrated completed children’s shows alone do not establish current interest. Viewing preferences also offer Include and Hide overrides. All-ages ratings alone are not filtered, and the app does not infer or store your age. Explanations use the features that contributed positively to a pick. **Time spent looking at a card is never used.**

This is a content-based recommender. It doesn't compare your behavior with other users, and synopsis matching uses shared terms rather than a full understanding of the story. Recommendation quality depends on the available metadata and your feedback.

## Built with

| Layer | Technology |
| --- | --- |
| Interface | React, JavaScript, responsive CSS |
| Frontend build | esbuild |
| Hosted backend | Cloudflare Workers and a SQLite-backed Durable Object |
| Local backend | Node.js |
| Anime data and authentication | MyAnimeList API and OAuth |
| Tests | Node's test runner, jsdom, and Miniflare |

On the hosted app, signed-in preferences, reactions, and watchlists persist across devices. Guest data stays in the browser. MAL authorization happens on MyAnimeList; credentials and tokens stay on the backend.

Public anime metadata is cached, concurrent reads are shared, and background synchronization keeps loaded cards visible. Background checks use a five-minute freshness window while the page is visible and online; manual refresh is also available.

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

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Start the local Node server |
| `npm test` | Run component, recommendation, API, and persistence tests |
| `npm run check` | Check server and core logic syntax |
| `npm run build:pages` | Build the standalone sample demo into `docs/` |
| `npm run dev:cloudflare` | Build and run the Cloudflare development environment |

Edit `src/` and rebuild to see frontend changes. The checked-in `dist/` supports the runnable local app; `docs/` serves the GitHub Pages demo. Regenerate both after frontend changes rather than editing generated files.

| Directory | Contents |
| --- | --- |
| `src/components/` | Discover cards, recommendation leaderboard, watchlist, and settings |
| `src/lib/` | Application state, recommendation models, filtering, and synchronization |
| `lib/` | Shared MAL adapter, local accounts, and server utilities |
| `cloudflare/` | Worker routes, persistent storage, and hosted authentication |
| `public/` | Static assets, app manifest, and policy pages |
| `test/` | Automated tests and API fixtures |

Tests cover rating behavior, title exclusions, backup validation, OAuth handling, account isolation, synchronization races, and UI state. External MAL responses are mocked in automated tests; recommendation quality still requires feedback from real use.

## Credits

Anime information and cover images are provided by [MyAnimeList](https://myanimelist.net). Anime Shuffle is an independent project and is not affiliated with MyAnimeList.

Third-party license notices are included in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
