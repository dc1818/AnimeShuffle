# Hosting Anime Shuffle

The full app serves React and the API from one Node server. GitHub Pages remains a seven-title guest demo. Adding repository secrets will not enable MAL on Pages.

## Deploy from GitHub to Render

This repository includes `render.yaml` for one paid Node web service with a 1 GB persistent disk. Review Render's current price before deploying. Nothing is provisioned just by committing the file.

1. In Render, choose **New → Blueprint** and connect `dc1818/AnimeShuffle`, branch `main`.
2. Use the repository's `render.yaml`. Enter `MAL_CLIENT_ID` and `MAL_CLIENT_SECRET` in Render's private fields. If you are still applying to MAL, you can deploy without credentials using the manual setup below, then add them afterward.
3. Deploy and copy the actual HTTPS service URL Render assigns. The name `anime-shuffle` does not guarantee any particular hostname.
4. In MAL's application settings, add that exact origin followed by `/auth/callback` as a redirect. Set the homepage to the same origin.
5. Open the Render address, not GitHub Pages. Choose Sign in with MyAnimeList and authorize the app.

Render supplies `RENDER_EXTERNAL_URL`, which the app uses for redirects, allowed hosts and CSRF checks. For a custom domain, configure it with the host first, then set `PUBLIC_ORIGIN=https://your-domain` and register its callback in MAL. No trailing path, query or fragment.

## Manual web service settings

| Setting | Value |
| --- | --- |
| Repository / branch | `dc1818/AnimeShuffle` / `main` |
| Runtime | Node |
| Node version | 24 |
| Root directory | Leave blank |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Instances | 1 |
| Persistent disk | Mount at `/var/data`, 1 GB |
| `NODE_ENV` | `production` |
| `ANIME_SHUFFLE_DATA_DIR` | `/var/data/anime-shuffle` |
| `MAL_CLIENT_ID` | Your issued client ID, in private environment settings |
| `MAL_CLIENT_SECRET` | Your issued secret, in private environment settings |
| `PUBLIC_ORIGIN` | Optional on Render; required on other hosts. Your actual HTTPS origin |

Let the host assign `PORT`. Public mode listens on `0.0.0.0`; local mode stays on `127.0.0.1`. A reverse proxy must terminate HTTPS and preserve the public Host header. Forwarded host headers never override the configured origin.

The account file requires persistent storage. Do not use an ephemeral filesystem for accounts. Do not run multiple instances against the JSON account file. Sessions and MAL tokens remain in memory, so deployments and restarts sign users out; saved account records survive on the disk. The sign-in limiter is conservative and shared by this small instance (20 attempts per 15 minutes).

## Verify the deployment

- `/healthz` returns `ok` without creating a session.
- The homepage has sign-in and account creation controls (not the Pages demo notice).
- With the Client ID configured, discovery fetches live MAL metadata. It loads pages on demand, not a copy of the entire MAL database.
- Sign in on MAL and return to the same hosted site. Settings should show the connected username.
- Create a test Anime Shuffle account, save preferences, sign out and sign back in. Repeat after a restart to check persistent storage.

An OAuth redirect error usually means the MAL redirect does not exactly match the app origin plus `/auth/callback`. A 403 can indicate a mismatched origin or proxy Host header. Never solve these by disabling CSRF or host checks.

## MAL registration

| Field | Value |
| --- | --- |
| App Name | Anime Shuffle |
| App Type | Web |
| Client ID / Client Secret | Issued by MAL; do not invent values or commit them |
| App Description | Anime Shuffle helps people discover anime and build a plan to watch list Users can react to anime save interesting titles and receive suggestions based on their preferences Users may connect MyAnimeList to use their existing list and optionally add anime to their plan to watch list |
| App Redirect URL | `http://localhost:5173/auth/callback` for local testing; add your actual hosted HTTPS origin plus `/auth/callback` on another line after deployment |
| Homepage URL | `https://dc1818.github.io/AnimeShuffle/` while it is the public demo; replace with the full hosted app URL after deployment |
| App Logo URL | `https://dc1818.github.io/AnimeShuffle/assets/logo.png` |
| Privacy Policy URL | `https://dc1818.github.io/AnimeShuffle/privacy.html` |
| Terms of Use URL | `https://dc1818.github.io/AnimeShuffle/terms.html` |
| Commercial / Non-Commercial | Non-Commercial if this remains a hobby project with no monetization; otherwise select the truthful classification and review MAL requirements |
| Name / Company Name | Your actual name or the legal name of your company |
| Purpose of Use | Display anime information and cover images for discovery Generate personalized suggestions from user preferences and authorized MyAnimeList lists Allow users to optionally add anime to their plan to watch list |

Verify that the public demo, logo and policy URLs open after GitHub Pages finishes deploying before submitting them. The public policy pages describe the current implementation; review them as the operator and update them when your data practices change. Registering the application does not itself establish that MAL has approved every intended use.
