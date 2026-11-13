// Isolated real cover/player UI with a local YouTube API stand-in. No accounts.
import React, { useState } from "react";
import { WatchlistGrid } from "../../src/components/WatchlistGrid.jsx";
import { AnimeTitle } from "../../src/components/AnimeTitle.jsx";
import { createRoot } from "react-dom/client";
import { WatchlistCover } from "../../src/components/WatchlistCover.jsx";
import { TrailerPreviewGroup } from "../../src/components/TrailerPreview.jsx";
const instances = [];
window.YT = {
  Player: class {
    constructor(frame, { events }) {
      this.events = events;
      // Keep the real iframe element and its dimensions, without remote playback.
      frame.removeAttribute("src");
      frame.srcdoc =
        '<body style="margin:0;background:#111;color:white;display:grid;place-items:center;height:100vh;font:16px system-ui">Video viewport</body>';
      instances.push(this);
      queueMicrotask(() => events.onReady({ target: this }));
    }
    mute() {}
    playVideo() {
      this.events.onStateChange({ target: this, data: 1 });
    }
    pauseVideo() {
      this.events.onStateChange({ target: this, data: 2 });
    }
    destroy() {
      instances.splice(instances.indexOf(this), 1);
    }
  },
};
window.fetch = async () =>
  Response.json({
    videoId: "abcdefghijk",
    trailers: [{ videoId: "abcdefghijk", title: "Preview" }],
  });
const states = {
  Playing: () => instances.forEach((p) => p.playVideo()),
  Paused: () => instances.forEach((p) => p.pauseVideo()),
  Buffering: () =>
    instances.forEach((p) => p.events.onStateChange({ target: p, data: 3 })),
  "Autoplay blocked": () =>
    instances.forEach((p) => p.events.onAutoplayBlocked()),
};
const list = new URLSearchParams(location.search).has("list");
const titles = [
  "Cowboy Bebop",
  "Fullmetal Alchemist: Brotherhood",
  "The Disastrous Life of Saiki K. — Special Edition",
  "Kaguya-sama wa Kokurasetai: Ultra Romantic",
  "The Slime Diaries: That Time I Got Reincarnated as a Slime",
];
const cover =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#203d59"/><circle cx="150" cy="190" r="70" fill="#638ca8"/></svg>',
  );
function Fixture() {
  const [count, setCount] = useState(24);
  return (
    <main className="watchlist-page">
      <h1>Watchlist preview layout test</h1>
      <div>
        {Object.entries(states).map(([name, run]) => (
          <button key={name} onClick={run}>
            {name}
          </button>
        ))}
        <button onClick={() => setCount((n) => (n === 24 ? 60 : 24))}>
          Change card count
        </button>
      </div>
      <TrailerPreviewGroup>
        <WatchlistGrid
          className={`watchlist-grid ${list ? "watchlist-list" : ""}`}
        >
          {Array.from({ length: count }, (_, id) => {
            const anime = {
              id: 990100 + id,
              title: titles[id % titles.length],
              englishTitle:
                id % 3 === 0
                  ? "An English translation with another long subtitle"
                  : "",
              image: id % 4 ? cover : undefined,
              previewVideoId: "abcdefghijk",
              previewRegionChecked: true,
            };
            return (
              <article className="saved-card" key={id}>
                <WatchlistCover priority={id < 8} anime={anime} />
                <div className="saved-content">
                  <h3>
                    <AnimeTitle anime={anime} />
                  </h3>
                  <p className="saved-format">
                    {id % 2 ? "TV · 12 episodes" : "SPECIAL · 120 episodes"}
                  </p>
                  <p className="saved-genres">
                    {id % 2 ? "Action · Adventure · Science Fiction" : "Comedy"}
                  </p>
                  <p>
                    {id % 2
                      ? "24 minutes per episode · Airing"
                      : "2 hours 10 minutes"}
                  </p>
                  {id % 3 === 0 && (
                    <p className="saved-match-reason">
                      Matches your interest in adventure, science fiction and
                      stories about friendship.
                    </p>
                  )}
                  <span className="saved-source">
                    {id % 2 ? "Shuffle + MAL" : "Anime Shuffle"}
                  </span>
                  <div className="saved-footer">
                    <button className="outline details-toggle">
                      More details
                    </button>
                    <details className="saved-menu">
                      <summary aria-label="Card actions">⋯</summary>
                      <div className="saved-menu-panel">
                        <button>Remove</button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            );
          })}
        </WatchlistGrid>
      </TrailerPreviewGroup>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Fixture />);
