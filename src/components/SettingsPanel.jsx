import { useState } from "react";
import { BackgroundOptions } from "./BackgroundOptions.jsx";
import { InstallApp } from "./InstallApp.jsx";
import { MalWatchlistOption } from "./MalWatchlistOption.jsx";
import { missingMalPlans } from "../lib/watchlist.js";
import { PreferencePanel } from "./PreferencePanel.jsx";
import { Icon } from "./Icon.jsx";
import { SupportLink } from "./SupportLink.jsx";
export const SETTINGS_SECTIONS = [
  { id: "appearance", label: "Appearance", icon: "screen" },
  { id: "preferences", label: "Viewing preferences", icon: "filters" },
  { id: "account", label: "Account & MyAnimeList", icon: "users" },
  { id: "help", label: "Help", icon: "info" },
];
function SettingsLink({ icon, title, detail, onClick, disabled }) {
  return (
    <button
      className="settings-link"
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <Icon name="chevron" />
    </button>
  );
}
export function SettingsPanel({
  state,
  store,
  onNavigate,
  onClose,
  initialSection = "appearance",
}) {
  const [section, setSection] = useState(initialSection);
  return (
    <PreferencePanel
      title="Settings"
      titleId="settings-title"
      sections={SETTINGS_SECTIONS}
      section={section}
      onSection={(next) =>
        next === "preferences" ? onNavigate("preferences") : setSection(next)
      }
      footer={
        <>
          <span role="status">Changes save automatically.</span>
          <SupportLink>Support</SupportLink>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {section === "appearance" && (
        <>
          <BackgroundOptions
            settings={state.settings}
            onChange={store.setSettings}
          />
        </>
      )}
      {section === "account" && (
        <>
          <h3>Account & MyAnimeList</h3>
          <section className="account-section">
            <h3>Account</h3>
            {state.session.account ? (
              <div className="account-identity">
                <Icon name="users" />
                <div>
                  <strong>{state.session.account.name}</strong>
                  <small>
                    {state.session.account.provider === "mal"
                      ? "MyAnimeList sign-in"
                      : "Anime Shuffle account"}
                  </small>
                </div>
                <button
                  className="outline"
                  disabled={state.busy}
                  onClick={async () => {
                    if (await store.disconnect()) location.reload();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : state.session.staticMode ? (
              <p>
                You’re using the demo. Preferences and reactions stay in this
                browser.
              </p>
            ) : (
              <SettingsLink
                icon="users"
                title="Sign in or create an account"
                detail="Sync saved anime, reactions and preferences across devices"
                onClick={() => onNavigate("welcome")}
              />
            )}
            {state.session.cloudSync && state.session.account && (
              <div className="setting-row">
                <div>
                  <strong>Account sync</strong>
                  <p>
                    Preferences and saved anime follow this account across
                    devices.
                  </p>
                </div>
                <button
                  className="outline"
                  disabled={state.busy}
                  onClick={() => store.syncAccount()}
                >
                  Sync now
                </button>
              </div>
            )}
          </section>
          <section className="account-section">
            <h3>MyAnimeList</h3>
            {state.session.connected ? (
              <div className="account-identity">
                <span className="mal-wordmark">MAL</span>
                <div>
                  <strong>Connected</strong>
                  <small>
                    {state.profile?.name ||
                      state.session.account?.name ||
                      "MyAnimeList account"}
                  </small>
                </div>
              </div>
            ) : state.session.oauthConfigured ? (
              <a className="settings-link" href="/auth/start">
                <Icon name="link" />
                <span>
                  <strong>Connect MyAnimeList</strong>
                  <small>Bring your list and viewing history</small>
                </span>
                <Icon name="chevron" />
              </a>
            ) : (
              <p>
                {state.session.staticMode
                  ? "MAL connections are available on the full website."
                  : "MyAnimeList connection is currently unavailable."}
              </p>
            )}
            {!state.session.connected && (
              <p>Connect MyAnimeList first to enable auto-add.</p>
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
                  recommendations even without ratings. Plan to Watch appears in
                  your site watchlist.
                </p>
                <button
                  className="outline full-width"
                  disabled={
                    state.busy ||
                    !missingMalPlans(state.reactions, state.list).length
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
            {!state.session.oauthConfigured &&
              !state.session.staticMode &&
              !state.session.hosted && (
                <div className="setup-help">
                  <h3>Connect your local app</h3>
                  <ol>
                    <li>
                      Copy <code>.env.example</code> to <code>.env</code> in the
                      app folder.
                    </li>
                    <li>Enter your MAL Client ID and Client Secret there.</li>
                    <li>
                      Register this exact redirect:{" "}
                      <code>{location.origin}/auth/callback</code>
                    </li>
                    <li>Restart the app, then connect MAL.</li>
                  </ol>
                  <p>
                    Credentials stay on this computer. Never commit them to a
                    public repository.
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
          </section>
          {state.syncError && (
            <p className="form-error" role="alert">
              {state.syncError}
            </p>
          )}
        </>
      )}
      {section === "help" && (
        <>
          <h3>Keyboard shortcuts</h3>
          <dl className="shortcut-list">
            {[
              ["1", "Good"],
              ["2", "Bad"],
              ["3", "Would watch"],
              ["4", "Won’t watch"],
              ["Space", "Skip"],
              ["U", "Undo"],
              ["I", "More details"],
            ].map(([key, text]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p>
            Shortcuts work on Discover while you’re not typing or using a
            dialog.
          </p>
          <h3>Phone swipes</h3>
          <p>
            Swipe the artwork: up for Would watch, down for Won’t watch, left
            for Good, right for Bad. The original buttons and Undo remain
            available.
          </p>
          <SettingsLink
            icon="info"
            title="Your data and privacy"
            detail="Storage, account sync and profile controls"
            onClick={() => onNavigate("privacy")}
          />
          {!state.session.staticMode && <InstallApp compact />}
        </>
      )}
    </PreferencePanel>
  );
}
