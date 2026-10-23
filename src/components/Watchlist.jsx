import {
  rankWatchlist,
  cachedWatchlistScores,
  cachedWatchlistReasons,
} from "../lib/watchlist-ranking.js";
import { genreLabel } from "../lib/genres.js";
import { AnimeTitle } from "./AnimeTitle.jsx";
import { primaryTitle, englishTitle } from "../lib/titles.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { Icon } from "./Icon.jsx";
import { AnimeDetails } from "./AnimeCard.jsx";
import { WatchlistCover } from "./WatchlistCover.jsx";

// Session-only UI memory, scoped to the store and account. Never exported or synced.
const browsingSessions = new WeakMap();
export function Watchlist(props) {
  const scope = String(
    props.state.session.account?.id ||
      props.state.session.profile?.id ||
      "guest",
  );
  if (!browsingSessions.has(props.store))
    browsingSessions.set(props.store, new Map());
  const sessions = browsingSessions.get(props.store);
  if (!sessions.has(scope)) sessions.set(scope, {});
  return <WatchlistView key={scope} {...props} memory={sessions.get(scope)} />;
}

/** Show site saves and MAL plans together while keeping their origin explicit. */
function WatchlistView({ state, store, onDiscover, memory }) {
  const [filtersExpanded, setFiltersExpanded] = useState(
    memory.filtersExpanded || false,
  );
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
  const [tab, setTab] = useState(memory.tab ?? "all");
  const [sort, setSort] = useState(memory.sort ?? "match");
  const [query, setQuery] = useState(memory.query ?? "");
  const [release, setRelease] = useState(memory.release ?? "all");
  const [preferences, setPreferences] = useState(
    () => memory.preferences ?? defaultPreferences(),
  );
  const [genre, setGenre] = useState(memory.genre ?? "all");
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
  const [visibleCount, setVisibleCount] = useState(memory.visibleCount || 60);
  const [pageStart, setPageStart] = useState(memory.pageStart || 0);
  const [layout, setLayout] = useState(memory.layout || "grid");
  const top = useRef(null);
  const restored = useRef(false);
  useLayoutEffect(() => {
    Object.assign(memory, {
      tab,
      sort,
      query,
      release,
      preferences,
      genre,
      filtersExpanded,
      visibleCount,
      pageStart,
      layout,
    });
  });
  useLayoutEffect(() => {
    const y = memory.scrollY || 0;
    const frame = y
      ? window.requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" });
        })
      : null;
    const rememberScroll = () => {
      memory.scrollY = window.scrollY;
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [memory]);
  const bottom = useRef(null);
  const [jumpRequested, setJumpRequested] = useState(false);
  useEffect(() => {
    if (!jumpRequested) return;
    const frame = window.requestAnimationFrame(() => {
      (jumpRequested === "top" ? top : bottom).current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
        block: jumpRequested === "top" ? "start" : "end",
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
    if (!restored.current) {
      restored.current = true;
      return;
    }
    setVisibleCount(60);
    setPageStart(0);
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
  const reasons = cachedWatchlistReasons(
    state.reactions,
    state.list,
    state.preferences,
  );
  const activeFilters = [
    tab !== "all" && {
      label: tab === "mal" ? "MAL" : "Anime Shuffle",
      clear: () => setTab("all"),
    },
    release !== "all" && {
      label: release.replaceAll("_", " "),
      clear: () => setRelease("all"),
    },
    genre !== "all" && {
      label: genreLabel(genre),
      clear: () => setGenre("all"),
    },
    ...["formats", "lengths"].flatMap((key) =>
      preferences[key].map((value) => ({
        label:
          [...FORMAT_OPTIONS, ...LENGTH_OPTIONS].find((o) => o.id === value)
            ?.label || value,
        clear: () => setPreferences((p) => ({ ...p, [key]: [] })),
      })),
    ),
    !preferences.includeUnknown && {
      label: "Known lengths / formats",
      clear: () => setPreferences((p) => ({ ...p, includeUnknown: true })),
    },
  ].filter(Boolean);
  function clearFilters() {
    setTab("all");
    setQuery("");
    setRelease("all");
    setGenre("all");
    setPreferences(defaultPreferences());
  }
  const start = Math.min(pageStart, Math.max(0, items.length - 60));
  const end = Math.min(start + visibleCount, items.length);
  return (
    <section className="watchlist-page" aria-labelledby="watchlist-heading">
      <div className="section-heading">
        <div>
          <h1 id="watchlist-heading">Watchlist</h1>
          <p>Your saved anime, ordered by your taste.</p>
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
          <Icon name="filters" /> {filtersExpanded ? "Hide filters" : "Filters"}
          {activeFilters.length > 0 && ` · ${activeFilters.length}`}
        </button>
        <div
          className="watchlist-layout-switch"
          role="group"
          aria-label="Watchlist layout"
        >
          <button
            aria-label="Grid view"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <Icon name="grid" />
          </button>
          <button
            aria-label="List view"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <Icon name="list" />
          </button>
        </div>
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
          </label>{" "}
          <details className="watchlist-sort-help">
            <summary>How is this list ordered?</summary>
            <p>
              Best match uses your reactions and viewing preferences, with
              unreleased anime after available picks. Site saves and MAL Plan to
              Watch are combined without duplicates. MAL-only entries have no
              known date added, so they appear after dated saves when sorting by
              date.
            </p>
          </details>
        </div>
      </div>
      <div className="watchlist-actions">
        <div className="watchlist-active-filters" aria-label="Active filters">
          {activeFilters.map((filter) => (
            <button
              key={filter.label}
              className="filter-chip"
              onClick={filter.clear}
              aria-label={`Remove filter: ${filter.label}`}
            >
              {filter.label}
              <Icon name="close" />
            </button>
          ))}
          {(activeFilters.length > 0 || query) && (
            <button className="quiet" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        {items.length > 60 && (
          <button
            className="quiet"
            onClick={() => {
              setPageStart(Math.max(0, items.length - 60));
              setVisibleCount(60);
              setJumpRequested("bottom");
            }}
          >
            Jump to bottom <Icon name="chevron" />
          </button>
        )}{" "}
        <details className="watchlist-tools">
          <summary>Import / export <Icon name="chevron" /></summary>
          <div className="watchlist-tools-body">
            <section className="watchlist-transfer-section" aria-label="Export watchlist options">
              <h3>Save a copy</h3>
              <p>Download every title in the current list, including titles hidden by filters.</p>
              <div className="watchlist-export-controls">
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
              </div>
            </section>
            <section className="watchlist-transfer-section" aria-label="Import watchlist options">
              <h3>Restore a saved list</h3>
              <p>Choose an Anime Shuffle JSON or text export, up to 5 MB. Review new titles before adding them.</p>
              <button
                className="outline"
                disabled={state.busy || importing}
                onClick={() => importFile.current?.click()}
              >
                Import watchlist
              </button>
            </section>
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
      <p
        className="watchlist-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.length} of {source.length} saved titles
        {items.length > 60 && ` · Showing ${start + 1}–${end}`}
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
      <div className="watchlist-pagination" ref={top}>
        {start > 0 && (
          <button
            className="outline"
            onClick={() => {
              setPageStart(Math.max(0, start - 60));
              setVisibleCount(60);
              setJumpRequested("top");
            }}
          >
            Previous titles
          </button>
        )}
      </div>
      <div
        className={`watchlist-grid ${layout === "list" ? "watchlist-list" : ""}`}
      >
        {items.slice(start, end).map(({ anime, addedAt, site, mal }, index) => (
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
              <p className="saved-format">
                {{ movie: "Movie", special: "Special", music: "Music" }[
                  anime.format
                ] ||
                  anime.format?.toUpperCase() ||
                  "Format unknown"}
                {anime.episodes > 0 &&
                  ` · ${anime.episodes} episode${anime.episodes === 1 ? "" : "s"}`}
              </p>
              <p className="saved-genres">
                {anime.genres?.slice(0, 3).map(genreLabel).join(" · ")}
              </p>
              <p>
                {runtimeLabel(anime)}
                {anime.status === "not_yet_aired" && " · Not yet aired"}
                {anime.status === "currently_airing" && " · Airing"}
              </p>
              {sort === "match" && reasons?.[anime.id] && (
                <p className="saved-match-reason">{reasons[anime.id]}</p>
              )}
              <span
                className="saved-source"
                title={
                  site && mal
                    ? "Found on Anime Shuffle and MAL Plan to Watch"
                    : mal
                      ? "MAL Plan to Watch"
                      : "Found on Anime Shuffle"
                }
              >
                {site && mal ? "Shuffle + MAL" : mal ? "MAL" : "Anime Shuffle"}
              </span>
              <div className="saved-footer">
                <button
                  className="outline details-toggle"
                  onClick={() => setDetailsAnime(anime)}
                >
                  More details <Icon name="chevron" />
                </button>
                <WatchlistActions anime={anime}>
                  <a
                    href={`https://myanimelist.net/anime/${anime.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on MAL <Icon name="external" />
                  </a>
                  <small>
                    {addedAt
                      ? `Added ${new Date(addedAt).toLocaleDateString()}`
                      : "Date added unknown"}
                  </small>
                  {mal &&
                    Number.isFinite(
                      Date.parse(anime.listStatus?.updated_at),
                    ) && (
                      <small>
                        MAL last updated{" "}
                        {watchlistTimestamp(anime.listStatus.updated_at)}
                      </small>
                    )}
                  {site &&
                    state.session.connected &&
                    !state.list.some((a) => a.id === anime.id) && (
                      <button
                        disabled={state.busy}
                        onClick={() => store.saveToMal(anime)}
                      >
                        Add to MAL
                      </button>
                    )}
                  <button
                    className="saved-remove"
                    disabled={state.busy}
                    onClick={() => (mal ? setRemoving(anime) : remove(anime))}
                  >
                    Remove
                  </button>
                </WatchlistActions>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="watchlist-pagination watchlist-pagination-bottom">
        {end < items.length && (
          <button
            className="outline"
            onClick={() => {
              if (visibleCount < 120) setVisibleCount((count) => count + 60);
              else {
                setPageStart(start + 60);
                setJumpRequested("top");
              }
            }}
          >
            Show more ({end} of {items.length})
          </button>
        )}
        {items.length > 0 && (
          <button
            className="quiet"
            onClick={() => {
              if (start > 0) {
                setPageStart(0);
                setVisibleCount(60);
              }
              setJumpRequested("top");
            }}
          >
            Back to top
          </button>
        )}
      </div>
      {!items.length && (
        <div className="empty">
          <Icon name="bookmark" />
          <h2>
            {combined.length
              ? "No titles match your search or filters"
              : "Room for your next favorite"}
          </h2>
          <p>
            {combined.length
              ? "Try a different search or clear your filters to see your saved anime."
              : "Choose “Would watch” on an anime to save it here."}
          </p>
          {combined.length ? (
            <button className="primary" onClick={clearFilters}>
              Clear search and filters
            </button>
          ) : (
            <button className="primary" onClick={onDiscover}>
              Discover anime
            </button>
          )}
        </div>
      )}
      <div ref={bottom} className="watchlist-bottom" />
    </section>
  );
}

function WatchlistActions({ anime, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const outside = (event) => {
      if (!ref.current?.contains(event.target))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);
  return (
    <details
      ref={ref}
      className="saved-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          ref.current.removeAttribute("open");
          ref.current.querySelector("summary").focus();
        }
      }}
    >
      <summary aria-label={`Actions for ${primaryTitle(anime)}`}>
        <Icon name="more" />
      </summary>
      <div className="saved-menu-panel">{children}</div>
    </details>
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
      showWhy={false}
      reactions={state.reactions}
      onSaveFeedback={store.setReactionFeedback}
    />
  );
}
