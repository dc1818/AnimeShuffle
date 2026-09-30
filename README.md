# Anime Shuffle — React edition

A local anime discovery app and Plan to Watch helper. Includes the cards-and-shuffle logo, a cover-inspired background, four distinct reactions, expandable anime details, a saved watchlist, and optional MyAnimeList login.

## Technology and code organization

The frontend now uses **React with JSX components and hooks**. CSS styles the React components, and a small HTML entry page hosts the React root. The old imperative DOM controller has been removed. The backend remains a Node.js server so MAL credentials never enter the frontend bundle.

All editable application source is formatted and commented. Comments explain non-obvious behavior: missing-rating semantics, exploration, session/CSRF boundaries, opt-in MAL writes, Undo receipts, state ownership and cover-color sampling. Generated files in `dist/` are compiled output; edit `src/` instead.

## Start on Windows

1. Install **Node.js 22 or newer** from https://nodejs.org if it is not installed.
2. Extract the entire ZIP. Do not launch files from inside the ZIP.
3. Double-click **start.bat**. Keep its terminal window open while using the app.
4. Your browser should open **http://localhost:5173**. If it does not, open that address yourself.

No npm install is needed. No account is needed for the seven-title preview. Cover images require internet access; an offline fallback appears when a cover cannot load. The preview is a small set of hand-authored samples, not the full catalog.

On macOS or Linux, open a terminal in this folder and run `sh start.sh`. On any platform, `node server.mjs` starts the server without opening a browser.

## Enable real anime and MyAnimeList login

1. Register an application at https://myanimelist.net/apiconfig using your MAL account.
2. Use **Anime Shuffle** for the name and **Web** for the application type.
3. Register this exact redirect URL: **http://localhost:5173/auth/callback**.
4. Copy `.env.example` to a new file named `.env` in the same folder as `server.mjs`. On Windows, enable File Explorer → View → Show → File name extensions so it does not become `.env.txt`.
5. Open `.env` in a text editor and fill in your issued Client ID and Client Secret. Do not use quotation marks or paste the credentials into chat or browser code.
6. Stop the server with Ctrl+C, then run `start.bat` again.
7. Choose **Connect MAL**. Sign in and authorize on MyAnimeList's own website. Anime Shuffle never asks for your MAL password.

A Client ID enables live guest catalog discovery. A Client ID and Client Secret enable login. Your MAL account does not have to be connected for live guest discovery once the local app credentials are configured.

If you change `PORT`, also change the registered redirect URL to match. Keep the hostname **localhost**. The server listens only on your computer; it is not a public website.

A suitable app description:

> Anime Shuffle helps users discover anime and organize their Plan to Watch list through simple feedback and recommendations based on their interests and optional MyAnimeList connection

Use your actual project details for the remaining registration fields. This local prototype does not establish approval for a public or commercial service; review the current MAL API agreement before publishing it.

## Four reactions, four meanings

| Button | Meaning | Effect |
| --- | --- | --- |
| Good | I have seen this and liked it | Strong positive recommendation signal |
| Bad | I have seen this and disliked it | Strong negative recommendation signal |
| Would watch | I have not seen this and am interested | Saves locally and provides a positive signal |
| Won't watch | I have not seen this and am not interested | Passes and provides a negative signal |

Every reaction advances to the next anime. **Good and Bad never mark an anime completed or change your MAL numeric score.** Skip has no preference effect. Undo reverses the most recent reaction or skip in this browser session.

**More about this anime** opens a card to the right on desktop and a bottom panel on mobile. Close it to return to the centered card. Settings can turn cover-inspired colors off.

Keyboard shortcuts when focus is outside controls: **1–4** react, **Space** skips, **U** undoes, **I** toggles details, **Escape** closes details.

## Watchlist and optional MAL changes

- **Saved here** contains your local Would watch picks.
- **MAL Plan to Watch** shows your imported MAL entries. Refresh MAL reloads your list.
- **Auto-add to MAL Plan to Watch** is OFF by default. Turn it on in Settings if you want Would watch to add new entries to MAL. You can also add a saved title individually.
- An existing MAL status is preserved. Watching, completed, dropped, on-hold and existing planned entries are never converted by the add action.
- Removing a local saved item does not remove it from MAL.
- Undo can remove an entry that this reaction just added to MAL, for up to one hour while the server session remains active. It first checks status, score, progress and modification timestamp. If the entry changed on MAL, it leaves it untouched and explains why. Manual watchlist additions are managed on MAL rather than through reaction Undo.

Guest and connected-account reactions are stored separately. Connecting does not silently copy guest reactions into your account.

## How recommendations work

This first version uses an explainable content-based algorithm rather than a trained machine-learning service.

- Guests start with a mix of familiar titles. The first eight live reactions emphasize variety.
- Unrated **currently watching** and **Plan to Watch** entries provide positive signals. Completed entries supply weaker evidence. **A missing score is never treated as a zero-star review or a dislike.**
- When scores exist, the algorithm compares them with that user's average rather than assuming everyone scores the same way.
- Explicit reactions override inferred signals for the same anime.
- Genre and format preferences guide picks. Roughly 20 percent of later selections explore beyond the usual preferences. Recent genre repetition gets a small penalty.
- Known list entries and already-reacted titles are excluded from the discovery feed. Plan to Watch entries remain accessible in the watchlist.
- Direct sequels are filtered when their MAL prequel is not known as watched/watching. This relies on MAL relationship metadata and is not a complete franchise viewing-order engine.
- New candidates are fetched in bounded pages from popularity, ranking and current-season API endpoints. The app does **not** download the entire MAL database. API requests are queued, spaced apart and handle rate limiting.

Future improvements can include stronger use of MAL's related recommendations, opt-in per-genre controls, franchise grouping, and learning from interactions after enough feedback exists. The current explanation labels reflect simple genre/list signals, not predicted percentages.

## Data and security

The local server keeps the client secret out of browser code. OAuth uses a random state, a one-use expiring callback, PKCE using MAL's plain challenge method, and an HttpOnly SameSite session cookie. Tokens live only in server memory and disappear on restart. Protected writes require a same-origin request and a CSRF token. The server validates Host and binds only to 127.0.0.1.

The browser stores your own reactions and selected anime metadata in localStorage. Imported profile and MAL lists stay in memory. Public anime responses have a bounded, 30-minute server cache. Images pass through a host-restricted MAL cover proxy so the app can derive background colors. No analytics are included.

Anyone with access to this browser profile can see its locally saved reactions. Disconnect to remove the local authorization session; revoke the app on MAL if you also want to revoke its authorization there. Privacy & local data can clear local reactions without changing MAL entries.

This is a **local prototype**, not a hardened hosted multi-user service. Do not expose its port to the internet. A hosted release needs a separate review of API terms, HTTPS, deployment/session storage, account privacy, and production operations.

## Checks and current limits

To develop or run tests, use Node.js 22.22.2+, 24.15.0+, or 26+ (the jsdom test dependency requires these versions), then run `npm ci` in the app folder. Dependency versions are pinned in `package-lock.json`.

```sh
npm ci
npm run build
npm test
npm run check
```

`npm run build` bundles React and the JSX source into `dist/`. Run it again after editing `src/`, then refresh your browser. CSS is copied from `src/styles.css`. `npm run format` formats the source with Prettier. No React CDN or browser-side JSX compiler is required.

The included prebuilt `dist/` lets you run `start.bat` without this development setup. Both frontend and backend source are included.

Tests cover preference semantics, real React component rendering/events in jsdom, account state commands, image URL restrictions, public/private API handling, refresh tokens, and an HTTP integration flow with a test-only MAL response double. jsdom verifies behavior; it does not verify visual layout or native browser rendering.

The integration tests exercise callback rejection, session rotation, token non-disclosure, CSRF protection, preservation of existing list statuses, concurrent additions and Undo protection for changed entries. They do not contact a real MAL account.

**Live OAuth and real MAL API responses were not end-to-end verified with an issued Client ID/Secret. Browser rendering was not visually verified in this build environment.** Test those on your computer before relying on automatic MAL updates. The app can run immediately in its clearly labeled preview mode.

Other limits: imported lists are capped at 10,000 entries; discovery sources at offset 5,000 each; full MAL sync occurs on connect or manual refresh, not in the background. Undo history lasts for the current page session, up to 30 reactions. MAL changes made from another app between the final check and a write cannot be made fully atomic with these API endpoints.

## Project files

- `server.mjs` — local HTTP server, OAuth callbacks, authenticated API routes and image proxy.
- `lib/mal.mjs` — MAL API adapter, normalization, token refresh, request queue and bounded public cache.
- `src/main.jsx` — mounts React with StrictMode and creates the shared application store.
- `src/App.jsx` — page composition, navigation, dialog visibility and keyboard shortcuts.
- `src/components/` — anime card/details, watchlist, dialogs and shared icons.
- `src/lib/store.js` — testable state and async commands; React subscribes using `useSyncExternalStore`.
- `src/lib/recommend.js` — pure recommendation functions with documented weighting/filtering rules.
- `src/lib/demo.js` — seven hand-authored preview fixtures with MAL cover references.
- `src/styles.css` — formatted, responsive CSS and cover-inspired theme variables.
- `public/` — HTML entry page, Anime Shuffle logo and favicon.
- `scripts/build.mjs` — builds the production React bundle using esbuild.
- `dist/` — generated, ready-to-run frontend. Do not edit it directly.
- `test/` — recommendation, React component, state, API and HTTP integration tests.
- `THIRD_PARTY_NOTICES.txt` — licenses for libraries included in the browser bundle.

The Anime Shuffle logo was generated for this project. Anime titles, metadata and covers remain associated with their respective rights holders and source. Anime Shuffle is not affiliated with MyAnimeList.
