# Anime Shuffle

An anime discovery app for finding something to watch and building your MyAnimeList Plan to Watch list.

Browse one anime at a time, react to it, and get suggestions based on your interests. Connect MyAnimeList to use your existing list, or start as a guest. You don't need to rate shows for recommendations to work.

Built with React, CSS, and Node.js. Currently runs locally.

## Features

- Four reactions that distinguish shows you've seen from shows you might watch.
- Recommendations based on your reactions and, optionally, your MAL list.
- A local watchlist with optional additions to MAL Plan to Watch.
- Expandable anime details, cover-based background colors, and a mobile layout.
- Skip, Undo, and keyboard shortcuts.

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

5. Restart the server and select **Connect MAL** in the app.

Sign-in happens on MyAnimeList. The client secret and login tokens stay on the local server.

On Windows, make sure the filename is `.env`, not `.env.txt`. If you change the port, update the redirect URL in MAL's settings to match. Use `localhost` as the hostname.

The `.env` file is ignored by Git. Keep your credentials out of commits.

## Using the app

| Reaction | Meaning |
| --- | --- |
| **Good** | I've seen this and liked it. |
| **Bad** | I've seen this and didn't like it. |
| **Would watch** | I haven't seen this and want to watch it. |
| **Won't watch** | I haven't seen this and am not interested. |

Each reaction moves to the next anime. **Would watch** saves the title to your local watchlist. **Good** and **Bad** affect recommendations without changing your MAL ratings or marking anything completed.

**Skip** moves on without recording a preference. **Undo** reverses your last reaction or skip. **More about this anime** opens the full description and additional information.

### Watchlists

**Saved here** contains your local picks. **MAL Plan to Watch** shows the planned entries imported from your account. Use **Refresh MAL** to reload your list.

In Settings, you can enable **Auto-add to MAL Plan to Watch**. It's off by default. When enabled, Would watch also adds new titles to MAL. You can add individual saved titles manually instead.

Before adding a title, the server checks whether it already has a MAL status and preserves existing entries. Removing a local saved title doesn't remove it from MAL.

Undo can reverse an automatic MAL addition for up to an hour, provided the entry hasn't changed since it was added. Manual additions can be removed on MAL.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1` / `2` | Good / Bad |
| `3` / `4` | Would watch / Won't watch |
| `Space` | Skip |
| `U` | Undo |
| `I` | Toggle details |
| `Escape` | Close details |

Shortcuts are inactive while a dialog is open or a control has focus.

## Recommendations

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

| Command | Purpose |
| --- | --- |
| `npm start` | Start the local server |
| `npm run build` | Build the frontend |
| `npm test` | Run the test suite |
| `npm run check` | Check server and core logic syntax |
| `npm run format` | Format the source with Prettier |

### Project structure

| Path | Contents |
| --- | --- |
| `src/App.jsx` | Page layout, navigation, and keyboard handling |
| `src/components/` | Anime cards, details, watchlist, and dialogs |
| `src/lib/store.js` | Application state and API operations |
| `src/lib/recommend.js` | Recommendation scoring and filtering |
| `src/styles.css` | Styles and responsive layouts |
| `server.mjs` | Local server, OAuth, and API routes |
| `lib/mal.mjs` | MAL requests, token refresh, and response handling |
| `public/` | HTML entry page and static assets |
| `dist/` | Generated frontend; edit the source instead |
| `test/` | Component, recommendation, state, and server tests |

## Local data

Reactions and saved picks are stored in your browser, separately for guests and each connected MAL account. Imported MAL lists stay in memory. Login tokens are held in server memory, so restarting the server requires reconnecting your account.

You can clear local reactions under **Privacy & local data** without changing your MAL list. There are no analytics.

## Current limitations

This is an early local build. The server listens on `127.0.0.1` and isn't configured for public hosting.

- Tests use mocked MAL responses and jsdom. Live OAuth and visual browser checks are still pending.
- MAL lists refresh on connection or manually, not continuously.
- List imports stop at 10,000 entries; each discovery source stops at offset 5,000.
- Undo keeps the last 30 actions for the current page session.
- Sequel filtering depends on MAL's relationship data and doesn't provide a full franchise viewing order.
- MAL updates aren't atomic with changes made in other apps.

## Troubleshooting

| Problem | Check |
| --- | --- |
| The browser doesn't open | Visit `http://localhost:5173` while the terminal is running. |
| The app stays in preview mode | Check the `.env` filename and Client ID, then restart the server. |
| MAL login fails | Check both credentials and the exact registered redirect URL. |
| Port 5173 is busy | Stop the other instance, or change `PORT` and the MAL redirect URL together. |
| Source changes don't appear | Run `npm run build`, then refresh the browser. |

Anime data and cover images come from MyAnimeList. Anime Shuffle is not affiliated with MyAnimeList. Third-party library licenses are included in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
