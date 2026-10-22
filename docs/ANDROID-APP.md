# Anime Shuffle on Android

The production site is an installable Progressive Web App (PWA). In Chrome on
Android, open https://animeshuffle.com, then Settings → Get the Android app →
Install Anime Shuffle. If Chrome hasn't offered installation yet, use its menu →
Add to home screen → Install. Browser wording and installation support vary.
Open the new home-screen icon for the standalone app. This is browser installation,
not a separately distributed APK or a Play Store listing.

## Accounts and sync

- Use the **same Anime Shuffle account** on desktop and phone, or sign in with
  the **same MyAnimeList identity**. Each device has its own secure session.
- To use both login methods for one profile, sign into your existing Anime Shuffle
  account first and choose **Connect MyAnimeList** in Settings. The server links
  that MAL ID to the existing account. An identity already linked to a different
  account is rejected; the app never silently merges two existing accounts.
- Account reactions, saved anime, reaction reasons, account settings and viewing
  preferences use the existing production backend. The app does not create a
  separate database. A different browser/device may need a fresh sign-in.
- Changes sync on write and load. The existing background refresh is throttled to
  five minutes; **Settings → Sync now** retrieves changes immediately. Switching
  devices is not an instantaneous live collaboration feed.
- Guest saves remain on that device until the existing sign-in/migration flow
  imports them. Skipped-title cooldowns and the current recommendation shortlist
  remain device/session specific. MAL Plan to Watch writes still respect the
  user's existing MAL sync option.
- Sign out on one device does not sign out other device sessions.

## Network and updates

The app needs a connection for discovery, login, trailers and cloud sync. Its
service worker caches only `/offline.html`, a self-contained connection/retry
screen. It never caches `/api/*`, `/auth/*`, account responses, the admin page,
application bundles or personalized HTML. Normal website updates therefore reach
the app on the next navigation/reopen, with no APK release required. Pending
changes retained by the existing account outbox retry on reconnect/refresh.

No additional polling, database reads, AI requests or third-party mobile backend
are introduced by installation. Static GitHub Pages demos do not register the
production service worker or advertise account-enabled installation.

## Verification

`node --test test/install-app.test.mjs test/app-worker.test.mjs test/cloud-sync.test.mjs test/cloudflare.test.mjs`
checks prompt lifecycle, manifest/icon integrity, offline handling, uncached auth,
and two-device local/MAL account behavior. Build with `npm run build`; `dist/` is
deployed by the existing Cloudflare pipeline.

Physical Android acceptance check: install from Chrome, sign into the same
account as desktop, save/react on either device, then use Sync now on the other.
Repeat using a linked MAL login. Confirm the standalone window, icon, browser
OAuth return, and connection screen in airplane mode. Automated tests do not
replace this device test.
