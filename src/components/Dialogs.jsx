import { useEffect, useRef } from "react";
import { Icon } from "./Icon.jsx";

/** Native dialog supplies focus trapping and Escape; React supplies its content. */
function Dialog({ children, onClose, welcome = false }) {
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
        onClose();
      }}
    >
      <button
        className="icon-button close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
export function Dialogs({ kind, state, store, onClose }) {
  if (!kind) return null;
  if (kind === "welcome")
    return (
      <Dialog onClose={onClose} welcome>
        <img
          className="welcome-logo"
          src="/assets/logo.png"
          alt="Anime Shuffle cards"
        />
        <span className="eyebrow">A little shuffle. A new favorite.</span>
        <h2>Find your next anime.</h2>
        <p>
          Bring your MyAnimeList taste with you, or start with a few familiar
          titles. No ratings needed.
        </p>
        <a className="primary" href="/auth/start">
          <Icon name="link" />
          Connect MyAnimeList
        </a>
        <button className="outline" onClick={onClose}>
          Try without logging in
        </button>
        <small>Your password stays on MyAnimeList.</small>
      </Dialog>
    );
  if (kind === "privacy")
    return (
      <Dialog onClose={onClose}>
        <h2>Your data stays local</h2>
        <p>
          Your own reactions and saved anime are stored in this browser,
          separately for each MAL account. Imported MAL profiles and lists are
          held in memory. Clearing browser data removes local reactions.
        </p>
        <p>
          OAuth tokens stay in the local server’s memory and disappear when it
          stops. The app contacts MyAnimeList for anime data and cover images.
          It has no analytics.
        </p>
        <p>
          Auto-add is optional. Good and Bad never change MAL statuses or
          numerical ratings. You can revoke authorization on MyAnimeList after
          disconnecting here.
        </p>
        <p>This local prototype is not affiliated with MyAnimeList.</p>
        <button
          className="danger-outline"
          disabled={state.busy}
          onClick={() => {
            if (
              confirm(
                "Clear this profile’s local reactions and saved anime? Your MAL list will not change.",
              )
            ) {
              store.clearLocal();
              onClose();
            }
          }}
        >
          Clear this profile’s local reactions
        </button>
      </Dialog>
    );
  return (
    <Dialog onClose={onClose}>
      <span className="eyebrow">Make it yours</span>
      <h2>Settings</h2>
      <p>
        {state.profile
          ? `Connected as ${state.profile.name}`
          : state.session.oauthConfigured
            ? "MyAnimeList is ready to connect."
            : "Live discovery needs your local MAL API credentials."}
      </p>
      {!state.session.connected && state.session.oauthConfigured && (
        <a className="primary" href="/auth/start">
          Connect MyAnimeList
        </a>
      )}
      <div className="setting-row">
        <div>
          <strong>Auto-add to MAL Plan to Watch</strong>
          <p>“Would watch” also adds new entries to your MAL list.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Auto-add to MAL Plan to Watch"
          disabled={!state.session.connected || state.busy}
          checked={state.settings.autoAdd}
          onChange={(event) =>
            store.setSettings({ autoAdd: event.target.checked })
          }
        />
      </div>
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
      {!state.session.oauthConfigured && (
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
      {state.session.connected && (
        <button
          className="outline"
          disabled={state.busy}
          onClick={async () => {
            if (await store.disconnect()) location.reload();
          }}
        >
          Disconnect MyAnimeList
        </button>
      )}
    </Dialog>
  );
}
