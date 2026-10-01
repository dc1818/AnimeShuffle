# Deploy Anime Shuffle on Cloudflare

This runs the React website and API together on Workers. A SQLite-backed Durable Object stores accounts, preferences, reactions, settings, encrypted MAL connections, and encrypted sessions. It replaces Render's filesystem requirement. There is no separate disk or D1 database to create.

The app uses the same account on every device. Sign in on each device once; preferences and watchlists load from the shared database. Reactions sync after each change, and the app checks for updates on window focus, reconnect, or **Settings → Sync now**. This is not a live multiplayer feed. Concurrent edits to one anime use the last submitted action; edits to different anime are merged. Failed writes stay queued in that browser and show a Retry sync banner.

## Before moving

1. On the existing website, export **Saved here** as JSON from Watchlist. Also export your MAL Plan to Watch tab if you want a separate backup.
2. Keep Render running until the new deployment works. Changing hosts changes the browser origin, so browser-only data does not move automatically.
3. Existing Render username/password accounts are not automatically transferred. Use MAL login on the new site or create a new Anime Shuffle account, then import your JSON backup. The import does not write to MAL. Choose your onboarding preferences again.
4. If you need to preserve existing local usernames/passwords, stop before moving users: a separate account migration is required. The Cloudflare password format differs from the local Node version.

## First deployment (terminal)

Install a current Node LTS release, then download or clone this repository. Run these commands in its folder:

```sh
npm ci
npx wrangler login
```

Your browser opens Cloudflare's own authorization screen. Choose your account. Stay on the free Workers plan; the configuration uses free-plan-compatible SQLite-backed Durable Objects.

Create a token-encryption key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep that value privately in a password manager. Enter it when prompted by the first command below, then enter your existing MAL credentials for the next two:

```sh
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put MAL_CLIENT_ID
npx wrangler secret put MAL_CLIENT_SECRET
npm run deploy:cloudflare
```

If Wrangler asks to create the `anime-shuffle` Worker during secret setup, accept. Do not put these values in GitHub files, browser JavaScript, or this document. Do not change the encryption key casually: existing encrypted connections and sessions would become unreadable. Back it up securely.

Wrangler prints your actual URL, for example `https://anime-shuffle.YOUR-SUBDOMAIN.workers.dev`. Use the printed URL, not the example. The database tables are created automatically on the first API request.

## Finish the URL settings

In `wrangler.jsonc`, set `vars` to your actual URL (without a trailing slash):

```json
"vars": {
  "PUBLIC_ORIGIN": "https://anime-shuffle.YOUR-SUBDOMAIN.workers.dev"
}
```

Commit that public URL setting and deploy again. It contains no secret.

In MyAnimeList's app settings, keep App Type **Web** and add this new App Redirect URL:

```text
https://anime-shuffle.YOUR-SUBDOMAIN.workers.dev/auth/callback
```

Use your actual hostname. Each redirect goes on its own line. Keep the Render and localhost redirects until you have finished testing. Update MAL's Homepage URL to the new origin, Privacy Policy URL to `/privacy.html`, and Terms of Use URL to `/terms.html` on that origin.

## Deploy from GitHub after setup

In Cloudflare **Workers & Pages**, select this Worker and connect `dc1818/AnimeShuffle`, branch `main`, in its build settings. Use:

- Root directory: repository root
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy`

The checked-in `wrangler.jsonc` declares the assets and persistent SQLite object. Leave its binding/class names, migration tag, and object name `anime-shuffle-v1` unchanged. Renaming the object creates a different, empty database. Keep the three secrets configured on the Worker.

If using dashboard setup before the CLI, import this repository as a **Worker**, not a Pages-only static site. A purely static deployment cannot handle OAuth or account storage.

## Verify before retiring Render

- Open the new website and create an account or sign in with MAL.
- Set genres/favorites and press Start shuffling. It should save without a storage error.
- Save a show, then sign into the same account in another browser or phone and check the watchlist.
- Change preferences, deploy again, and check that data and the session remain.
- Export and re-import a JSON watchlist; existing choices should be skipped.
- Check that MAL login returns to the new hostname and that optional MAL additions still preserve existing list statuses.

Keep the Render backup until these checks pass. Do not delete its account data as part of switching DNS or URLs.

## Phones and future native apps

The website includes a web-app manifest. On iPhone/iPad use Safari's **Share → Add to Home Screen**. On Android use the browser's **Install app / Add to Home screen** option when offered. Menu wording and install support vary by browser. This remains an online app; it does not cache private API responses or promise offline discovery.

The mobile website and home-screen version use this same backend. Sign in with the same MAL account or Anime Shuffle username to restore your data. Browser and installed-app cookie stores may differ, so a first login on each is expected. Guest data does not sync.

For App Store / Play Store distribution later, React Native or Capacitor can use this backend's account model. Native login still needs a dedicated handoff: open MAL authorization in the system browser, return via a verified app/universal link, exchange a short-lived one-time code for an app session, and store that session in Keychain/Android Keystore. Do not copy browser cookies, embed MAL credentials, or put MAL secrets in an app bundle. These native endpoints and store packages are not part of this deployment.

## Free-plan limits and architecture

Workers and Durable Objects have request, CPU, database, and duration quotas. Cloudflare's free plan supports SQLite-backed Durable Objects. This initial deployment uses one object for a small community: it serializes API work, prevents refresh-token and MAL-write races, and gives password hashing the Durable Object CPU budget rather than a regular Worker's shorter limit. Database storage is limited to 1 GB per object on Free; the account-wide allowance is different. Under heavier traffic, split account coordination from public catalog requests before increasing usage.

Credentials use salted PBKDF2-SHA256 (600,000 iterations). Session identifiers are stored only as hashes; session payloads and MAL tokens use AES-256-GCM encryption. Cookies are HttpOnly, Secure on HTTPS, and SameSite=Lax. Mutations require a same-origin request and CSRF token. Public anime metadata has a bounded in-memory cache; personal MAL responses are never placed in that cache. API logs omit passwords, tokens, cookies, and OAuth query strings.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Workers static assets](https://developers.cloudflare.com/workers/static-assets/binding/).

## Local development

Create an ignored `.dev.vars` file with `TOKEN_ENCRYPTION_KEY` (a separate 64-character hexadecimal development key) and `PUBLIC_ORIGIN=http://localhost:8787`. The encryption key is required even without MAL.

```sh
npm ci
npm run dev:cloudflare
```

To test MAL locally, also add `MAL_CLIENT_ID` and `MAL_CLIENT_SECRET` to `.dev.vars`. Register `http://localhost:8787/auth/callback` on MAL. Local Wrangler data stays in `.wrangler/`; it is not your production database. `npm start` still runs the original local Node server on port 5173.
