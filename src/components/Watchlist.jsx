import { useState } from "react";
import {
  orderWatchlist,
  watchlistText,
  watchlistBackup,
  parseWatchlistBackup,
  newWatchlistEntries,
} from "../lib/watchlist.js";
import {
  GENRES,
  defaultPreferences,
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  runtimeLabel,
} from "../lib/preferences.js";
import { releaseLabel } from "../lib/release.js";
import { Icon } from "./Icon.jsx";
import { coverUrl } from "./AnimeCard.jsx";

/** Local saved picks and imported MAL entries remain separate sources of truth. */
export function Watchlist({ state, store, onDiscover }) {
  const [exportFormat, setExportFormat] = useState("json");
  const [pendingImport, setPendingImport] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState("saved");
  const [sort, setSort] = useState("match");
  const [query, setQuery] = useState("");
  const [release, setRelease] = useState("all");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [genre, setGenre] = useState("all");
  const saved = Object.values(state.reactions)
    .filter((r) => r.action === "watch")
    .sort((a, b) => b.at - a.at)
    .map((r) => ({ anime: r.anime, addedAt: r.at || null }));
  const planned = state.list.filter(
    (a) => a.listStatus?.status === "plan_to_watch",
  );
  const source =
    tab === "mal"
      ? planned.map((anime) => ({
          anime,
          addedAt:
            state.reactions[anime.id]?.action === "watch"
              ? state.reactions[anime.id].at
              : null,
        }))
      : saved;
  const items = orderWatchlist(source, {
    ...state,
    preferences,
    tastePreferences: state.preferences,
    genre,
    sort,
    query,
    release,
  });
  return (
    <section aria-labelledby="watchlist-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your next obsessions</span>
          <h1 id="watchlist-heading">Watchlist</h1>
          <p>
            Your next watch, ordered by your taste. Unreleased shows come after
            available picks in Best match.
          </p>
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
      <div className="watchlist-controls">
        <label>
          Search titles
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a saved anime"
          />
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="match">Best match · Watch first</option>
            <option value="newest">Date added · Newest first</option>
            <option value="oldest">Date added · Oldest first</option>
            <option value="shortest">Total runtime · Shortest first</option>
            <option value="longest">Total runtime · Longest first</option>
          </select>
        </label>
        <label>
          Release status
          <select value={release} onChange={(e) => setRelease(e.target.value)}>
            <option value="all">Any status</option>
            <option value="available">Available to start</option>
            <option value="currently_airing">Currently airing</option>
            <option value="finished_airing">Finished airing</option>
            <option value="not_yet_aired">Not yet aired</option>
          </select>
        </label>
        {[
          ["formats", "Format", FORMAT_OPTIONS],
          ["lengths", "Series length", LENGTH_OPTIONS],
        ].map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              value={preferences[key][0] || ""}
              onChange={(e) =>
                setPreferences((p) => ({
                  ...p,
                  [key]: e.target.value ? [e.target.value] : [],
                }))
              }
            >
              <option value="">Any {label.toLowerCase()}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="all">Any genre</option>
            {[
              ...new Set([
                ...GENRES,
                ...source.flatMap(({ anime }) => anime.genres || []),
              ]),
            ]
              .sort()
              .map((g) => (
                <option key={g}>{g}</option>
              ))}
          </select>
        </label>
        <label>
          Missing information
          <select
            value={preferences.includeUnknown ? "include" : "hide"}
            onChange={(e) =>
              setPreferences((p) => ({
                ...p,
                includeUnknown: e.target.value === "include",
              }))
            }
          >
            <option value="include">Include unknown lengths / formats</option>
            <option value="hide">Hide unknown lengths / formats</option>
          </select>
        </label>
      </div>
      <div className="watchlist-actions">
        <button
          className="quiet"
          onClick={() => {
            setPreferences(defaultPreferences());
            setQuery("");
            setRelease("all");
            setGenre("all");
          }}
        >
          Clear filters
        </button>
        <label className="backup-format">
          Export format
          <select
            aria-label="Export format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
          >
            <option value="json">JSON · Backup and import</option>
            <option value="txt">Text · Readable list</option>
          </select>
        </label>
        <button
          className="outline"
          disabled={!source.length}
          onClick={() => {
            // Export the whole active list, even when its visible view is filtered.
            const entries = orderWatchlist(source, {
              ...state,
              preferences: defaultPreferences(),
              tastePreferences: state.preferences,
              sort,
            });
            const url = URL.createObjectURL(
              new Blob(
                [
                  exportFormat === "json"
                    ? watchlistBackup(entries)
                    : watchlistText(
                        entries,
                        tab === "mal" ? "MAL Plan to Watch" : "Saved here",
                      ),
                ],
                {
                  type:
                    exportFormat === "json"
                      ? "application/json"
                      : "text/plain;charset=utf-8",
                },
              ),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `anime-shuffle-watchlist.${exportFormat}`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export entire list
        </button>
      </div>
      <div className="watchlist-import">
        <label>
          Import watchlist backup (.json)
          <input
            type="file"
            accept=".json,application/json"
            disabled={state.busy || importing}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setPendingImport(null);
              setImportMessage("");
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setImportMessage("Choose a JSON backup smaller than 5 MB.");
                return;
              }
              try {
                const text = await file.text();
                const entries = parseWatchlistBackup(text);
                const fresh = newWatchlistEntries(
                  entries,
                  state.reactions,
                  state.list,
                );
                setPendingImport({
                  text,
                  count: fresh.length,
                  skipped: entries.length - fresh.length,
                });
              } catch (error) {
                setImportMessage(error.message);
              }
            }}
          />
        </label>
        <p>
          JSON backups restore into Saved here. Existing choices are kept.
          Importing does not add shows to MyAnimeList. Text exports are for
          reading.
        </p>
        {pendingImport && (
          <div>
            <p>
              {pendingImport.count} new titles to add · {pendingImport.skipped}{" "}
              duplicates or existing choices skipped.
            </p>
            <button
              className="primary"
              disabled={!pendingImport.count || state.busy || importing}
              onClick={async () => {
                setImporting(true);
                try {
                  const count = await store.importWatchlist(pendingImport.text);
                  setTab("saved");
                  setPendingImport(null);
                  setImportMessage(`Imported ${count} titles into Saved here.`);
                } catch (error) {
                  setImportMessage(error.message);
                } finally {
                  setImporting(false);
                }
              }}
            >
              Import {pendingImport.count} titles
            </button>
            <button
              className="quiet"
              disabled={importing}
              onClick={() => setPendingImport(null)}
            >
              Cancel
            </button>
          </div>
        )}
        <p role="status">{importMessage}</p>
      </div>
      <p className="watchlist-count">
        {items.length} of {source.length} saved titles
        {tab === "mal" &&
          " · Date added is known only for titles you saved here; MAL import dates are not guessed."}
      </p>
      <div className="watchlist-grid">
        {items.map(({ anime, addedAt }) => (
          <article className="saved-card" key={anime.id}>
            <div className="saved-image">
              <img src={coverUrl(anime)} alt={anime.title} loading="lazy" />
            </div>
            <div className="saved-content">
              <h3>{anime.title}</h3>
              <p>{anime.genres?.slice(0, 3).join(" · ")}</p>
              <p>
                {releaseLabel(anime)} · {runtimeLabel(anime)}
              </p>
              <small>
                {addedAt
                  ? `Added ${new Date(addedAt).toLocaleDateString()}`
                  : "Date added unknown"}
              </small>
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
          <h2>
            {source.length
              ? "No saved anime match these filters"
              : "Room for your next favorite"}
          </h2>
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
