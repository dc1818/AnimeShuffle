import { AnimeTitle } from "./AnimeTitle.jsx";
import { useEffect, useRef, useState } from "react";
import {
  orderWatchlist,
  combinedWatchlist,
  watchlistText,
  watchlistBackup,
  parseWatchlistImport,
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

/** Show site saves and MAL plans together while keeping their origin explicit. */
export function Watchlist({ state, store, onDiscover }) {
  const [removing, setRemoving] = useState(null);
  const importFile = useRef(null);
  async function remove(anime, confirmed = false) {
    const result = await store.removeSaved(anime.id, confirmed);
    if (result?.confirmationRequired) setRemoving(anime);
    else if (result?.removed) setRemoving(null);
  }
  const [exportFormat, setExportFormat] = useState("json");
  const [pendingImport, setPendingImport] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("match");
  const [query, setQuery] = useState("");
  const [release, setRelease] = useState("all");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [genre, setGenre] = useState("all");
  const combined = combinedWatchlist(state.reactions, state.list);
  const source = combined.filter(
    (entry) => tab === "all" || (tab === "mal" ? entry.mal : entry.site),
  );
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
            available picks in Best match. Your site saves and MAL Plan to Watch
            appear together, with duplicates combined.
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
      <div className="watchlist-controls">
        <label>
          Source
          <select value={tab} onChange={(event) => setTab(event.target.value)}>
            <option value="all">All watchlist · {combined.length}</option>
            <option value="saved">Found on Anime Shuffle</option>
            <option value="mal" disabled={!state.session.connected}>
              MyAnimeList Plan to Watch
            </option>
          </select>
        </label>
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
            <option value="highest-rated">
              MyAnimeList score · Highest first
            </option>
            <option value="lowest-rated">
              MyAnimeList score · Lowest first
            </option>
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
            <option value="json">JSON</option>
            <option value="txt">Text</option>
          </select>
        </label>
        <div
          className="watchlist-transfer"
          role="group"
          aria-label="Import or export watchlist"
        >
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
                          tab === "all"
                            ? "Watchlist"
                            : tab === "mal"
                              ? "MAL Plan to Watch"
                              : "Found on Anime Shuffle",
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
            Export watchlist
          </button>
          <button
            className="outline"
            disabled={state.busy || importing}
            onClick={() => importFile.current?.click()}
          >
            Import watchlist
          </button>
        </div>
        <input
          ref={importFile}
          hidden
          aria-label="Import watchlist file"
          type="file"
          accept=".json,.txt,application/json,text/plain"
          disabled={state.busy || importing}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setPendingImport(null);
            setImportMessage("");
            if (!file) return;
            if (!/\.(json|txt)$/i.test(file.name)) {
              setImportMessage("Choose an Anime Shuffle .json or .txt export.");
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              setImportMessage("Choose a watchlist export smaller than 5 MB.");
              return;
            }
            try {
              const text = await file.text();
              const entries = parseWatchlistImport(text);
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
      </div>
      {(pendingImport || importMessage) && (
        <div className="watchlist-import">
          {pendingImport && (
            <div>
              <p>
                {pendingImport.count} new titles to add ·{" "}
                {pendingImport.skipped} duplicates or existing choices skipped.
              </p>
              {state.settings.autoAdd && state.session.connected && (
                <p>New titles will also be added to MAL Plan to Watch.</p>
              )}
              <button
                className="outline"
                disabled={!pendingImport.count || state.busy || importing}
                onClick={async () => {
                  setImporting(true);
                  try {
                    const count = await store.importWatchlist(
                      pendingImport.text,
                    );
                    setTab("all");
                    setPendingImport(null);
                    setImportMessage(`Imported ${count} titles.`);
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
      )}
      <p className="watchlist-count">
        {items.length} of {source.length} saved titles
        {source.some((entry) => entry.mal && !entry.addedAt) &&
          " · MAL-only entries have no known date added."}
      </p>
      {removing && (
        <RemoveWatchlistDialog
          anime={removing}
          busy={state.busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing, true)}
        />
      )}
      <div className="watchlist-grid">
        {items.map(({ anime, addedAt, site, mal }) => (
          <article className="saved-card" key={anime.id}>
            <div className="saved-image">
              <img src={coverUrl(anime)} alt={anime.title} loading="lazy" />
            </div>
            <div className="saved-content">
              <h3>
                <AnimeTitle anime={anime} />
              </h3>
              <p>{anime.genres?.slice(0, 3).join(" · ")}</p>
              <p>
                {releaseLabel(anime)} · {runtimeLabel(anime)}
              </p>
              <small>
                {addedAt
                  ? `Added ${new Date(addedAt).toLocaleDateString()}`
                  : "Date added unknown"}
              </small>
              {mal &&
                Number.isFinite(Date.parse(anime.listStatus?.updated_at)) && (
                  <small>
                    MAL last updated{" "}
                    {new Date(anime.listStatus.updated_at).toLocaleString()}
                  </small>
                )}
              <div className="saved-footer">
                <a
                  href={`https://myanimelist.net/anime/${anime.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on MAL ↗
                </a>
                <small>
                  {site && mal
                    ? "Found on Anime Shuffle · MAL Plan to Watch"
                    : mal
                      ? "MAL Plan to Watch"
                      : "Found on Anime Shuffle"}
                </small>
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={() => (mal ? setRemoving(anime) : remove(anime))}
                >
                  Remove
                </button>
                {site && (
                  <>
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

function RemoveWatchlistDialog({ anime, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="remove-watchlist-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="remove-watchlist-title">Remove from both watchlists?</h2>
      <p>
        This will remove <AnimeTitle anime={anime} /> from Anime Shuffle and
        your MyAnimeList Plan to Watch list. Any notes or other details saved
        with that MAL entry will also be deleted.
      </p>
      <button
        className="primary danger-confirm"
        disabled={busy}
        onClick={onConfirm}
      >
        {busy ? "Removing…" : "Remove from both"}
      </button>
      <button className="quiet" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  );
}
