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
  [1440, 900],
];
function Fixture() {
  const [action, setAction] = useState("good"),
    [long, setLong] = useState(false),
    [feedback, setFeedback] = useState(null),
    [details, setDetails] = useState(
      !location.search.includes("surface=recommendations"),
    ),
    [compact, setCompact] = useState(
      location.search.includes("surface=recommendations"),
    ),
    [displayed, setDisplayed] = useState(1),
    [dynamic, setDynamic] = useState(true);
  const anime = {
    ...demo[0],
    title: long
      ? "A Very Long Anime Title: The Unexpected Adventure of a Wandering Space Crew and Their Remarkably Complicated Relationships"
      : demo[0].title,
    englishTitle: "",
  };
  return (
    <>
      <AmbientBackground enabled={dynamic} />
      <header className="topbar">
        <a className="brand">Anime Shuffle</a>
        <nav>
          <button className="nav-button active">Discover</button>
          <button className="nav-button">Watchlist</button>
          <button className="nav-button">Recommendations</button>
        </nav>
      </header>
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
        <small>Layout preview · No profile changes</small>
      </div>
      <main>
        <div
          className={
            compact
              ? "leaderboard-row"
              : `cards-layout${details ? " expanded" : ""}`
          }
        >
          <AnimeCard
            anime={demo[displayed]}
            compact={compact}
            onReact={() => {}}
            onSkip={() => {}}
            onUndo={() => {}}
            onDetails={() => setDetails(true)}
            dynamic={dynamic}
          />
          {details && (
            <AnimeDetails
              responsive
              anime={demo[displayed]}
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
              src="?frame=1"
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
