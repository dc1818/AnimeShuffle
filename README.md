# Anime Shuffle

An anime discovery app for finding something to watch and building your MyAnimeList Plan to Watch list.

Browse one anime at a time, react to it, and get suggestions based on your interests. Connect MyAnimeList to use your existing list, or start as a guest. You don't need to rate shows for recommendations to work.

Built with React, CSS, and Node.js. The full app runs locally; a guest demo can run on GitHub Pages.

## GitHub Pages demo

Once Pages is enabled, open [Anime Shuffle](https://dc1818.github.io/AnimeShuffle/). The demo includes seven sample anime, viewing preferences, all four reactions, details, Undo, and a browser-saved watchlist. Account creation, MAL sign-in, and live catalog access need the Node server and are unavailable on Pages.

To publish: open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/docs**, then save. GitHub publishes the checked-in `docs/` build.

After changing the interface, run `npm ci && npm run build && npm run build:pages`, then commit the source and both build folders. No API credentials belong in the Pages build.

## Features

- Sign in with MyAnimeList or create an Anime Shuffle account.
- First-visit setup for favorite genres, three searchable favorite anime, format, series length, and finished shows. Favorites guide your taste; they are not shown again in Discover.
- Four reactions that distinguish shows you've seen from shows you might watch.
- Recommendations based on your reactions and, optionally, your MAL list.
- A watchlist ordered by best match, with dropdowns for date added, runtime, genre, format, length, and release status. Export the entire active list as a text file.
- Optional additions to MAL Plan to Watch.
- Expandable details with MAL community scores and age ratings when available, cover-based background colors, and a mobile layout.
- Skip, Undo, and keyboard shortcuts.

## Public hosting

See [HOSTING.md](HOSTING.md) for the Render deployment setup, private environment variables, persistent storage, and every MyAnimeList registration field. The full website and API run together; GitHub Pages remains a guest demo.

## Getting started

Install [Node.js 22 or newer](https://nodejs.org/), then clone the repository or download it using **Code → Download ZIP**.

```sh
git clone https://github.com/dc1818/AnimeShuffle.git
cd AnimeShuffle
node server.mjs
```

Open **http://localhost:5173**.

On Windows, you can double-click `start.bat` instead. On macOS or Linux, run `sh start.sh`. These launchers also open the browser. Keep the terminal open while using the app; press **Ctrl+C** to stop it.

A prebuilt frontend is included, so `npm install` isn't needed just to run the app. Without API credentials, it starts with seven sample anime. Cover images require an internet connection.

## Accounts and first-time setup

The welcome screen offers four ways to get started:

- **Create an Anime Shuffle account:** choose a username and password here. No MAL account is required.
- **Sign in with MyAnimeList:** authorize the app on MAL and use that account as your Anime Shuffle login.
- **Create a MyAnimeList account:** opens MAL registration in a new tab. Once registered, return and choose Sign in with MyAnimeList.
- **Try without logging in:** continue as a guest.

Existing Anime Shuffle users can sign in from the welcome screen. Local accounts can also connect MAL from Settings to import a list without switching their Anime Shuffle identity. Signing in directly with MAL uses a separate MAL-based profile; it does not merge local accounts automatically.

After choosing an account or guest access, select what you want to watch:

| Preference          | Choices                                                   |
| ------------------- | --------------------------------------------------------- |
| Format              | Series, Movies, Shorts & specials, or Anything            |
| Series length       | 1–13, 14–26, 27–49, 50–99, or 100+ episodes               |
| Release status      | Include ongoing/upcoming titles, or finished shows only   |
| Missing information | Include or exclude unknown lengths/formats when filtering |

You can select more than one format or length. Episode ranges apply to series, so selecting a long series range alongside Movies still allows movies. Hour estimates in the picker assume 24-minute episodes; cards calculate their estimate from the title's listed episode count and runtime. Unknown totals are labeled instead of guessed.

**Surprise me** accepts any format and length. Change your choices later under **Settings → Viewing preferences**. If the sample set has no matches, broaden your choices or enable the live catalog.

Signed-in viewing preferences are saved on this local installation. Guest preferences, reactions, and saved picks stay in the browser. Accounts currently have no email verification or password-recovery service.

## MyAnimeList setup

Live discovery requires a MAL Client ID. Connecting your account also requires a Client Secret.

1. [Register an application on MyAnimeList](https://myanimelist.net/apiconfig) with the app type set to **Web**.
2. Set its redirect URL to `http://localhost:5173/auth/callback`.
3. Copy `.env.example` to `.env` in the project root.
4. Fill in your credentials:

```dotenv
MAL_CLIENT_ID=your_client_id
MAL_CLIENT_SECRET=your_client_secret
PORT=5173
```

5. Restart the server and select **Sign in with MyAnimeList**, or **Connect MyAnimeList** in Settings if you already have an Anime Shuffle account.

Sign-in happens on MyAnimeList. The client secret and login tokens stay on the local server.

On Windows, make sure the filename is `.env`, not `.env.txt`. If you change the port, update the redirect URL in MAL's settings to match. Use `localhost` as the hostname.

The `.env` file is ignored by Git. Keep your credentials out of commits.

## Using the app

| Reaction        | Meaning                                    |
| --------------- | ------------------------------------------ |
| **Good**        | I've seen this and liked it.               |
| **Bad**         | I've seen this and didn't like it.         |
| **Would watch** | I haven't seen this and want to watch it.  |
| **Won't watch** | I haven't seen this and am not interested. |

Each reaction moves to the next anime. **Would watch** saves the title to your local watchlist. **Good** and **Bad** affect recommendations without changing your MAL ratings or marking anything completed.

**Skip** moves on without recording a preference. **Undo** reverses your last reaction or skip. **More about this anime** opens the full description and additional information.

### Watchlists

**Saved here** contains your local picks. **MAL Plan to Watch** shows the planned entries imported from your account. Use **Refresh MAL** to reload your list.

In Settings, you can enable **Auto-add to MAL Plan to Watch**. It's off by default. When enabled, Would watch also adds new titles to MAL. You can add individual saved titles manually instead.

Before adding a title, the server checks whether it already has a MAL status and preserves existing entries. Removing a local saved title doesn't remove it from MAL.

Undo can reverse an automatic MAL addition for up to an hour, provided the entry hasn't changed since it was added. Manual additions can be removed on MAL.

### Keyboard shortcuts

| Key       | Action                    |
| --------- | ------------------------- |
| `1` / `2` | Good / Bad                |
| `3` / `4` | Would watch / Won't watch |
| `Space`   | Skip                      |
| `U`       | Undo                      |
| `I`       | Toggle details            |
| `Escape`  | Close details             |

Shortcuts are inactive while a dialog is open or a control has focus.

## Recommendations

The third tab shows up to 25 tailored picks in a vertical leaderboard. Every card has a numbered tier: gold 1, silver 2, bronze 3, then plain 4–25. These are relative match positions, not probabilities or global anime ratings. The shortlist excludes saved, MAL Plan to Watch, seen and rejected titles, and learns from unrated Watching and Plan to Watch entries. Click a numbered row to expand its full card in place. Only one row opens at a time. React on the expanded card using the same four actions as Discover; use Refresh picks to replenish the shortlist. Narrow filters or the seven-title demo can produce fewer than 25 matches.

Cards show MAL release status. Good and Bad are disabled for Not yet aired titles, including keyboard actions. Unknown release statuses are labeled explicitly.

Suggestions use genre and format preferences, with some variety mixed in to avoid repeating the same kinds of shows.

When MAL is connected, **Currently Watching** and **Plan to Watch** entries help establish your interests. Completed shows provide a weaker signal. Unrated shows still count; a missing rating isn't treated as a dislike. If you do rate shows, scores are considered relative to your own average.

Direct reactions take priority over those inferred preferences. About 20% of later picks explore outside the usual ranking. Titles already on your MAL list or already reacted to are excluded from discovery. Direct sequels are filtered when their listed prequel isn't known as watched or currently watching.

Candidates are loaded in pages from MAL's popularity, ranking, and seasonal endpoints. The app doesn't need a local copy of the entire database.

## Development

For the build and test tools, use Node.js **22.22.2+ within v22**, **24.15.0+ within v24**, or **26+**.

```sh
npm ci
npm run build
npm start
```

Edit files in `src/`, then run `npm run build` and refresh the browser. The build bundles React and copies the static assets into `dist/`.

| Command          | Purpose                            |
| ---------------- | ---------------------------------- |
| `npm start`      | Start the local server             |
| `npm run build`  | Build the frontend                 |
| `npm test`       | Run the test suite                 |
| `npm run check`  | Check server and core logic syntax |
| `npm run format` | Format the source with Prettier    |

### Project structure

| Path                     | Contents                                                       |
| ------------------------ | -------------------------------------------------------------- |
| `src/App.jsx`            | Page layout, navigation, and keyboard handling                 |
| `src/components/`        | Anime cards, details, watchlist, and dialogs                   |
| `src/lib/store.js`       | Application state and API operations                           |
| `src/lib/recommend.js`   | Recommendation scoring and filtering                           |
| `src/styles.css`         | Styles and responsive layouts                                  |
| `server.mjs`             | Local server, OAuth, and API routes                            |
| `lib/mal.mjs`            | MAL requests, token refresh, and response handling             |
| `lib/accounts.mjs`       | Local account authentication and saved viewing preferences     |
| `src/lib/preferences.js` | Shared preference validation, filtering, and runtime estimates |
| `public/`                | HTML entry page and static assets                              |
| `dist/`                  | Generated frontend; edit the source instead                    |
| `test/`                  | Component, recommendation, state, and server tests             |

## Local data

Reactions and saved picks are stored in your browser, separately for guests and each signed-in account. They do not sync between browsers. Imported MAL lists stay in memory.

Anime Shuffle account records and signed-in viewing preferences are saved in `.data/accounts.json`. Passwords use scrypt with a unique random salt; plaintext passwords are not saved. The `.data/` directory is excluded from Git and is never served as a static file. Keep it when updating the app if you want to retain your accounts.

Sessions and MAL tokens are held in server memory. Restarting the server signs users out, but account records and viewing preferences remain. Local accounts can disconnect MAL without signing out of Anime Shuffle; MAL-based accounts use **Sign out**. You can also revoke authorization on MAL.

You can clear local reactions under **Privacy & local data** without changing your MAL list or deleting your account. There are no analytics.

## Current limitations

This is an early local build. The server listens on `127.0.0.1` and isn't configured for public hosting.

- Account, preference, and session tests run locally. MAL tests use mocked responses, and component tests use jsdom. Live OAuth and visual browser checks are still pending.
- MAL lists refresh on connection or manually, not continuously.
- List imports stop at 10,000 entries; each discovery source stops at offset 5,000.
- Undo keeps the last 30 actions for the current page session.
- Sequel filtering depends on MAL's relationship data and doesn't provide a full franchise viewing order.
- MAL updates aren't atomic with changes made in other apps.

## Troubleshooting

| Problem                       | Check                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| The browser doesn't open      | Visit `http://localhost:5173` while the terminal is running.                 |
| The app stays in preview mode | Check the `.env` filename and Client ID, then restart the server.            |
| MAL login fails               | Check both credentials and the exact registered redirect URL.                |
| Port 5173 is busy             | Stop the other instance, or change `PORT` and the MAL redirect URL together. |
| Source changes don't appear   | Run `npm run build`, then refresh the browser.                               |

Anime data and cover images come from MyAnimeList. Anime Shuffle is not affiliated with MyAnimeList. Third-party library licenses are included in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

### Watchlist ordering and filters

Watchlist defaults to Best match, with unreleased titles after available titles. It has no recommendation tiers or medal colors. Sort by newest/oldest date added or shortest/longest total runtime. Unknown values stay last; original MAL added dates are not supplied by this app and are never guessed. Export entire list downloads every title in the active Saved here or MAL Plan to Watch tab, even if filters hide some titles. Search titles and use dropdowns to filter by genre, format, episode count, release status, finished shows and unknown metadata. Watchlist filters do not alter Discover preferences.

Reactions on Recommendations keep the current batch in place and grey out the chosen row with a confirmation label. Would watch saves the anime in Watchlist immediately. Undo re-enables the row; Refresh picks builds a new batch excluding all saved or reacted anime.
