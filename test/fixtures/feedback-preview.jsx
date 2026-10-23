import { Dialogs } from "../../src/components/Dialogs.jsx";
import { Recommendations } from "../../src/components/Recommendations.jsx";
import { Watchlist } from "../../src/components/Watchlist.jsx";
import { normalizePreferences } from "../../src/lib/preferences.js";
import { BackgroundOptions } from "../../src/components/BackgroundOptions.jsx";
import {
  AmbientBackground,
  BACKGROUND_STYLES,
} from "../../src/components/AmbientBackground.jsx";
// Isolated responsive fixture: sample titles, in-memory feedback, no account,
// analytics, recommendations requests, or changes to the visitor's profile.
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimeCard, AnimeDetails } from "../../src/components/AnimeCard.jsx";
import { demo } from "../../src/lib/demo.js";
const sizes = [
  [320, 640],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 900],
  [1920, 1080],
  [844, 390],
];
function Fixture() {
  const [setupDone, setSetupDone] = useState(false);
  const [action, setAction] = useState("good"),
    [long, setLong] = useState(false),
    [feedback, setFeedback] = useState(null),
    [details, setDetails] = useState(
      !location.search.includes("surface=discover") &&
        !location.search.includes("surface=recommendations") &&
        !location.search.includes("background-options"),
    ),
    [compact, setCompact] = useState(
      location.search.includes("surface=recommendations"),
    ),
    [displayed, setDisplayed] = useState(
      location.search.includes("category-labels") ? 6 : 1,
    ),
    [dynamic, setDynamic] = useState(true),
    [backgroundStyle, setBackgroundStyle] = useState("aurora");
  const anime = {
    ...demo[0],
    title: long
      ? "A Very Long Anime Title: The Unexpected Adventure of a Wandering Space Crew and Their Remarkably Complicated Relationships"
      : demo[0].title,
    englishTitle: "",
  };
  if (/surface=(settings|preferences)/.test(location.search))
    return <PreferencesFixture />;
  if (location.search.includes("surface=shortlist"))
    return <ShortlistFixture />;
  if (location.search.includes("surface=onboarding")) {
    return setupDone ? (
      <p>Ready to discover. Preview only — no profile changes.</p>
    ) : (
      <Dialogs
        kind="preferences"
        state={{
          session: {},
          preview: true,
          onboardingComplete: false,
          preferences: normalizePreferences(),
          settings: {},
          busy: false,
        }}
        store={{ searchAnime: async () => [], savePreferences: async () => {} }}
        onClose={() => setSetupDone(true)}
      />
    );
  }
  if (location.search.includes("surface=watchlist")) {
    const list = Array.from({ length: 218 }, (_, i) => ({
      ...demo[i % demo.length],
      id: i + 10000,
      title:
        i < demo.length
          ? demo[i].title
          : `Layout sample ${i + 1}: ${demo[i % demo.length].title}`,
      englishTitle: "",
      listStatus: { status: "plan_to_watch" },
    }));
    return (
      <main className="page-shell">
        <Watchlist
          state={{
            list,
            reactions: {},
            preferences: normalizePreferences(),
            session: {},
            settings: {},
            busy: false,
          }}
          store={{
            getAnimeDetails: async (anime) => anime,
            removeSaved: async () => ({ removed: false }),
          }}
          onDiscover={() => {}}
        />
      </main>
    );
  }
  return (
    <>
      <AmbientBackground enabled={dynamic} style={backgroundStyle} />
      <header className="topbar">
        <a className="brand">Anime Shuffle</a>
        <nav>
          <button className="nav-button active">Discover</button>
          <button className="nav-button">Watchlist</button>
          <button className="nav-button">Recommendations</button>
        </nav>
      </header>
      <details className="fixture-controls">
        <summary>Layout preview controls · No profile changes</summary>
        <div style={{ padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label>
            Sample reaction{" "}
            <select
              aria-label="Sample reaction"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setFeedback(null);
              }}
            >
              <option value="none">No reactions yet</option>
              <option value="good">Good</option>
              <option value="bad">Bad</option>
              <option value="watch">Would watch</option>
              <option value="nope">Won’t watch</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={long}
              onChange={(e) => setLong(e.target.checked)}
            />
            Long title
          </label>
          <button onClick={() => setDetails(true)}>Open details</button>
          <label>
            Displayed anime{" "}
            <select
              aria-label="Displayed anime"
              value={displayed}
              onChange={(e) => setDisplayed(Number(e.target.value))}
            >
              {demo.map((a, index) => (
                <option key={a.id} value={index}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />
            Recommendation layout
          </label>
          <label>
            <input
              type="checkbox"
              checked={dynamic}
              onChange={(e) => setDynamic(e.target.checked)}
            />
            Dynamic background
          </label>
          <label>
            Background style{" "}
            <select
              aria-label="Background style"
              value={backgroundStyle}
              onChange={(e) => setBackgroundStyle(e.target.value)}
            >
              {BACKGROUND_STYLES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <small>Layout preview · No profile changes</small>
        </div>
      </details>
      {location.search.includes("background-options") && (
        <div className="background-options-fixture">
          <BackgroundOptions
            settings={{ dynamic, backgroundStyle }}
            onChange={(patch) => {
              setDynamic(patch.dynamic);
              if (patch.backgroundStyle)
                setBackgroundStyle(patch.backgroundStyle);
            }}
          />
        </div>
      )}
      <main>
        <div
          className={
            compact
              ? "leaderboard-row"
              : `cards-layout discover-layout${details ? " expanded" : ""}`
          }
        >
          <AnimeCard
            anime={{
              ...demo[displayed],
              ...(long ? { title: anime.title, englishTitle: "" } : {}),
              ...(location.search.includes("category-labels")
                ? {
                    genres: [
                      "Shounen",
                      "Action",
                      "Adventure",
                      "Drama",
                      "Fantasy",
                      "Military",
                    ],
                  }
                : {}),
              ...(location.search.includes("genre-labels")
                ? {
                    genres: [
                      "Drama",
                      "Sci-Fi",
                      "Suspense",
                      "Psychological",
                      "Time Travel",
                    ],
                  }
                : {}),
            }}
            selectedCategories={
              location.search.includes("category-labels") ? ["Shounen"] : []
            }
            selectedThemes={
              location.search.includes("category-labels") ? ["Military"] : []
            }
            selectedGenres={
              location.search.includes("genre-labels") ? ["Sci-Fi"] : []
            }
            restrictGenres={location.search.includes("genre-labels")}
            compact={compact}
            onReact={() => {}}
            onSkip={() => {}}
            onUndo={() => {}}
            detailsOpen={details}
            onDetails={() => setDetails((value) => !value)}
            onWhy={() => setDetails("why")}
            dynamic={dynamic}
          />
          {details && (
            <AnimeDetails
              initialTab={details === "why" ? "why" : "synopsis"}
              modal={!compact}
              responsive
              anime={{
                ...demo[displayed],
                ...(long ? { title: anime.title, englishTitle: "" } : {}),
              }}
              reactions={
                action === "none"
                  ? {}
                  : { [anime.id]: { anime, action, feedback, at: 1 } }
              }
              onSaveFeedback={async (_id, next) => setFeedback(next)}
              onClose={() => setDetails(false)}
              reason="A different pick to explore your taste."
            />
          )}
        </div>
      </main>
    </>
  );
}
// Exercise the complete page without account writes, ranking requests or analytics.
function ShortlistFixture() {
  const [state, setState] = useState(() => ({
    ready: true,
    onboardingComplete: true,
    preview: true,
    busy: false,
    recommendationsReady: true,
    recommendationsLoading: false,
    recommendationPicks: demo.map((anime, i) => ({
      anime,
      tier: i + 1,
      reason: "Sample recommendation for layout review.",
      whyReasons: ["Sample explanation for this preview."],
    })),
    preferences: normalizePreferences({ favoriteGenres: ["Action"] }),
    reactions: {},
    // Synthetic history belongs only to this fixture; no account data is read.
    list: Array.from({ length: 8 }, (_, i) => ({
      ...demo[i % demo.length],
      id: 900000 + i,
      listStatus: { status: "completed", score: 8 },
    })),
    settings: { dynamic: false },
    undoableIds: [],
    canUndo: false,
  }));
  const store = useMemo(
    () => ({
      visitRecommendations() {},
      react(action, anime) {
        setState((s) => ({
          ...s,
          reactions: { ...s.reactions, [anime.id]: { action, anime } },
          undoableIds: [anime.id],
          canUndo: true,
        }));
      },
      undo(id) {
        setState((s) => {
          const reactions = { ...s.reactions };
          delete reactions[id || s.undoableIds[0]];
          return { ...s, reactions, undoableIds: [], canUndo: false };
        });
      },
      loadRecommendations() {
        setState((s) => ({
          ...s,
          recommendationsLoading: true,
          recommendationProgress: 50,
        }));
        setTimeout(
          () =>
            setState((s) => ({
              ...s,
              recommendationsLoading: false,
              recommendationProgress: null,
            })),
          1500,
        );
      },
    }),
    [],
  );
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          Anime Shuffle
        </a>
        <nav>
          <a className="nav-button" href="/#discover">
            Discover
          </a>
          <a className="nav-button" href="/#watchlist">
            Watchlist
          </a>
          <a className="nav-button active" href="/#recommendations">
            Recommendations
          </a>
        </nav>
      </header>
      <p style={{ padding: "0 24px" }}>
        Layout preview · seven sample picks · no profile changes
      </p>
      <main className="page-shell">
        <Recommendations
          state={state}
          store={store}
          onDiscover={() => {}}
          onPreferences={() => {}}
        />
      </main>
    </>
  );
}
function PreferencesFixture() {
  const [kind, setKind] = useState(
    location.search.includes("surface=settings") ? "settings" : "preferences",
  );
  const [connected, setConnected] = useState(false);
  const [preferences, setPreferences] = useState(() =>
    normalizePreferences({
      favoriteAnime: demo.slice(0, 3),
      favoriteGenres: ["Action", "Sci-Fi"],
      preferredNodes: ["isekai", "seinen"],
    }),
  );
  const [settings, setSettings] = useState({
    dynamic: true,
    backgroundStyle: "aurora",
    autoAdd: false,
  });
  const store = useMemo(
    () => ({
      setSettings: (patch) => setSettings((p) => ({ ...p, ...patch })),
      setAutoAdd: async (autoAdd) => setSettings((p) => ({ ...p, autoAdd })),
      saveViewingPreferences: async (value) => setPreferences(value),
      searchAnime: async (query) =>
        demo.filter((a) => a.title.toLowerCase().includes(query.toLowerCase())),
      syncAccount: async () => {},
      syncSavedToMal: async () => {},
      disconnect: async () => false,
    }),
    [],
  );
  const state = {
    session: {
      hosted: true,
      oauthConfigured: true,
      connected,
      cloudSync: connected,
      ...(connected
        ? {
            account: {
              id: "preview",
              name: "Preview account",
              provider: "local",
            },
          }
        : {}),
    },
    profile: connected ? { name: "Preview MAL connection" } : null,
    settings,
    preferences,
    preview: true,
    onboardingComplete: true,
    reactions: {},
    list: [],
    busy: false,
  };
  return (
    <>
      <AmbientBackground
        enabled={settings.dynamic !== false}
        style={settings.backgroundStyle}
        animated={settings.backgroundAnimated !== false}
        matchAnime={settings.backgroundMatchAnime !== false}
      />
      <div className="fixture-menu">
        <h1>Anime Shuffle</h1>
        <p>Layout preview · changes stay in memory</p>
        <button onClick={() => setKind("settings")}>Open Settings</button>
        <button onClick={() => setKind("preferences")}>
          Open Viewing preferences
        </button>
        <button onClick={() => setConnected((v) => !v)}>
          Toggle sample account
        </button>
      </div>
      <Dialogs
        kind={kind}
        state={state}
        store={store}
        onClose={() => setKind(null)}
        onNavigate={(next) => setKind(next === "welcome" ? "settings" : next)}
      />
    </>
  );
}
function Board() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Feedback layout checks</h1>
      <p>
        Actual components at fixed viewport sizes. Sample opinions stay in
        memory only.
      </p>
      {sizes.map(([w, h]) => (
        <section key={w} style={{ marginBottom: 24 }}>
          <h2>
            {w} × {h}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <iframe
              title={`Preview ${w}`}
              src={`?frame=1${location.search.includes("background-options") ? "&background-options=1" : ""}${location.search.includes("surface=discover") ? "&surface=discover" : ""}${location.search.includes("surface=settings") ? "&surface=settings" : ""}${location.search.includes("surface=preferences") ? "&surface=preferences" : ""}${location.search.includes("surface=onboarding") ? "&surface=onboarding" : ""}${location.search.includes("surface=watchlist") ? "&surface=watchlist" : ""}${location.search.includes("surface=shortlist") ? "&surface=shortlist" : ""}${location.search.includes("genre-labels") ? "&genre-labels=1" : ""}${location.search.includes("category-labels") ? "&category-labels=1" : ""}${location.search.includes("surface=recommendations") ? "&surface=recommendations" : ""}`}
              width={w}
              height={h}
              style={{ border: "1px solid #456171" }}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  new URLSearchParams(location.search).has("frame") ? <Fixture /> : <Board />,
);
