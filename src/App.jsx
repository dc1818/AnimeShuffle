import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./components/Icon.jsx";
import { AnimeCard, AnimeDetails } from "./components/AnimeCard.jsx";
import { LoadingIndicator } from "./components/LoadingIndicator.jsx";
import { Recommendations } from "./components/Recommendations.jsx";
import { Watchlist } from "./components/Watchlist.jsx";
import { combinedWatchlist } from "./lib/watchlist.js";
import { Dialogs } from "./components/Dialogs.jsx";
import { BACKGROUND_REFRESH_MS } from "./lib/refresh-policy.js";

/** Page-level UI state stays in React; domain commands live in the injected store. */
export function App({ store }) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [view, setView] = useState("discover");
  const activeView = useRef(view);
  activeView.current = view;
  const [freshnessTick, setFreshnessTick] = useState(0);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    setDetails(false);
  }, [state.current?.id, state.discoveryLoading, view]);
  const [dialog, setDialog] = useState(null);
  const [authError, setAuthError] = useState("");
  const onboardingShown = useRef(false);
  useEffect(() => {
    store.initialize();
  }, [store]);
  useEffect(() => {
    if (!state.ready || onboardingShown.current) return;
    onboardingShown.current = true;
    const query = new URLSearchParams(location.search);
    if (query.has("setup")) setDialog("settings");
    else if (query.has("auth_error")) {
      // Keep callback failures visible inside the modal; a background toast is obscured.
      const code = query.get("auth_error");
      const messages = {
        token_client:
          "MyAnimeList rejected this app's Client ID or Client Secret. Re-enter both secrets from the same MAL Web application in this Worker's settings, then deploy. (MAL_TOKEN_CLIENT)",
        token_grant:
          "MyAnimeList rejected the authorization code, callback URL, or verification code. Check the exact MAL redirect URL and begin a fresh login from Anime Shuffle. (MAL_TOKEN_GRANT)",
        token_forbidden:
          "MyAnimeList denied the server's token request with HTTP 403. This alone does not establish a credentials problem. Check the Worker logs and MAL API access. (MAL_TOKEN_FORBIDDEN)",
        token_network:
          "The server could not connect to MyAnimeList's token endpoint. Retry later and check the Worker logs if this continues. (MAL_TOKEN_NETWORK)",
        token_rate_limit:
          "MyAnimeList is limiting authorization requests. Wait before starting a fresh login. (MAL_TOKEN_RATE_LIMIT)",
        token_unavailable:
          "MyAnimeList's token service returned a server error. Please try again later. (MAL_TOKEN_UNAVAILABLE)",
        token_request:
          "MyAnimeList rejected the format of the token request. Report this error to the site owner. (MAL_TOKEN_REQUEST)",
        token_response:
          "MyAnimeList returned an incomplete or unreadable token response. Report this error to the site owner. (MAL_TOKEN_RESPONSE)",
        token_rejected:
          "MyAnimeList rejected the token request without a recognized OAuth error. The Worker logs contain the HTTP status. (MAL_TOKEN_REJECTED)",
        state:
          "Your sign-in session expired or its cookie was unavailable. Start again from this website in the same browser tab. (MAL_SESSION)",
        denied:
          "MyAnimeList authorization was cancelled or not granted. Try again and allow access. (MAL_DENIED)",
        token:
          "MyAnimeList could not finish authorization. Check this Worker's MAL credentials and the exact registered callback URL. (MAL_TOKEN)",
        profile:
          "Authorization reached MyAnimeList, but Anime Shuffle could not load your MAL profile. Please retry. (MAL_PROFILE)",
        account:
          "Your MAL profile was received, but Anime Shuffle could not save or link the account. Check the Worker logs. (MAL_ACCOUNT)",
      };
      setAuthError(
        messages[code] ||
          "MyAnimeList sign-in did not finish. Please retry and check the Worker logs if it happens again. (MAL_CALLBACK)",
      );
      setDialog(state.session.account ? "settings" : "welcome");
    } else if (!state.onboardingComplete)
      setDialog(state.session.account ? "preferences" : "welcome");
    window.history.replaceState({}, "", location.pathname);
  }, [state.ready, state.session.connected, store]);
  useEffect(() => {
    if (!state.message) return;
    const timer = setTimeout(store.dismissMessage, 6000);
    return () => clearTimeout(timer);
  }, [state.message, store]);
  useEffect(() => {
    function keydown(event) {
      if (
        dialog ||
        /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.key === "Escape") {
        setDetails(false);
        return;
      }
      if (view !== "discover") return;
      const action = { 1: "good", 2: "bad", 3: "watch", 4: "nope" }[event.key];
      if (action) {
        event.preventDefault();
        store.react(action);
      } else if (event.code === "Space") {
        event.preventDefault();
        store.skip();
      } else if (event.key.toLowerCase() === "u") store.undo();
      else if (event.key.toLowerCase() === "i") setDetails((value) => !value);
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [dialog, view, store]);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
        store.syncAccount?.({ background: true });
        setFreshnessTick((tick) => tick + 1);
      }
    };
    const timer = window.setInterval(sync, BACKGROUND_REFRESH_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [store]);
  useEffect(() => {
    // A tab change during another operation is retried as soon as it completes.
    if (
      state.ready &&
      !state.busy &&
      document.visibilityState !== "hidden" &&
      navigator.onLine !== false
    )
      store.refreshMalIfStale?.({
        refreshDiscovery: () => activeView.current === "discover",
      });
  }, [
    store,
    view,
    freshnessTick,
    state.ready,
    state.busy,
    state.list,
    state.reactions,
  ]);
  function closeDialog() {
    // Closing the welcome screen continues as a guest; it does not skip preferences.
    if (!store.getSnapshot().onboardingComplete) {
      setDialog(
        dialog === "welcome"
          ? "preferences"
          : store.getSnapshot().session.account
            ? "preferences"
            : "welcome",
      );
    } else setDialog(null);
  }
  const savedCount = combinedWatchlist(state.reactions, state.list).length;
  return (
    <>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {state.malSyncProgress && (
        <div className="notice" role="status">
          Adding saved shows to MAL · {state.malSyncProgress.done} of{" "}
          {state.malSyncProgress.total}
        </div>
      )}
      {state.malSyncError && (
        <div className="sync-warning" role="alert">
          {state.malSyncError}
          <button disabled={state.busy} onClick={store.syncSavedToMal}>
            Retry MAL sync
          </button>
        </div>
      )}
      {state.syncError && (
        <div className="sync-warning" role="status">
          {state.syncError}{" "}
          <button
            className="quiet"
            disabled={state.busy}
            onClick={store.syncAccount}
          >
            Retry sync
          </button>
        </div>
      )}
      <header className="topbar">
        <a className="brand" href="./" aria-label="Anime Shuffle home">
          <img src="./assets/logo.png" alt="" width="92" height="62" />
          <span>
            Anime <b>Shuffle</b>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {["discover", "watchlist", "recommendations"].map((name) => (
            <button
              key={name}
              className={`nav-button ${view === name ? "active" : ""}`}
              aria-current={view === name ? "page" : undefined}
              onClick={() => setView(name)}
            >
              <Icon
                name={
                  name === "discover"
                    ? "compass"
                    : name === "watchlist"
                      ? "bookmark"
                      : "shuffle"
                }
              />
              <span>
                {name === "discover"
                  ? "Discover"
                  : name === "watchlist"
                    ? "Watchlist"
                    : "Recommendations"}
              </span>
              {name === "watchlist" && savedCount > 0 && (
                <span className="count">{savedCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="account-actions">
          <button
            className="account"
            onClick={() =>
              state.session.account
                ? setDialog("settings")
                : setDialog("welcome")
            }
          >
            <Icon name="link" />
            <span>
              {state.session.account?.name ||
                (state.session.staticMode ? "About demo" : "Sign in")}
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setDialog("settings")}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {state.ready && state.preview && (
        <div className="notice">
          <span>
            {state.session.staticMode
              ? "GitHub Pages demo · Seven sample anime · Saved in this browser"
              : "Preview mode: try seven sample anime. Set up MAL to unlock live discovery."}
          </span>
          <button onClick={() => setDialog("settings")}>
            {state.session.staticMode ? "About this demo" : "Set up MAL"}
          </button>
        </div>
      )}
      <main className={view === "recommendations" ? "wide-main" : undefined}>
        {view === "recommendations" ? (
          <Recommendations
            state={state}
            store={store}
            onDiscover={() => setView("discover")}
          />
        ) : view === "watchlist" ? (
          <Watchlist
            state={state}
            store={store}
            onDiscover={() => setView("discover")}
          />
        ) : (
          <section aria-label="Anime discovery">
            <div className="feed-top">
              <span className="reason">
                <Icon name="shuffle" />
                {state.busy
                  ? "Finding your next anime…"
                  : state.reason || "Find your next anime"}
              </span>
              <span className="progress">
                {Object.keys(state.reactions).length} reactions
              </span>
            </div>
            {!state.ready || state.discoveryLoading ? (
              <LoadingIndicator
                progress={state.discoveryProgress}
                label="Loading your discovery queue…"
                detail={
                  state.discoveryProgress === null
                    ? "Finding anime for you to explore"
                    : "Verifying anime details · loading steps completed"
                }
              />
            ) : state.current ? (
              <div className={`cards-layout ${details ? "expanded" : ""}`}>
                <AnimeCard
                  key={state.current.id}
                  anime={state.current}
                  selectedGenres={state.preferences.favoriteGenres}
                  busy={state.busy}
                  canUndo={state.canUndo}
                  detailsOpen={details}
                  onDetails={() => setDetails((value) => !value)}
                  onReact={store.react}
                  onSkip={store.skip}
                  onUndo={store.undo}
                  dynamic={state.settings.dynamic}
                />
                {details && (
                  <AnimeDetails
                    anime={state.current}
                    reason={state.detailReason || state.reason}
                    onClose={() => setDetails(false)}
                  />
                )}
              </div>
            ) : (
              <div className="empty">
                <Icon name="shuffle" />
                <h2>
                  {state.busy
                    ? "Finding your next anime…"
                    : state.error
                      ? "Let’s try that again"
                      : "No more matches right now"}
                </h2>
                <p>
                  {state.error ||
                    (state.preview
                      ? "No sample titles match your choices, or you’ve seen them all. Change preferences, undo a reaction, or clear reactions in Privacy to start again."
                      : "No fresh matches in the loaded pages. Try more anime, adjust your preferences, or revisit skipped titles.")}
                </p>
                <button
                  className="primary"
                  disabled={state.busy}
                  onClick={() =>
                    state.preview ? setDialog("settings") : store.retry()
                  }
                >
                  {state.preview ? "Discovery settings" : "Find more anime"}
                </button>
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={store.revisit}
                >
                  Revisit skipped anime
                </button>
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={() => setDialog("preferences")}
                >
                  Change viewing preferences
                </button>
                {state.canUndo && (
                  <button
                    className="quiet"
                    disabled={state.busy}
                    onClick={store.undo}
                  >
                    Undo last reaction
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      <footer>
        <span>
          Anime information from{" "}
          <a
            href="https://myanimelist.net"
            target="_blank"
            rel="noopener noreferrer"
          >
            MyAnimeList
          </a>
        </span>
        <button onClick={() => setDialog("privacy")}>
          Privacy &amp; local data
        </button>
        <a href="./privacy.html">Privacy policy</a>
        <a href="./terms.html">Terms</a>
        <span id="mode-label">
          {state.preview
            ? "Preview · 7 sample anime"
            : state.session.connected
              ? "Connected to MyAnimeList"
              : "Live discovery · Guest"}
        </span>
      </footer>
      {state.message && (
        <div id="toast" role="status" aria-live="polite">
          {state.message}
        </div>
      )}
      <Dialogs
        key={dialog || "none"}
        kind={dialog}
        state={state}
        authError={authError}
        store={store}
        onClose={closeDialog}
        onNavigate={setDialog}
      />
    </>
  );
}
