import {
  rankWatchlist,
  cachedWatchlistScores,
} from "../lib/watchlist-ranking.js";
import { genreLabel } from "../lib/genres.js";
import { AnimeTitle } from "./AnimeTitle.jsx";
import { primaryTitle, englishTitle } from "../lib/titles.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  orderWatchlist,
  watchlistTimestamp,
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
import { AnimeDetails } from "./AnimeCard.jsx";
import { WatchlistCover } from "./WatchlistCover.jsx";

/** Show site saves and MAL plans together while keeping their origin explicit. */
export function Watchlist({ state, store, onDiscover }) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [detailsAnime, setDetailsAnime] = useState(null);
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
  const combined = useMemo(
    () => combinedWatchlist(state.reactions, state.list),
    [state.reactions, state.list],
  );
  const source = useMemo(
    () =>
      combined.filter(
        (entry) => tab === "all" || (tab === "mal" ? entry.mal : entry.site),
      ),
    [combined, tab],
  );
  const [ranking, setRanking] = useState(null);
  const [rankingFailed, setRankingFailed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  const bottom = useRef(null);
  const [jumpRequested, setJumpRequested] = useState(false);
  useEffect(() => {
    if (!jumpRequested) return;
    const frame = window.requestAnimationFrame(() => {
      bottom.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
        block: "end",
      });
      setJumpRequested(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [jumpRequested, visibleCount]);
  const inputsMatch =
    ranking?.reactions === state.reactions &&
    ranking?.list === state.list &&
    ranking?.preferences === state.preferences;
  const scores = inputsMatch
    ? ranking.scores
    : cachedWatchlistScores(state.reactions, state.list, state.preferences);
  useEffect(() => {
    if (!combined.length || sort !== "match") return;
    let active = true;
    setRankingFailed(false);
    rankWatchlist(state.reactions, state.list, state.preferences).then(
      (scores) => {
        if (active)
          setRanking({
            reactions: state.reactions,
            list: state.list,
            preferences: state.preferences,
            scores,
          });
      },
      () => {
        if (active) setRankingFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [state.reactions, state.list, state.preferences, combined.length, sort]);
  useEffect(() => {
    setVisibleCount(60);
  }, [tab, sort, query, release, preferences, genre]);
  // Render saved titles immediately, then apply personalized ordering when ready.
  const effectiveSort = sort === "match" && !scores ? "newest" : sort;
  const items = useMemo(
    () =>
      orderWatchlist(source, {
        preferences,
        genre,
        sort: effectiveSort,
        query,
        release,
        scores,
      }),
    [source, preferences, genre, effectiveSort, query, release, scores],
  );
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
        <label className="watchlist-search">
          Search your watchlist
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all saved anime by title…"
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
        <button
          className="outline watchlist-filter-toggle"
          aria-expanded={filtersExpanded}
          aria-controls="watchlist-extra-filters"
          onClick={() => setFiltersExpanded((value) => !value)}
        >
          {filtersExpanded ? "Hide filters" : "Filters"}
          {(tab !== "all" ||
            release !== "all" ||
            genre !== "all" ||
            preferences.formats.length > 0 ||
            preferences.lengths.length > 0 ||
            !preferences.includeUnknown) &&
            " · Active"}
        </button>
        <div
          id="watchlist-extra-filters"
          className={`watchlist-extra-filters${filtersExpanded ? " expanded" : ""}`}
        >
          <label>
            Source
            <select
              value={tab}
              onChange={(event) => setTab(event.target.value)}
            >
              <option value="all">All watchlist · {combined.length}</option>
              <option value="saved">Found on Anime Shuffle</option>
              <option value="mal" disabled={!state.session.connected}>
                MyAnimeList Plan to Watch
              </option>
            </select>
          </label>
          <label>
            Release status
            <select
              value={release}
              onChange={(e) => setRelease(e.target.value)}
            >
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
                  <option key={g} value={g}>
                    {genreLabel(g)}
                  </option>
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
      </div>
      <div className="watchlist-actions">
        {items.length > 8 && (
          <button
            className="outline watchlist-jump"
            onClick={() => {
              setVisibleCount(items.length);
              setJumpRequested(true);
            }}
          >
            Jump to bottom <Icon name="chevron" />
          </button>
        )}
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
        <details className="watchlist-tools">
          <summary>Import / export</summary>
          <div className="watchlist-tools-body">
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
                    sort: effectiveSort,
                    scores,
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
                  setImportMessage(
                    "Choose an Anime Shuffle .json or .txt export.",
                  );
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  setImportMessage(
                    "Choose a watchlist export smaller than 5 MB.",
                  );
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
        </details>
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
      {sort === "match" && !scores && combined.length > 0 && (
        <p role="status">
          {rankingFailed
            ? "Best-match sorting is unavailable. Showing newest saves first."
            : "Updating best matches… Your saved anime are ready below."}
        </p>
      )}
      {detailsAnime && (
        <WatchlistDetails
          key={detailsAnime.id}
          anime={detailsAnime}
          state={state}
          store={store}
          onClose={() => setDetailsAnime(null)}
        />
      )}
      <div className="watchlist-grid">
        {items
          .slice(0, visibleCount)
          .map(({ anime, addedAt, site, mal }, index) => (
            <article className="saved-card" key={anime.id}>
              <WatchlistCover
                key={anime.image}
                anime={anime}
                priority={index < 8}
              />
              <div className="saved-content">
                <h3>
                  <AnimeTitle anime={anime} />
                </h3>
                <p>{anime.genres?.slice(0, 3).map(genreLabel).join(" · ")}</p>
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
                      {watchlistTimestamp(anime.listStatus.updated_at)}
                    </small>
                  )}
                <div className="saved-footer">
                  <button
                    className="outline details-toggle"
                    onClick={() => setDetailsAnime(anime)}
                  >
                    More details <Icon name="chevron" />
                  </button>
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
      {items.length > visibleCount && (
        <button
          className="outline"
          onClick={() => setVisibleCount((count) => count + 60)}
        >
          Show more ({visibleCount} of {items.length})
        </button>
      )}
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
      <div ref={bottom} className="watchlist-bottom" />
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
        This will remove {primaryTitle(anime)}
        {englishTitle(anime) ? ` (${englishTitle(anime)})` : ""} from Anime
        Shuffle and your MyAnimeList Plan to Watch list. Any notes or other
        details saved with that MAL entry will also be deleted.
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

/** Open saved metadata immediately, then hydrate this exact title from the shared cache. */
function WatchlistDetails({ anime, state, store, onClose }) {
  const [full, setFull] = useState(anime);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => store.getAnimeDetails(anime))
      .then(
        (details) => {
          if (active) setFull({ ...anime, ...details });
        },
        () => {
          if (active)
            setError(
              "Full details could not be loaded. Showing saved information.",
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [anime, store]);
  return (
    <AnimeDetails
      anime={full}
      modal
      loading={loading}
      error={error}
      onClose={onClose}
      reason="This anime is saved on your watchlist."
      reactions={state.reactions}
      onSaveFeedback={store.setReactionFeedback}
    />
  );
}
