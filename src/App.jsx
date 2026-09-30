import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./components/Icon.jsx";
import { AnimeCard, AnimeDetails } from "./components/AnimeCard.jsx";
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
    else if (query.has("auth_error"))
      store.notify("MAL connection did not finish. Please try again.");
    else if (
      !state.session.connected &&
      !sessionStorage.getItem("anime-shuffle-welcome")
    )
      setDialog("welcome");
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
    if (dialog === "welcome")
      sessionStorage.setItem("anime-shuffle-welcome", "1");
    setDialog(null);
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
        <a className="brand" href="/" aria-label="Anime Shuffle home">
          <img src="/assets/logo.png" alt="" width="92" height="62" />
          <span>
            Anime <b>Shuffle</b>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {["discover", "watchlist"].map((name) => (
            <button
              key={name}
              className={`nav-button ${view === name ? "active" : ""}`}
              aria-current={view === name ? "page" : undefined}
              onClick={() => setView(name)}
            >
              <Icon name={name === "discover" ? "compass" : "bookmark"} />
              <span>{name === "discover" ? "Discover" : "Watchlist"}</span>
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
              state.session.connected
                ? setDialog("settings")
                : location.assign("/auth/start")
            }
          >
            <Icon name="link" />
            <span>{state.profile?.name || "Connect MAL"}</span>
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
            Preview mode: try seven sample anime. Set up MAL to unlock live
            discovery.
          </span>
          <button onClick={() => setDialog("settings")}>Set up MAL</button>
        </div>
      )}
      <main>
        {view === "watchlist" ? (
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
                      : "You’re all caught up"}
                </h2>
                <p>
                  {state.error ||
                    (state.preview
                      ? "Explore seven sample anime, then set up MAL for live discovery."
                      : "No fresh matches in the loaded catalog. Revisit skipped anime or check your watchlist.")}
                </p>
                <button
                  className="primary"
                  disabled={state.busy}
                  onClick={() =>
                    state.preview ? setDialog("settings") : store.retry()
                  }
                >
                  {state.preview ? "Set up live discovery" : "Find more anime"}
                </button>
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={store.revisit}
                >
                  Revisit skipped anime
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
      />
    </>
  );
}
