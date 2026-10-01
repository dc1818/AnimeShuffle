import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./components/Icon.jsx";
import { AnimeCard, AnimeDetails } from "./components/AnimeCard.jsx";
import { Recommendations } from "./components/Recommendations.jsx";
import { Watchlist } from "./components/Watchlist.jsx";
import { Dialogs } from "./components/Dialogs.jsx";

/** Page-level UI state stays in React; domain commands live in the injected store. */
export function App({ store }) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [view, setView] = useState("discover");
  const [details, setDetails] = useState(false);
  const [dialog, setDialog] = useState(null);
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
      store.notify("MAL connection did not finish. Please try again.");
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
  const savedCount = Object.values(state.reactions).filter(
    (r) => r.action === "watch",
  ).length;
  return (
    <>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
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
            {state.current ? (
              <div className={`cards-layout ${details ? "expanded" : ""}`}>
                <AnimeCard
                  key={state.current.id}
                  anime={state.current}
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
                    reason={state.reason}
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
        store={store}
        onClose={closeDialog}
        onNavigate={setDialog}
      />
    </>
  );
}
