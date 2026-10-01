import { MalWatchlistOption } from "./MalWatchlistOption.jsx";
import { missingMalPlans } from "../lib/watchlist.js";
import { useEffect, useRef } from "react";
import { AccountForm, ViewingPreferences } from "./Onboarding.jsx";
import { Icon } from "./Icon.jsx";

/** Native dialog supplies focus trapping and Escape; React supplies its content. */
function Dialog({
  children,
  onClose,
  welcome = false,
  dismissable = true,
  busy = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${welcome ? "welcome" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissable && !busy) onClose();
      }}
    >
      {dismissable && (
        <button
          disabled={busy}
          className="icon-button close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      )}
      {children}
    </dialog>
  );
}
export function Dialogs({
  kind,
  state,
  store,
  onClose,
  onNavigate,
  authError = "",
}) {
  if (!kind) return null;
  if (
    state.session.staticMode &&
    ["welcome", "login", "register"].includes(kind)
  )
    return (
      <Dialog onClose={onClose} welcome>
        <img
          className="welcome-logo"
          src="./assets/logo.png"
          alt="Anime Shuffle cards"
        />
        <span className="eyebrow">A little shuffle. A new favorite.</span>
        <h2>Find your next anime.</h2>
        <p>
          Try seven sample anime, react to each pick, and build a watchlist
          saved in this browser.
        </p>
        <p>
          This GitHub Pages demo does not support accounts or MyAnimeList
          sign-in. The server version includes both.
        </p>
        <button className="primary" onClick={onClose}>
          Start shuffling
        </button>
        <a
          className="quiet"
          href="https://github.com/dc1818/AnimeShuffle#Getting-started"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get the full local app
        </a>
      </Dialog>
    );
  if (["login", "register"].includes(kind))
    return (
      <Dialog busy={state.busy} onClose={() => onNavigate("welcome")}>
        <AccountForm
          mode={kind}
          store={store}
          onNavigate={onNavigate}
          onComplete={onClose}
        />
      </Dialog>
    );
  if (kind === "preferences")
    return (
      <Dialog
        busy={state.busy}
        dismissable={state.onboardingComplete}
        onClose={onClose}
      >
        <ViewingPreferences state={state} store={store} onComplete={onClose} />
      </Dialog>
    );
  if (kind === "welcome")
    return (
      <Dialog onClose={onClose} welcome>
        <img
          className="welcome-logo"
          src="./assets/logo.png"
          alt="Anime Shuffle cards"
        />
        <span className="eyebrow">A little shuffle. A new favorite.</span>
        <h2>Find your next anime.</h2>
        <p>
          Create an Anime Shuffle account, or use your MyAnimeList account to
          sign in and bring your list with you.
        </p>
        {(authError || state.error) && (
          <p className="error" role="alert">
            {authError || state.error}
          </p>
        )}
        <button className="primary" onClick={() => onNavigate("register")}>
          Create an Anime Shuffle account
        </button>
        <a className="outline" href="/auth/start">
          <Icon name="link" />
          Sign in with MyAnimeList
        </a>
        <a
          className="outline"
          href="https://myanimelist.net/register.php"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create a MyAnimeList account <Icon name="external" />
        </a>
        <small>
          Register on MAL, then return here and choose “Sign in with
          MyAnimeList.”
        </small>
        <button className="quiet" onClick={() => onNavigate("login")}>
          Already have an Anime Shuffle account? Sign in
        </button>
        <button className="quiet" onClick={onClose}>
          Try without logging in
        </button>
      </Dialog>
    );
  if (kind === "privacy")
    return (
      <Dialog onClose={onClose}>
        <h2>Your data and privacy</h2>
        <p>
          Your own reactions and saved anime are stored in this browser,
          separately for guests and each signed-in account. Imported MAL
          profiles and lists are held in memory. Clearing browser data removes
          local guest reactions; synced account data stays on the server.
        </p>
        <p>
          Cloudflare stores encrypted MAL tokens and persistent sessions. The
          local Node server keeps tokens in memory until it stops. The app
          contacts MyAnimeList for anime data and cover images. It has no
          analytics.
        </p>
        <p>
          Auto-add is optional. Good and Bad never change MAL statuses or
          numerical ratings. You can revoke authorization on MyAnimeList after
          disconnecting here.
        </p>
        <p>
          Anime Shuffle usernames, salted password hashes and account viewing
          preferences are saved on this installation. Guest preferences stay in
          this browser. On the Cloudflare deployment, signed-in reactions,
          watchlists and settings sync to your account.
        </p>
        <p>Anime Shuffle is not affiliated with MyAnimeList.</p>
        <p>
          <a href="./privacy.html" target="_blank" rel="noopener noreferrer">
            Read the privacy policy
          </a>{" "}
          ·{" "}
          <a href="./terms.html" target="_blank" rel="noopener noreferrer">
            Terms of use
          </a>
        </p>
        <button
          className="danger-outline"
          disabled={state.busy}
          onClick={() => {
            if (
              confirm(
                state.session.cloudSync && state.session.account
                  ? "Clear this account’s reactions and saved anime on all synced devices? Your MAL list will not change."
                  : "Clear this profile’s local reactions and saved anime? Your MAL list will not change.",
              )
            ) {
              store.clearLocal();
              onClose();
            }
          }}
        >
          {state.session.cloudSync && state.session.account
            ? "Clear account reactions"
            : "Clear this profile’s local reactions"}
        </button>
      </Dialog>
    );
  return (
    <Dialog onClose={onClose}>
      <span className="eyebrow">Make it yours</span>
      <h2>Settings</h2>
      {state.session.cloudSync && state.session.account && (
        <div className="setting-row">
          <div>
            <strong>Account sync</strong>
            <p>
              Preferences and saved anime follow this account across devices.
              Sign-in lasts up to 30 days.
            </p>
          </div>
          <button
            className="outline"
            disabled={state.busy}
            onClick={store.syncAccount}
          >
            Sync now
          </button>
        </div>
      )}
      {state.session.account && (
        <p>
          Signed in as <strong>{state.session.account.name}</strong> ·{" "}
          {state.session.account.provider === "mal"
            ? "MyAnimeList"
            : "Anime Shuffle"}
        </p>
      )}
      <button
        className="outline full-width"
        disabled={state.busy}
        onClick={() => onNavigate("preferences")}
      >
        Viewing preferences
      </button>
      {!state.session.account && !state.session.staticMode && (
        <button className="quiet" onClick={() => onNavigate("welcome")}>
          Sign in or create an account
        </button>
      )}
      <p>
        {state.profile
          ? `Connected as ${state.profile.name}`
          : state.session.staticMode
            ? "You’re using the GitHub Pages demo. Preferences and reactions stay in this browser. Accounts and MAL sync require the server version."
            : state.session.oauthConfigured
              ? "MyAnimeList is ready to connect."
              : "Live discovery needs the app operator to configure MAL credentials."}
      </p>
      {!state.session.connected && state.session.oauthConfigured && (
        <a className="primary" href="/auth/start">
          Connect MyAnimeList
        </a>
      )}
      <MalWatchlistOption
        enabled={state.settings.autoAdd}
        disabled={!state.session.connected || state.busy}
        onChange={store.setAutoAdd}
      />
      {state.session.connected && (
        <>
          <p>
            Your MAL watching, completed, and dropped entries inform
            recommendations even without ratings. Plan to Watch appears in your
            site watchlist.
          </p>
          <button
            className="outline full-width"
            disabled={
              state.busy || !missingMalPlans(state.reactions, state.list).length
            }
            onClick={store.syncSavedToMal}
          >
            Add missing site saves to MAL (
            {missingMalPlans(state.reactions, state.list).length})
          </button>
          {state.malSyncProgress && (
            <p role="status">
              Adding to MAL · {state.malSyncProgress.done} of{" "}
              {state.malSyncProgress.total}
            </p>
          )}
          {state.malSyncError && (
            <p className="form-error" role="alert">
              {state.malSyncError}
            </p>
          )}
        </>
      )}
      <div className="setting-row">
        <div>
          <strong>Cover-inspired background</strong>
          <p>Let each anime set the mood.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Cover-inspired background"
          checked={state.settings.dynamic}
          onChange={(event) =>
            store.setSettings({ dynamic: event.target.checked })
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>Keyboard shortcuts</strong>
          <p>1–4 react · Space skips · U undoes · I opens details.</p>
        </div>
      </div>
      {!state.session.oauthConfigured &&
        !state.session.staticMode &&
        !state.session.hosted && (
          <div className="setup-help">
            <h3>Connect your local app</h3>
            <ol>
              <li>
                Copy <code>.env.example</code> to <code>.env</code> in the app
                folder.
              </li>
              <li>Enter your MAL Client ID and Client Secret there.</li>
              <li>
                Register this exact redirect:{" "}
                <code>{location.origin}/auth/callback</code>
              </li>
              <li>Restart the app, then connect MAL.</li>
            </ol>
            <p>
              Credentials stay on this computer. Never commit them to a public
              repository.
            </p>
            <a
              href="https://myanimelist.net/apiconfig"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open MAL API settings <Icon name="external" />
            </a>
          </div>
        )}
      {state.session.connected &&
        state.session.account?.provider === "local" && (
          <button
            className="outline"
            disabled={state.busy}
            onClick={async () => {
              if (await store.disconnect(true)) location.reload();
            }}
          >
            Disconnect MyAnimeList
          </button>
        )}
      {state.session.account && (
        <button
          className="outline full-width"
          disabled={state.busy}
          onClick={async () => {
            if (await store.disconnect()) location.reload();
          }}
        >
          Sign out
        </button>
      )}
    </Dialog>
  );
}
