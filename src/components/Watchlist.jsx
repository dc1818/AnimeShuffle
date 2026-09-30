import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { coverUrl } from "./AnimeCard.jsx";

/** Local saved picks and imported MAL entries remain separate sources of truth. */
export function Watchlist({ state, store, onDiscover }) {
  const [tab, setTab] = useState("saved");
  const saved = Object.values(state.reactions)
    .filter((r) => r.action === "watch")
    .sort((a, b) => b.at - a.at)
    .map((r) => r.anime);
  const planned = state.list.filter(
    (a) => a.listStatus?.status === "plan_to_watch",
  );
  const items = tab === "mal" ? planned : saved;
  return (
    <section aria-labelledby="watchlist-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your next obsessions</span>
          <h1 id="watchlist-heading">Watchlist</h1>
          <p>The anime you want to make time for.</p>
        </div>
        {state.session.connected && (
          <button
            className="outline"
            disabled={state.busy}
            onClick={store.refreshList}
          >
            <Icon name="refresh" />
            Refresh MAL
          </button>
        )}
      </div>
      <div className="subtabs">
        <button
          className={tab === "saved" ? "selected" : ""}
          onClick={() => setTab("saved")}
        >
          Saved here <span>{saved.length}</span>
        </button>
        <button
          className={tab === "mal" ? "selected" : ""}
          disabled={!state.session.connected}
          onClick={() => setTab("mal")}
        >
          MAL Plan to Watch <span>{planned.length}</span>
        </button>
      </div>
      <div className="watchlist-grid">
        {items.map((anime) => (
          <article className="saved-card" key={anime.id}>
            <div className="saved-image">
              <img src={coverUrl(anime)} alt={anime.title} loading="lazy" />
            </div>
            <div className="saved-content">
              <h3>{anime.title}</h3>
              <p>{anime.genres?.slice(0, 3).join(" · ")}</p>
              <a
                href={`https://myanimelist.net/anime/${anime.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on MAL ↗
              </a>
              {tab === "saved" && (
                <>
                  <button
                    className="quiet"
                    disabled={state.busy}
                    onClick={() => store.removeSaved(anime.id)}
                  >
                    Remove saved
                  </button>
                  {state.session.connected &&
                    !state.list.some((a) => a.id === anime.id) && (
                      <button
                        className="outline"
                        disabled={state.busy}
                        onClick={() => store.saveToMal(anime)}
                      >
                        Add to MAL
                      </button>
                    )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <div className="empty">
          <Icon name="bookmark" />
          <h2>Room for your next favorite</h2>
          <p>
            {tab === "mal"
              ? "Your imported MAL Plan to Watch list is empty."
              : "Choose “Would watch” on an anime to save it here."}
          </p>
          <button className="primary" onClick={onDiscover}>
            Discover anime
          </button>
        </div>
      )}
    </section>
  );
}
