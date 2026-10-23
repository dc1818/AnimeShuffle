import { Dialogs } from "../../src/components/Dialogs.jsx";
import { Watchlist } from "../../src/components/Watchlist.jsx";
import { normalizePreferences } from "../../src/lib/preferences.js";
import { BackgroundOptions } from "../../src/components/BackgroundOptions.jsx";
import { AmbientBackground } from "../../src/components/AmbientBackground.jsx";
// Isolated responsive fixture: sample titles, in-memory feedback, no account,
// analytics, recommendations requests, or changes to the visitor's profile.
import React, { useState } from "react";
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
              <option value="aurora">Aurora ribbons</option>
              <option value="liquid">Liquid light</option>
              <option value="comet">Comet drift</option>
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
              src={`?frame=1${location.search.includes("background-options") ? "&background-options=1" : ""}${location.search.includes("surface=discover") ? "&surface=discover" : ""}${location.search.includes("surface=onboarding") ? "&surface=onboarding" : ""}${location.search.includes("surface=watchlist") ? "&surface=watchlist" : ""}${location.search.includes("genre-labels") ? "&genre-labels=1" : ""}${location.search.includes("category-labels") ? "&category-labels=1" : ""}${location.search.includes("surface=recommendations") ? "&surface=recommendations" : ""}`}
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
