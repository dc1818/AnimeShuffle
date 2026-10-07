import { nuancedTraits } from "./nuanced-taste.js";
import { normalizeReactionReason } from "./reaction-reasons.js";
import { readCatalogCache, writeCatalogCache } from "./catalog-cache.js";
import { recommendationsUnlocked } from "./recommendation-access.js";
import { createBrowserBackup, browserLocalStorage } from "./browser-storage.js";
import { matchesTitle } from "./titles.js";
import { BACKGROUND_REFRESH_MS } from "./refresh-policy.js";
import { createDiagnostics } from "./diagnostics.js";
import { defaultPreferences, normalizePreferences } from "./preferences.js";
import {
  parseWatchlistImport,
  newWatchlistEntries,
  missingMalPlans,
} from "./watchlist.js";
import { createCloudSync } from "./cloud-sync.js";
import { demo } from "./demo.js";
import { isUnreleased } from "./release.js";
import {
  chooseNext,
  eligibleCandidates,
  detailedExplanation,
  buildTaste,
  recommendationSeeds,
  isEligible,
  rankRecommendations,
  preferenceWeight,
  REACTIONS,
} from "./recommend.js";

/**
 * Application state and asynchronous commands, independent of the DOM.
 * React subscribes through useSyncExternalStore. Keeping API orchestration here
 * makes reaction/Undo behavior testable without rendering a browser page.
 * Only local reactions/settings are persisted; imported MAL data stays in memory.
 */
// API objects may arrive with different key order. Compare values so polling
// an unchanged account cannot discard a completed recommendation batch.
function sameData(a, b) {
  const stable = (value) =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    );
  return stable(a) === stable(b);
}

// Metadata enrichment is not a new vote. Guard Undo by the action identity,
// so a sanitized cloud snapshot cannot disable a still-valid local receipt.
function sameReaction(a, b) {
  return (
    !!a &&
    !!b &&
    a.action === b.action &&
    a.at === b.at &&
    a.anime?.id === b.anime?.id
  );
}

export function createAnimeStore({
  request = fetch,
  storage = browserLocalStorage(),
  browserBackup = createBrowserBackup(),
  staticMode = false,
  now = Date.now,
  diagnostics = createDiagnostics({ storage }),
} = {}) {
  // Serialize account writes without borrowing the feed's global busy state.
  let prefetchTimer = null;
  let prefetchRunning = false;
  let sessionGeneration = 0;
  let refillPending = null;
  let startupCatalog = null;
  let catalogNsfw = false;
  let candidateProvider = "tenrai";
  let candidateFilterKey = "";
  let startupFilterKey = "";
  let watchlistSyncPending = null;
  const detailRequests = new Map();
  let replacementSlots = [];
  let replacementRunning = false;
  let preferenceWrites = Promise.resolve();
  let preferenceVersion = 0;
  let preferencesUnsynced = false;
  let viewingPreferencesBefore = null;
  let state = {
    session: {},
    profile: null,
    list: [],
    reactions: {},
    lastReactionId: null,
    current: null,
    reason: "",
    detailReason: "",
    busy: true,
    ready: false,
    accountDataReady: false,
    discoveryLoading: false,
    discoveryProgress: null,
    discoveryStage: "Connecting to Anime Shuffle…",
    discoveryWork: "",
    discoveryStatus: "",
    recommendationsLoading: false,
    recommendationProgress: null,
    recommendationPicks: [],
    recommendationPool: [],
    recommendationsReady: false,
    recommendationError: "",
    recommendationPreferences: null,
    preview: true,
    canUndo: false,
    undoableIds: [],
    preferences: defaultPreferences(),
    onboardingComplete: false,
    settings: { autoAdd: false, dynamic: true },
    syncError: "",
    storageError: "",
    malSyncProgress: null,
    malSyncError: "",
    message: "",
    error: "",
  };
  let profileKey = "guest";
  let cloudSync = null;
  let pool = [],
    history = [],
    recent = [],
    skipped = new Set();
  let offsets = { popular: 0, top: 0, season: 0 },
    sourceIndex = 0;
  let lastDiscoverySearch = null;
  let initialization;
  let lastMalCheck = -Infinity;
  let lastAccountCheck = -Infinity;
  let malRefresh = null,
    accountRefresh = null,
    malWriteVersion = 0;
  const expandedSeeds = new Map();
  const details = new Map(),
    listeners = new Set();

  // Every published snapshot has a new identity, as React's subscription API requires.
  function update(patch) {
    state = {
      ...state,
      ...patch,
      ...(patch.busy === false ? { busyMessage: "" } : {}),
    };
    listeners.forEach((listener) => listener());
  }
  const notify = (message) => update({ message });
  const pendingReads = new Map();
  async function api(url, data) {
    if (staticMode)
      throw new Error("Accounts and MyAnimeList require the server version.");
    const read = data === undefined;
    // A list fetched before a write must never undo that write in local state.
    if (!read && url.startsWith("/api/plan")) malWriteVersion++;
    // Share identical reads; mutations are never deduplicated or automatically retried.
    if (read && pendingReads.has(url)) return pendingReads.get(url);
    const pending = (async () => {
      try {
        const { response, result } = await diagnostics.request(request, url, {
          method: read ? "GET" : "POST",
          headers: read
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRF-Token": state.session.csrf,
              },
          body: read ? undefined : JSON.stringify(data),
          // Bound writes too: a lost MAL response must not lock both feeds forever.
          // Mutations are never retried automatically because the server may have applied them.
          signal: AbortSignal.timeout(
            url.startsWith("/api/taste") ? 2500 : 45000,
          ),
        });
        if (!response.ok) {
          const error = new Error(result.error || "Request failed.");
          error.code = result.code;
          error.status = response.status;
          throw error;
        }
        return result;
      } catch (error) {
        if (["TimeoutError", "AbortError"].includes(error.name))
          throw new Error("This request took too long. Please try again.");
        throw error;
      }
    })();
    if (read) pendingReads.set(url, pending);
    try {
      return await pending;
    } finally {
      if (read) pendingReads.delete(url);
    }
  }
  // Awaiting an already-cached promise does not give the browser a paint opportunity.
  const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));
  let saveSequence = 0;
  let lastSavedAt = 0;
  // Serialize backup transactions, including writes caused by background account reads.
  let backupWrites = Promise.resolve();
  function persist(sync = true) {
    const sequence = ++saveSequence;
    const key = "anime-shuffle:" + profileKey;
    const snapshot = {
      reactions: state.reactions,
      settings: state.settings,
      preferences: state.preferences,
      onboardingComplete: state.onboardingComplete,
      savedAt: (lastSavedAt = Math.max(Date.now(), lastSavedAt + 1)),
    };
    let localSaved = false;
    try {
      storage.setItem(key, JSON.stringify(snapshot));
      localSaved = true;
    } catch {
      /* IndexedDB can still persist when localStorage is full or blocked. */
    }
    if (sync) cloudSync?.queue(state);
    const finish = (saved) => {
      if (sequence === saveSequence)
        update({
          storageError: saved
            ? ""
            : "Your latest changes could not be saved in this browser. Keep this tab open and retry saving before you leave.",
        });
    };
    if (!browserBackup) {
      finish(localSaved);
      return Promise.resolve(localSaved);
    }
    if (!localSaved)
      update({ storageError: "Saving your changes to browser storage…" });
    const pending = backupWrites.then(() => browserBackup.write(key, snapshot));
    backupWrites = pending.catch(() => {});
    return pending.then(
      () => {
        finish(true);
        return true;
      },
      () => {
        finish(localSaved);
        return localSaved;
      },
    );
  }
  async function loadLocal() {
    let stored = {};
    let localReadFailed = false;
    const key = "anime-shuffle:" + profileKey;
    try {
      stored = JSON.parse(storage.getItem(key) || "{}") || {};
    } catch {
      localReadFailed = true;
    }
    if (browserBackup) {
      try {
        await backupWrites;
        const backup = await browserBackup.read(key);
        if (backup && (!stored.savedAt || backup.savedAt > stored.savedAt))
          stored = backup;
      } catch {
        if (localReadFailed || !Object.keys(stored).length)
          update({
            storageError:
              "Saved browser progress could not be read. Reload before making new choices to avoid replacing it.",
          });
      }
    }
    lastSavedAt = Number(stored.savedAt) || 0;
    update({
      reactions: stored.reactions || {},
      preferences: normalizePreferences(stored.preferences),
      onboardingComplete: stored.onboardingComplete === true,
      settings: {
        autoAdd: false,
        dynamic: true,
        ...stored.settings,
      },
    });
  }
  // Loaded batches are immutable snapshots. Fresh list/account data affects the
  // next manual Refresh picks; current rows can be muted without changing order.
  function undoState() {
    return {
      canUndo: history.length > 0,
      undoableIds: [
        ...new Set(
          history
            .filter(
              (entry) =>
                !entry.skip &&
                sameReaction(state.reactions[entry.anime.id], entry.after),
            )
            .map((entry) => entry.anime.id),
        ),
      ],
    };
  }
  async function readList() {
    const writeVersion = malWriteVersion;
    const session = state.session;
    lastMalCheck = now();
    try {
      let imported = [],
        offset = 0;
      do {
        const page = await api("/api/list?offset=" + offset);
        imported.push(...page.data);
        if (!state.current && state.busy)
          update({
            discoveryStage: "Checking your MyAnimeList…",
            discoveryWork: `${imported.length} list entries checked`,
          });
        offset = page.nextOffset;
        if (imported.length >= 10000 && offset !== null) {
          notify("Loaded the first 10,000 MAL entries.");
          break;
        }
      } while (offset !== null);
      // Publish the complete snapshot only after every page succeeds. Unchanged
      // lists should not discard an already calculated recommendation queue.
      const canonical = (items) =>
        JSON.stringify([...items].sort((a, b) => a.id - b.id));
      if (
        session === state.session &&
        writeVersion === malWriteVersion &&
        canonical(imported) !== canonical(state.list)
      ) {
        update({
          list: imported,
        });
      }
    } finally {
      // Freshness is measured from completion, including failed attempts. A
      // paginated refresh lasting beyond the interval must not restart itself.
      lastMalCheck = now();
    }
  }

  async function checkMalFreshness() {
    if (malRefresh) return malRefresh;
    if (
      !state.session.connected ||
      now() - lastMalCheck < BACKGROUND_REFRESH_MS
    )
      return;
    malRefresh = readList()
      .catch((error) => {
        // Throttle failures too, retaining the last complete list for offline use.
        notify(
          "Couldn't refresh MyAnimeList. Using your last synced list for now. " +
            error.message,
        );
      })
      .finally(() => {
        malRefresh = null;
      });
    return malRefresh;
  }
  async function refreshMalIfStale() {
    // Background synchronization updates exclusions for future picks. A displayed
    // card is a snapshot: only explicit navigation/reactions may advance it.
    if (!state.ready || state.busy) return;
    await checkMalFreshness();
    if (state.settings.autoAdd && state.session.connected)
      await syncWatchlistToMal(false);
  }
  // Share verified public details across both feeds, with a bounded freshness window.
  function animeDetails(id) {
    if (detailRequests.has(id)) return detailRequests.get(id);
    const pending = fetchAnimeDetails(id).finally(() => {
      if (detailRequests.get(id) === pending) detailRequests.delete(id);
    });
    detailRequests.set(id, pending);
    return pending;
  }
  async function fetchAnimeDetails(id) {
    const generation = sessionGeneration;
    const cached = details.get(id);
    if (cached?.expires > Date.now()) return cached.anime;
    const anime = {
      ...(pool.find((a) => a.id === id) || {}),
      ...(await api("/api/anime/" + id)),
    };
    if (generation !== sessionGeneration) throw new Error("Session changed.");
    if (details.size >= 250) details.delete(details.keys().next().value);
    details.set(id, { anime, expires: Date.now() + 1800000 });
    writeCatalogCache(storage, [...details.values()]);
    // Keep prequels and ratings in the pool, not only in the detail cache.
    mergePool(anime);
    return anime;
  }
  let tasteCheckedAt = 0;
  async function refreshTasteMetadata(force = false) {
    const generation = sessionGeneration;
    if (state.preview || (!force && Date.now() - tasteCheckedAt < 300000))
      return;
    // Enrich both liked and disliked examples; broad MAL lists must not crowd out
    // explicit reactions or highly informative personal ratings.
    const records = [
      ...buildTaste(
        state.reactions,
        state.list,
        state.preferences,
        pool,
        false,
      ).records.values(),
    ].sort(
      (a, b) =>
        Math.max(Math.abs(b.enjoyment), Math.abs(b.interest)) -
          Math.max(Math.abs(a.enjoyment), Math.abs(a.interest)) ||
        a.anime.id - b.anime.id,
    );
    const groups = [
      records.filter((r) => r.enjoyment > 0.4),
      records.filter((r) => r.enjoyment < 0 || r.interest < 0),
      records.filter(
        (r) => r.enjoyment >= 0 && r.enjoyment <= 0.4 && r.interest >= 0,
      ),
    ];
    const history = [];
    for (
      let index = 0;
      history.length < 50 && groups.some((group) => group[index]);
      index++
    )
      for (const group of groups)
        if (group[index] && history.length < 50)
          history.push(group[index].anime);
    const all = [...history, ...pool];
    const ids = [...new Set(all.map((a) => a?.id).filter(Boolean))].slice(
      0,
      150,
    );
    if (!ids.length) return;
    tasteCheckedAt = Date.now();
    try {
      // Snapshot only: never wait for review fetches, poll, or repaint a loaded batch.
      const data = await api("/api/taste?ids=" + ids.join(","));
      if (generation !== sessionGeneration) return;
      diagnostics.record?.({
        operation: "taste_enrichment",
        ...data.enrichment,
        requested: ids.length,
        returnedProfiles: Object.keys(data.profiles || {}).length,
        returnedWithTraits: Object.values(data.profiles || {}).filter(
          (p) => p.traits?.length,
        ).length,
      });
      for (const a of all) {
        if (!a || !ids.includes(a.id)) continue;
        const enriched = {
          ...a,
          ...(pool.find((item) => item.id === a.id) || {}),
          reviewTaste: data.profiles?.[a.id] || a.reviewTaste,
          researchTaste: data.research
            ? data.research[a.id] || null
            : a.researchTaste,
          episodeTaste: data.episodes?.[a.id] || a.episodeTaste,
          communityTaste: data.community?.[a.id] || [],
        };
        mergePool(enriched);
        if (details.has(a.id))
          details.set(a.id, { ...details.get(a.id), anime: enriched });
      }
    } catch {
      /* Optional enrichment must never interrupt discovery. */
    }
  }
  function mergePool(anime) {
    const index = pool.findIndex((a) => a.id === anime.id);
    if (index < 0) pool.push(anime);
    else pool[index] = anime;
  }
  /** Add a bounded set of candidates beyond ranking pages, using only positive taste seeds. */
  async function expandFromTaste(seedLimit = 2, candidateLimit = 4) {
    const generation = sessionGeneration;
    if (state.preview) return;
    const known = new Set([
      ...state.list.map((a) => a.id),
      ...Object.keys(state.reactions).map(Number),
      ...state.preferences.favoriteAnime.map((a) => a.id),
    ]);
    const seeds = recommendationSeeds(
      state.reactions,
      state.list,
      state.preferences,
    )
      .filter((a) => (expandedSeeds.get(a.id) || 0) < Date.now() - 1800000)
      .slice(0, seedLimit);
    let added = 0;
    for (const seed of seeds) {
      if (generation !== sessionGeneration) return;
      try {
        const full = await animeDetails(seed.id);
        mergePool(full); // Enrich the training example as well as retrieving neighbors.
        expandedSeeds.set(seed.id, Date.now());
        for (const id of full.recommendations || []) {
          if (added >= candidateLimit) break;
          if (
            !Number.isSafeInteger(id) ||
            id < 1 ||
            id > 10000000 ||
            known.has(id) ||
            pool.some((a) => a.id === id)
          )
            continue;
          added++;
          try {
            mergePool(await animeDetails(id));
          } catch (error) {
            if ([401, 429, 502, 503, 504].includes(error.status)) throw error;
          }
        }
      } catch (error) {
        if ([401, 429, 502, 503, 504].includes(error.status)) throw error;
        // Missing/deleted seed metadata should not prevent ordinary discovery.
      }
    }
  }
  // Send public filters only, never account history or the selected favorite titles.
  function catalogPreferences() {
    const p = state.preferences;
    return {
      favoriteGenres: p.favoriteGenres,
      formats: p.formats,
      finishedOnly: p.finishedOnly,
      scoreMin: p.scoreMin,
      scoreMax: p.scoreMax,
      includeNsfw: p.includeNsfw,
      childrenTitles: p.childrenTitles,
    };
  }
  function refill() {
    if (refillPending) return refillPending;
    const pending = refillPage().finally(() => {
      if (refillPending === pending) refillPending = null;
    });
    refillPending = pending;
    return pending;
  }
  async function refillPage() {
    const generation = sessionGeneration;
    if (state.preview) return false;
    const filters = JSON.stringify(catalogPreferences());
    const includeNsfw = state.preferences.includeNsfw === true;
    // MAL pagination changes with this filter; restart cursors when switching modes.
    if (catalogNsfw !== includeNsfw || candidateFilterKey !== filters) {
      offsets = { popular: 0, top: 0, season: 0 };
      sourceIndex = 0;
      catalogNsfw = includeNsfw;
      candidateFilterKey = filters;
    }
    const sources =
      candidateProvider === "tenrai"
        ? ["popular", "top"]
        : ["popular", "top", "season"];
    for (let n = 0; n < sources.length; n++) {
      const source = sources[sourceIndex % sources.length];
      if (offsets[source] === null) {
        sourceIndex++;
        continue;
      }
      const offset = offsets[source];
      // Consume the public startup request once; a failed speculative read retries normally.
      const warm =
        candidateProvider === "tenrai" &&
        startupFilterKey === filters &&
        source === "popular" &&
        offset === 0
          ? startupCatalog
          : null;
      if (warm) startupCatalog = null;
      let page;
      try {
        page =
          (warm && (await warm)) ||
          (await api(
            `/api/catalog?source=${source}&offset=${offset}${candidateProvider === "tenrai" ? "&provider=tenrai&preferences=" + encodeURIComponent(filters) : includeNsfw ? "&nsfw=true" : ""}`,
          ));
      } catch (error) {
        if (generation !== sessionGeneration) return false;
        if (candidateProvider !== "tenrai") throw error;
        // Keep provider cursors separate: a Tenrai page is not a MAL offset.
        candidateProvider = "mal";
        offsets = { popular: 0, top: 0, season: 0 };
        sourceIndex = 0;
        startupCatalog = null;
        diagnostics.record?.({
          operation: "catalog_fallback",
          provider: "mal",
        });
        return refillPage();
      }
      if (generation !== sessionGeneration) return false;
      if (filters !== JSON.stringify(catalogPreferences())) return true;
      // Follow MAL pagination beyond the old 5,000-title cutoff. Reject a stuck
      // cursor instead of repeatedly downloading the same page.
      if (
        page.nextOffset != null &&
        (!Number.isSafeInteger(page.nextOffset) ||
          page.nextOffset <= offset ||
          page.nextOffset > 1000000)
      )
        throw new Error(
          "The anime catalog returned an invalid next page. Please try again later.",
        );
      offsets[source] = page.nextOffset ?? null;
      if (candidateProvider === "tenrai") offsets.season = null;
      sourceIndex++;
      const before = pool.length;
      const ids = new Set(pool.map((anime) => anime.id));
      for (const anime of page.data) {
        if (ids.has(anime.id)) continue;
        ids.add(anime.id);
        pool.push(anime);
      }
      diagnostics.record?.({
        operation: "catalog_page",
        source,
        provider: page.provider || candidateProvider,
        cacheHit: page.cacheHit === true,
        offset,
        returned: page.data.length,
        added: pool.length - before,
        nextOffset: offsets[source],
      });
      return true;
    }
    return false;
  }
  /** Fetch details before displaying a candidate so prerequisite filtering is accurate. */
  async function next() {
    const finishTiming = diagnostics.start("discovery_total");
    const search = {
      pagesLoaded: 0,
      detailChecks: 0,
      rejectedAfterDetails: 0,
      outcome: "searching",
    };
    lastDiscoverySearch = search;
    // Cached, verified picks can advance without ever entering the loading UI.
    if (
      pool.length &&
      (!state.session.connected || now() - lastMalCheck < BACKGROUND_REFRESH_MS)
    ) {
      const readyIds = new Set(
        [...details]
          .filter(([, e]) => e.expires > Date.now())
          .map(([id]) => id),
      );
      const pick = chooseNext(pool, { ...state, skipped, recent, readyIds });
      if (pick && (state.preview || readyIds.has(pick.anime.id))) {
        update({
          current: pick.anime,
          reason: pick.reason,
          detailReason: pick.detailReason,
          busy: false,
          discoveryLoading: false,
          discoveryProgress: null,
          error: "",
          discoveryStatus: "",
          canUndo: history.length > 0,
        });
        search.outcome = "cache_hit";
        diagnostics.record?.({
          operation: "discovery_search",
          ...search,
          poolSize: pool.length,
        });
        finishTiming();
        schedulePrefetch();
        return;
      }
    }
    update({
      busy: true,
      error: "",
      discoveryLoading: true,
      discoveryStage: state.session.connected
        ? "Checking your MyAnimeList…"
        : "Finding a match…",
      discoveryWork: "",
      discoveryStatus: "",
      discoveryProgress: null,
    });
    try {
      await yieldToBrowser();
      await checkMalFreshness();
      // Optional enrichment and neighbor expansion run after the card is visible.
      // A first card needs catalog metadata and verification, not a completed enrichment pass.
      // Page reads and detail checks have separate budgets. Filtered/duplicate
      // pages do not spend candidate checks. Keep a time bound for slow upstreams.
      const searchStarted = performance.now();
      let batch = [],
        batchTotal = 0,
        batchDone = 0;
      for (
        let attempt = 0;
        search.detailChecks < 100 && performance.now() - searchStarted < 30000;
        attempt++
      ) {
        if (attempt && attempt % 6 === 0) await yieldToBrowser();
        const finishRank = diagnostics.start("discovery_rank");
        const readyIds = new Set(
          pool
            .filter(
              (a) =>
                a.id !== state.current?.id &&
                details.get(a.id)?.expires > Date.now(),
            )
            .map((a) => a.id),
        );
        if (!batch.length) {
          const batchSkipped = new Set(skipped);
          batch = [];
          for (let n = 0; n < 6; n++) {
            const candidate = chooseNext(pool, {
              ...state,
              skipped: batchSkipped,
              recent,
              readyIds,
            });
            if (!candidate) break;
            batch.push(candidate);
            batchSkipped.add(candidate.anime.id);
          }
          batchTotal = batch.length;
          batchDone = 0;
        }
        const pick = batch.shift();
        finishRank();
        if (!pick) {
          update({
            discoveryStage: "Finding matching anime…",
            discoveryProgress: null,
            discoveryWork: `${search.pagesLoaded} ${search.pagesLoaded === 1 ? "page" : "pages"} searched · ${search.detailChecks} ${search.detailChecks === 1 ? "candidate" : "candidates"} checked`,
          });
          if (search.pagesLoaded < 30 && (await refill())) {
            search.pagesLoaded++;
            continue;
          }
          search.outcome =
            state.preview ||
            Object.values(offsets).every((offset) => offset === null)
              ? "sources_exhausted"
              : "search_paused";
          break;
        }
        const reportBatch = () =>
          update({
            discoveryStage: "Checking matches…",
            discoveryWork: `${batchDone} of ${batchTotal} candidates checked · current batch`,
            discoveryProgress: Math.round((100 * batchDone) / batchTotal),
          });
        reportBatch();
        let anime = pick.anime;
        if (!state.preview) {
          search.detailChecks++;
          try {
            anime = await animeDetails(anime.id);
            batchDone++;
            reportBatch();
          } catch (error) {
            if (error.status !== 404) throw error;
            batchDone++;
            reportBatch();
            skipped.add(anime.id); // Deleted MAL entries cannot be displayed.
            search.rejectedAfterDetails++;
            continue;
          }
          if (
            !isEligible(
              anime,
              state.reactions,
              state.list,
              skipped,
              false,
              state.preferences,
            )
          ) {
            // Updated pool metadata makes this ineligible until the user's
            // preferences/history change. This is not a permanent user skip.
            search.rejectedAfterDetails++;
            continue;
          }
        }
        search.outcome = "found";
        update({
          current: anime,
          detailReason: pick.detailReason,
          reason: state.preview
            ? pick.reason.replace("of 8", "of 7")
            : pick.reason,
        });
        schedulePrefetch();
        return;
      }
      if (search.outcome === "searching") search.outcome = "search_paused";
      update({
        current: null,
        discoveryStatus:
          search.outcome === "sources_exhausted" ? "exhausted" : "paused",
      });
    } catch (error) {
      search.outcome = "request_failed";
      // Never keep a reacted card visible as if it were a new recommendation.
      update({ current: null, error: error.message });
    } finally {
      diagnostics.record?.({
        operation: "discovery_search",
        ...search,
        poolSize: pool.length,
      });
      finishTiming();
      update({
        busy: false,
        canUndo: history.length > 0,
        discoveryLoading: false,
        discoveryProgress: null,
      });
    }
  }
  function schedulePrefetch() {
    if (state.preview || prefetchTimer || prefetchRunning) return;
    const generation = sessionGeneration;
    prefetchTimer = setTimeout(async () => {
      prefetchTimer = null;
      if (
        generation !== sessionGeneration ||
        state.recommendationsLoading ||
        state.busy
      )
        return;
      prefetchRunning = true;
      try {
        const candidates = rankRecommendations(
          pool.filter((a) => a.id !== state.current?.id),
          { ...state, limit: 3 },
        );
        for (const { anime } of candidates) {
          if (
            generation !== sessionGeneration ||
            state.busy ||
            state.recommendationsLoading
          )
            break;
          await animeDetails(anime.id);
        }
        if (
          generation === sessionGeneration &&
          !state.busy &&
          !state.recommendationsLoading
        ) {
          await refreshTasteMetadata();
          if (Object.keys(state.reactions).length >= 3)
            await expandFromTaste(1, 2);
        }
      } catch {
        /* Look-ahead is optional; a real selection can retry normally. */
      } finally {
        prefetchRunning = false;
      }
    }, 80);
    prefetchTimer.unref?.();
  }
  function recordHistory(entry) {
    history.push(entry);
    history = history.slice(-30);
    update(undoState());
  }
  /**
   * Four independent actions, not two combined ratings.
   * Good/Bad mean already seen. Only Would watch may write to MAL, and only
   * when the user's optional auto-add setting is enabled.
   */
  async function react(action, target = null) {
    const anime = target || state.current;
    if (!anime || !REACTIONS.includes(action)) return;
    if (state.busy) {
      notify(
        "Your choice has not been saved yet. Please wait for loading to finish, then choose again.",
      );
      return;
    }
    // A tab switch can happen before freshness checks complete. Never accept a
    // second vote for a title already selected or present on the connected list.
    if (state.reactions[anime.id] || state.list.some((a) => a.id === anime.id))
      return;
    if (
      target &&
      (state.reactions[target.id] ||
        state.list.some((a) => a.id === target.id) ||
        !state.recommendationPool.some((a) => a.id === target.id))
    )
      return;
    // This also guards keyboard commands and direct store calls.
    if (["good", "bad"].includes(action) && isUnreleased(anime)) {
      notify("This anime has not aired yet. Save it to watch later instead.");
      return;
    }
    update({
      busy: true,
      busyMessage:
        action === "watch" && state.settings.autoAdd && state.session.connected
          ? "Saving to your watchlist and MyAnimeList…"
          : "Saving your choice…",
    });
    const entry = {
      anime,
      before: state.reactions[anime.id],
      reason: state.reason,
      detailReason: state.detailReason,
      receipt: null,
      fromRecommendations: !!target,
    };
    update({
      reactions: {
        ...state.reactions,
        [anime.id]: { action, anime, at: Date.now() },
      },
    });
    if (!target) {
      const removed = state.recommendationPicks.find(
        (pick) => pick.anime.id === anime.id,
      );
      if (removed) {
        replacementSlots.push(removed.tier);
        update({
          recommendationPicks: state.recommendationPicks.filter(
            (pick) => pick.anime.id !== anime.id,
          ),
        });
        void replaceDecidedRecommendations();
      }
    }
    update({ lastReactionId: anime.id });
    entry.after = state.reactions[anime.id];
    await persist();
    try {
      if (
        action === "watch" &&
        state.settings.autoAdd &&
        state.session.connected &&
        !state.preview
      ) {
        const result = await addToMal(anime);
        entry.receipt = result.receipt;
        notify(
          result.added
            ? "Saved here and added to MAL Plan to Watch."
            : "Saved here. Your existing MAL status was kept.",
        );
      } else {
        notify(
          {
            good: "Liked. We’ll learn from that.",
            bad: "Got it. Fewer picks like this.",
            watch: "Saved to your watchlist.",
            nope: "Passed. We’ll learn from that.",
          }[action],
        );
      }
    } catch (error) {
      update({
        malSyncError:
          "Your site watchlist is saved, but MAL sync stopped. " +
          error.message,
      });
      notify("Saved to your site watchlist. " + error.message);
    }
    recordHistory(entry);
    recent = [...recent, anime].slice(-10);
    // Voting on a shortlist must not fetch another Discover card or rebuild it.
    if (target) update({ busy: false });
    else await next();
  }
  async function addToMal(anime) {
    const generation = sessionGeneration;
    const result = await api("/api/plan", { id: anime.id });
    if (generation !== sessionGeneration)
      throw new Error("Account changed during watchlist sync.");
    const existing = state.list.find((entry) => entry.id === anime.id);
    update({
      list: [
        ...state.list.filter((a) => a.id !== anime.id),
        {
          ...anime,
          ...existing,
          listStatus: {
            score: 0,
            ...existing?.listStatus,
            status: result.status || "plan_to_watch",
          },
        },
      ],
    });
    return result;
  }
  /** Only opt-in sends site saves to MAL. Each server write rechecks MAL status,
   * so a stale import can never turn a completed/dropped show back into a plan.
   * Stop on the first failure; a retry refreshes MAL before resuming missing titles.
   */
  function syncWatchlistToMal(refresh = true) {
    if (watchlistSyncPending) return watchlistSyncPending;
    const pending = runWatchlistSync(refresh).finally(() => {
      if (watchlistSyncPending === pending) watchlistSyncPending = null;
    });
    watchlistSyncPending = pending;
    return pending;
  }
  async function runWatchlistSync(refresh = true) {
    if (!state.session.connected || state.preview) return;
    const generation = sessionGeneration;
    update({ malSyncError: "" });
    try {
      if (refresh) await readList();
      if (generation !== sessionGeneration) return;
      const entries = missingMalPlans(state.reactions, state.list);
      let done = 0;
      update({ malSyncProgress: { done, total: entries.length } });
      for (const { anime } of entries) {
        if (generation !== sessionGeneration) return;
        // A save may have been removed while an earlier upload was pending.
        if (state.reactions[anime.id]?.action !== "watch") continue;
        await addToMal(anime);
        update({ malSyncProgress: { done: ++done, total: entries.length } });
      }
      if (done)
        notify(
          `Synced ${done} saved shows with MAL. Existing MAL statuses were kept.`,
        );
    } catch (error) {
      if (generation !== sessionGeneration) return;
      update({
        malSyncError:
          "Your site watchlist is saved, but MAL sync stopped. " +
          error.message,
      });
    } finally {
      if (generation === sessionGeneration) update({ malSyncProgress: null });
    }
  }
  /** Server receipts authorize Undo only for entries created by this session. */
  async function undo(id = null) {
    if (state.busy || !history.length) return;
    // React click events are not IDs. Targeted Undo never pops another row’s vote.
    const targeted = Number.isInteger(id);
    const index = targeted
      ? history.findLastIndex(
          (entry) =>
            !entry.skip &&
            entry.anime.id === id &&
            sameReaction(state.reactions[id], entry.after),
        )
      : history.length - 1;
    if (index < 0) return;
    const entry = history[index];
    if (
      !entry.skip &&
      !sameReaction(state.reactions[entry.anime.id], entry.after)
    ) {
      notify(
        "This reaction changed on another device. Refresh your account before undoing it.",
      );
      return;
    }
    update({ busy: true, busyMessage: "Undoing your choice…" });
    history.splice(index, 1);
    let message = entry.skip ? "Skip undone." : "Reaction undone.";
    if (entry.receipt) {
      try {
        await api("/api/plan/undo", { receipt: entry.receipt });
        update({ list: state.list.filter((a) => a.id !== entry.anime.id) });
        message = "Reaction and MAL addition undone.";
      } catch (error) {
        message = "Local reaction undone. " + error.message;
      }
    }
    const reactions = { ...state.reactions };
    if (entry.skip) skipped.delete(entry.anime.id);
    else if (entry.before) reactions[entry.anime.id] = entry.before;
    else delete reactions[entry.anime.id];
    recent = recent.filter((a) => a.id !== entry.anime.id);
    update({
      reactions,
      ...(!targeted && !entry.fromRecommendations
        ? {
            current: entry.anime,
            reason: entry.reason,
            detailReason: entry.detailReason,
          }
        : {}),
      error: "",
      busy: false,
      canUndo: history.length > 0,
    });
    update(undoState());
    persist();
    notify(message);
  }
  async function skip() {
    if (state.busy || !state.current) return;
    recordHistory({
      anime: state.current,
      reason: state.reason,
      detailReason: state.detailReason,
      skip: true,
    });
    skipped.add(state.current.id);
    recent = [...recent, state.current].slice(-10);
    await next();
  }
  /** Keep identity changes isolated: never copy guest reactions into a signed-in account. */
  async function adoptSession(session) {
    sessionGeneration++;
    candidateProvider = "tenrai";
    candidateFilterKey = "";
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
    refillPending = null;
    watchlistSyncPending = null;
    replacementSlots = [];
    preferenceVersion++;
    preferencesUnsynced = false;
    viewingPreferencesBefore = null;
    lastMalCheck = -Infinity;
    lastAccountCheck = -Infinity;
    cloudSync?.dispose();
    cloudSync = null;
    update({
      accountDataReady: false,
      syncError: "",
      malSyncError: "",
      malSyncProgress: null,
    });
    history = [];
    expandedSeeds.clear();
    details.clear();
    detailRequests.clear();
    tasteCheckedAt = 0;
    recent = [];
    skipped = new Set();
    offsets = { popular: 0, top: 0, season: 0 };
    sourceIndex = 0;
    update({
      session,
      profile: null,
      list: [],
      current: null,
      recommendationPicks: [],
      recommendationPool: [],
      recommendationsReady: false,
      recommendationsLoading: false,
      recommendationError: "",
      reactions: {},
      lastReactionId: null,
      canUndo: false,
      undoableIds: [],
      preview: !session.configured,
      busy: true,
    });
    pool = state.preview ? [...demo] : [];
    if (!state.preview)
      for (const entry of readCatalogCache(storage)) {
        details.set(entry.anime.id, entry);
        mergePool(entry.anime);
      }
    // Public catalog work can overlap account/list synchronization without exposing a pick early.
    const catalogWarmup =
      !state.preview && !pool.length && session.onboardingComplete
        ? refill().catch(() => false)
        : null;
    profileKey =
      session.account?.provider === "local"
        ? session.account.id
        : session.account?.provider === "mal"
          ? session.account.id.slice(4)
          : "guest";
    let listWarmup = null;
    if (session.connected) {
      update({
        discoveryStage: "Connecting to MyAnimeList…",
        discoveryWork: "",
      });
      try {
        const profile =
          session.account?.provider === "mal" &&
          /^mal:\d+$/.test(session.account.id)
            ? {
                id: Number(session.account.id.slice(4)),
                name: session.account.name,
              }
            : await api("/api/profile");
        if (!session.account) profileKey = String(profile.id);
        update({ profile });
        // Account state and the MAL list are independent reads. Keep both off
        // each other’s critical path, but complete both before choosing a card.
        listWarmup = readList().catch((error) => {
          update({ session: { ...session, connected: false }, list: [] });
          notify(error.message);
        });
      } catch (error) {
        update({ session: { ...session, connected: false }, list: [] });
        notify(error.message);
      }
    }
    await loadLocal();
    if (session.account)
      update({
        preferences: normalizePreferences(session.preferences),
        onboardingComplete: session.onboardingComplete === true,
      });
    if (session.cloudSync && session.account) {
      cloudSync = createCloudSync({
        api,
        storage,
        key: "anime-shuffle:" + profileKey + ":pending-sync",
        onRemote(remote) {
          const preferences = preferencesUnsynced
            ? state.preferences
            : normalizePreferences(remote.preferences);
          const reactionsChanged = !sameData(state.reactions, remote.reactions);
          const preferencesChanged = !sameData(state.preferences, preferences);
          update({
            reactions: reactionsChanged ? remote.reactions : state.reactions,
            settings: sameData(state.settings, remote.settings)
              ? state.settings
              : remote.settings,
            preferences: preferencesChanged ? preferences : state.preferences,
            onboardingComplete: remote.onboardingComplete,
          });
          update(undoState());
          persist(false);
        },
        onStatus(syncError) {
          update({ syncError });
        },
      });
      try {
        update({
          discoveryStage: "Syncing your saved choices…",
          discoveryWork: "",
        });
        await cloudSync.initialize();
      } catch (error) {
        update({ syncError: "Account sync is unavailable. " + error.message });
      }
    }
    if (listWarmup) await listWarmup;
    // Counts become visible only after local, account and MAL data are combined.
    update({ accountDataReady: true });
    if (catalogWarmup) {
      update({
        discoveryStage: "Loading the anime catalog…",
        discoveryWork: "",
      });
      await catalogWarmup;
    }
    // Onboarding precedes discovery, including for authenticated first-time visitors.
    if (state.onboardingComplete) await next();
    else update({ busy: false });
    // Saved watchlist uploads do not have to finish before a verified discovery card appears.
    if (state.settings.autoAdd && state.session.connected)
      void syncWatchlistToMal(false);
  }
  /** Idempotent initialization also handles React StrictMode's repeated effects. */
  function initialize() {
    if (initialization) return initialization;
    // This is public metadata only. Overlap a cold catalog read with session
    // lookup; never use it until account exclusions and preferences are loaded.
    if (!staticMode && !readCatalogCache(storage).length) {
      startupFilterKey = JSON.stringify(catalogPreferences());
      startupCatalog = api(
        "/api/catalog?source=popular&offset=0&provider=tenrai&preferences=" +
          encodeURIComponent(startupFilterKey),
      ).catch(() => null);
    }
    initialization = (async () => {
      try {
        await adoptSession(
          staticMode
            ? {
                configured: false,
                connected: false,
                oauthConfigured: false,
                staticMode: true,
              }
            : await api("/api/session"),
        );
      } catch (error) {
        update({ error: error.message, busy: false });
      } finally {
        update({ ready: true });
      }
    })();
    return initialization;
  }
  /** Fetch verified details for a bounded shortlist, never render unverified MAL list stubs. */
  async function loadRecommendations({ force = false } = {}) {
    if (
      !recommendationsUnlocked(state.reactions) ||
      state.recommendationsLoading ||
      replacementRunning ||
      !state.onboardingComplete
    )
      return;
    if (
      !force &&
      (state.recommendationsReady || state.recommendationPicks.length)
    )
      return;
    const generation = sessionGeneration;
    replacementSlots = [];
    const finishTiming = diagnostics.start("recommendations_total");
    update({
      recommendationError: "",
      recommendationsLoading: true,
      recommendationProgress: null,
    });
    try {
      await yieldToBrowser();
      await checkMalFreshness();
      const taste = buildRecommendationTaste();
      if (!taste) {
        update({
          recommendationPicks: [],
          recommendationPool: [],
          recommendationsReady: true,
        });
        return;
      }
      await expandFromTaste();
      if (!state.preview)
        for (let n = 0; n < 3; n++) {
          if (eligibleCandidates(pool, state).length >= 75 || !(await refill()))
            break;
        }
      await refreshTasteMetadata(true);
      if (generation !== sessionGeneration) return;
      const candidates = new Map(pool.map((a) => [a.id, a]));
      for (const a of state.list)
        if (a.listStatus?.status === "plan_to_watch") candidates.set(a.id, a);
      for (const r of Object.values(state.reactions))
        if (r.action === "watch") candidates.set(r.anime.id, r.anime);
      const finishRank = diagnostics.start("recommendations_rank");
      const ranked = rankRecommendations([...candidates.values()], {
        ...state,
        limit: 75,
      });
      finishRank();
      const verified = [];
      let failures = 0;
      let checked = 0;
      let eligibleCount = 0;
      update({ recommendationProgress: 0 });
      // Three concurrent detail reads shorten the network wait without flooding MAL.
      // Settle a whole batch before continuing; retain ranking order regardless of
      // response order, and never leave requests running after releasing busy.
      let batchSize = 3;
      for (
        let offset = 0;
        offset < ranked.length &&
        eligibleCandidates(verified, state).length < 25;
        offset += batchSize
      ) {
        eligibleCount = eligibleCandidates(verified, state).length;
        batchSize = Math.min(3, 25 - eligibleCount);
        const batch = ranked.slice(offset, offset + batchSize);
        const results = await Promise.allSettled(
          batch.map(({ anime }) =>
            state.preview ? Promise.resolve(anime) : animeDetails(anime.id),
          ),
        );
        if (generation !== sessionGeneration) return;
        for (const result of results) {
          if (result.status === "fulfilled") {
            const full = result.value;
            mergePool(full);
            verified.push(full);
            if (
              isEligible(
                full,
                state.reactions,
                state.list,
                new Set(),
                false,
                state.preferences,
              )
            )
              eligibleCount++;
          } else {
            failures++;
            if ([401, 429, 502, 503, 504].includes(result.reason.status))
              throw result.reason;
          }
          checked++;
        }
        eligibleCount = eligibleCandidates(verified, state).length;
        update({
          recommendationProgress: Math.floor((checked / ranked.length) * 100),
        });
        await yieldToBrowser();
      }
      if (generation !== sessionGeneration) return;
      update({
        recommendationPicks: rankRecommendations(verified, {
          ...state,
          metadata: pool,
        }),
        recommendationPreferences: state.preferences,
        recommendationPool: verified,
        recommendationsReady: true,
        recommendationError: failures
          ? "Some anime details could not be checked. Try refreshing your picks."
          : "",
      });
    } catch (error) {
      if (generation !== sessionGeneration) return;
      update({
        recommendationError: error.message,
        recommendationsReady: true,
      });
    } finally {
      finishTiming();
      if (generation !== sessionGeneration) return;
      update({
        recommendationsLoading: false,
        recommendationProgress: null,
      });
      replacementSlots = [];
    }
  }
  async function replaceDecidedRecommendations() {
    if (
      replacementRunning ||
      state.recommendationsLoading ||
      !replacementSlots.length
    )
      return;
    const generation = sessionGeneration;
    replacementRunning = true;
    const attempted = new Set();
    try {
      let checked = 0;
      let filled = false;
      while (
        replacementSlots.length &&
        checked < 30 &&
        generation === sessionGeneration
      ) {
        const used = new Set(state.recommendationPicks.map((p) => p.anime.id));
        const candidates = rankRecommendations(
          pool.filter((a) => !used.has(a.id) && !attempted.has(a.id)),
          { ...state, limit: 1 },
        );
        if (!candidates.length) {
          if (!filled && !state.preview) {
            filled = true;
            if (await refill()) continue;
          }
          break;
        }
        const candidate = candidates[0];
        attempted.add(candidate.anime.id);
        checked++;
        const anime = state.preview
          ? candidate.anime
          : await animeDetails(candidate.anime.id);
        if (generation !== sessionGeneration) return;
        if (
          !isEligible(
            anime,
            state.reactions,
            state.list,
            new Set(),
            false,
            state.preferences,
          )
        )
          continue;
        const pick = rankRecommendations([anime], {
          ...state,
          metadata: pool,
        })[0];
        if (!pick) continue;
        const tier = replacementSlots.shift();
        update({
          recommendationPool: [
            ...state.recommendationPool.filter((a) => a.id !== anime.id),
            anime,
          ],
          recommendationPicks: [
            ...state.recommendationPicks,
            {
              ...pick,
              tier,
              detailReason: detailedExplanation(
                anime,
                buildTaste(
                  state.reactions,
                  state.list,
                  state.preferences,
                  pool,
                ),
                { mode: "recommendations" },
              ),
            },
          ].sort((a, b) => a.tier - b.tier),
        });
        await yieldToBrowser();
      }
    } catch (error) {
      if (generation === sessionGeneration)
        update({
          recommendationError:
            "A replacement could not be loaded. Refresh picks to try again.",
        });
    } finally {
      replacementRunning = false;
    }
  }
  function buildRecommendationTaste() {
    return (
      state.preferences.favoriteGenres.length > 0 ||
      state.preferences.favoriteAnime.length > 0 ||
      Object.keys(state.reactions).length > 0 ||
      state.list.some((a) => preferenceWeight(a) !== 0)
    );
  }
  return {
    async syncAccount({ background = false } = {}) {
      if (accountRefresh) return accountRefresh;
      if (!cloudSync || state.busy) return;
      if (background && now() - lastAccountCheck < BACKGROUND_REFRESH_MS)
        return;
      if (!background) update({ busy: true });
      accountRefresh = (async () => {
        try {
          await cloudSync.refresh();
          update({ syncError: "" });
          if (!background && state.current && state.reactions[state.current.id])
            await next();
        } catch (error) {
          update({
            syncError: "Account sync is unavailable. " + error.message,
          });
        } finally {
          lastAccountCheck = now();
          accountRefresh = null;
          if (!background) update({ busy: false });
        }
      })();
      return accountRefresh;
    },
    refreshMalIfStale,
    loadRecommendations,
    async inspectPersistence() {
      const key = "anime-shuffle:" + profileKey;
      let localCount = null,
        backupCount = null;
      try {
        localCount = Object.keys(
          JSON.parse(storage.getItem(key) || "{}").reactions || {},
        ).length;
      } catch {}
      try {
        backupCount = Object.keys(
          (await browserBackup?.read(key))?.reactions || {},
        ).length;
      } catch {}
      return {
        mode: state.session.account ? "account" : "guest",
        currentReactions: Object.keys(state.reactions).length,
        localStorageReactions: localCount,
        indexedDBReactions: browserBackup ? backupCount : null,
        storageError: state.storageError,
        syncError: state.syncError,
      };
    },
    inspectDiscovery() {
      return {
        lastSearch: lastDiscoverySearch ? { ...lastDiscoverySearch } : null,
        poolSize: pool.length,
        sources: { ...offsets },
        hasMorePages:
          !state.preview &&
          Object.values(offsets).some((offset) => offset !== null),
      };
    },
    async inspectEnrichment() {
      const server = state.preview
        ? { enabled: false, preview: true }
        : (await api("/api/taste")).enrichment;
      const taste = buildTaste(
        state.reactions,
        state.list,
        state.preferences,
        pool,
      );
      const candidates = [
        ...new Map(
          [state.current, ...state.recommendationPicks.map((p) => p.anime)]
            .filter(Boolean)
            .map((a) => [a.id, a]),
        ).values(),
      ];
      const items = candidates.map((a) => {
        const groups = taste.model.explain(a).groups;
        return {
          animeId: a.id,
          reviewTraits: a.reviewTaste?.traits?.length || 0,
          nuancedTraits: nuancedTraits(a).size,
          currentNuanceContribution: groups.nuance || 0,
          currentNuanceContextContribution: groups.nuanceblend || 0,
          episodeCoverage: a.episodeTaste?.complete
            ? "complete"
            : a.episodeTaste
              ? "partial"
              : "unknown",
          currentReviewContribution: groups.review || 0,
          currentReviewContextContribution: groups.reviewblend || 0,
          currentCommunityContribution: groups.community || 0,
        };
      });
      return {
        server,
        note: "Contributions use your current choices. Loaded shortlists stay fixed until Refresh picks.",
        historyWithNuancedTraits: [...taste.records.values()].filter(
          (r) => nuancedTraits(r.anime).size,
        ).length,
        historyWithReviewTraits: [...taste.records.values()].filter(
          (r) => r.anime.reviewTaste?.traits?.length,
        ).length,
        items,
      };
    },
    async searchAnime(query) {
      const term = query.trim();
      if (term.length < 2) return [];
      if (state.preview)
        return demo.filter((a) => matchesTitle(a, term)).slice(0, 8);
      return (await api("/api/search?q=" + encodeURIComponent(term))).data;
    },
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    async authenticate(mode, username, password) {
      if (state.busy) throw new Error("Please wait for the current request.");
      if (!["register", "login"].includes(mode))
        throw new Error("Invalid account action.");
      update({ busy: true });
      try {
        const session = await api(`/api/account/${mode}`, {
          username,
          password,
        });
        await adoptSession(session);
        return state.onboardingComplete;
      } finally {
        update({ busy: false });
      }
    },
    announceRecommendationsUnlock() {
      if (
        !recommendationsUnlocked(state.reactions) ||
        state.settings.recommendationsNotified
      )
        return;
      update({
        settings: { ...state.settings, recommendationsNotified: true },
      });
      void persist();
    },
    visitRecommendations() {
      if (
        !recommendationsUnlocked(state.reactions) ||
        state.settings.recommendationsVisited
      )
        return;
      update({
        settings: {
          ...state.settings,
          recommendationsVisited: true,
          recommendationsNotified: true,
        },
      });
      void persist();
    },
    async finishViewingPreferences() {
      if (state.busy || !viewingPreferencesBefore) return;
      const before = viewingPreferencesBefore;
      viewingPreferencesBefore = null;
      if (sameData(before, state.preferences)) return;
      const eligible = (preferences) =>
        isEligible(
          state.current,
          state.reactions,
          state.list,
          new Set(),
          false,
          preferences,
        );
      // Close first; only replace a card made ineligible by these edits.
      if (!state.current || (eligible(before) && !eligible(state.preferences)))
        await next();
    },
    async saveViewingPreferences(input) {
      const preferences = normalizePreferences(input);
      const version = ++preferenceVersion;
      const accountId = state.session.account?.id;
      preferencesUnsynced = true;
      // Keep the loaded card and shortlist intact while the preferences dialog is open.
      viewingPreferencesBefore ??= state.preferences;
      update({ preferences });
      skipped.clear();
      const localSave = persist(false);
      const write = preferenceWrites
        .catch(() => {})
        .then(async () => {
          if (state.session.account?.id !== accountId)
            throw new Error("Your account changed. Please reopen preferences.");
          if (accountId) await api("/api/account/preferences", { preferences });
          const stored = await localSave;
          if (!stored && !accountId)
            throw new Error(
              "Your preferences could not be saved in this browser. Please retry.",
            );
          if (version === preferenceVersion) preferencesUnsynced = false;
        });
      preferenceWrites = write;
      return write;
    },
    async savePreferences(input, settings = {}) {
      if (state.busy) throw new Error("Please wait for the current request.");
      const preferences = normalizePreferences(input);
      update({ busy: true });
      try {
        if (state.session.account)
          await api("/api/account/preferences", { preferences });
        update({
          settings:
            typeof settings.autoAdd === "boolean" && state.session.connected
              ? { ...state.settings, autoAdd: settings.autoAdd }
              : state.settings,
          preferences,
          onboardingComplete: true,
        });
        history = history.filter((entry) => entry.fromRecommendations);
        update(undoState());
        skipped.clear();
        const stored = await persist();
        if (!stored && !state.session.account)
          throw new Error(
            "Your preferences could not be saved in this browser. Please retry.",
          );
        await cloudSync?.flush();
        // Filter edits do not change watchlist entries; only onboarding opt-in needs a sync.
        if (settings.autoAdd === true) await syncWatchlistToMal();
        await next();
      } finally {
        update({ busy: false });
      }
    },
    // A loaded card stays fixed unless the user has since decided that title.
    // Checking on entry avoids fetching Discover while using another page.
    async ensureUndecidedDiscovery() {
      if (state.busy || !state.current || !state.reactions[state.current.id])
        return;
      await next();
    },
    react,
    dismissReactionReason() {
      update({ lastReactionId: null });
    },
    async setReactionReason(id, input) {
      const reason = normalizeReactionReason(input),
        before = state.reactions[id];
      if (!before || !reason) return;
      const after = { ...before, reason };
      update({
        reactions: { ...state.reactions, [id]: after },
        lastReactionId: null,
      });
      // Keep Undo valid after adding feedback to the same decision.
      for (const entry of history)
        if (entry.anime.id === id && sameReaction(entry.after, before))
          entry.after = after;
      await persist();
      notify("Thanks—your next picks will take that into account.");
    },
    undo,
    skip,
    notify,
    retryBrowserSave: () => persist(false),
    dismissMessage: () => update({ message: "" }),
    retry: () => !state.busy && next(),
    revisit: () => {
      if (!state.busy) {
        skipped.clear();
        return next();
      }
    },
    async setAutoAdd(enabled) {
      if (state.busy || !state.session.connected) return;
      update({
        busy: true,
        settings: { ...state.settings, autoAdd: enabled },
        malSyncError: "",
      });
      persist();
      try {
        await cloudSync?.flush();
        if (enabled) await syncWatchlistToMal();
      } catch (error) {
        update({
          malSyncError:
            "The MAL auto-add setting has not synced. " + error.message,
        });
      } finally {
        update({ busy: false });
      }
    },
    async syncSavedToMal() {
      if (state.busy || !state.session.connected) return;
      update({ busy: true });
      try {
        await syncWatchlistToMal();
      } finally {
        update({ busy: false });
      }
    },
    setSettings(patch) {
      update({ settings: { ...state.settings, ...patch } });
      persist();
    },
    async importWatchlist(text) {
      if (state.busy)
        throw new Error("Please wait for the current action to finish.");
      const entries = newWatchlistEntries(
        parseWatchlistImport(text),
        state.reactions,
        state.list,
      );
      update({ busy: true });
      try {
        if (
          text
            .replace(/^\uFEFF/, "")
            .trimStart()
            .startsWith("Anime Shuffle — ")
        ) {
          // Text exports omit cover art and detailed metadata. Reuse known titles,
          // then fetch missing details with bounded concurrency; failed lookups
          // still preserve the user's exported title rather than losing the save.
          let cursor = 0,
            completed = 0;
          const known = new Map(
            [...pool, ...state.list].map((anime) => [anime.id, anime]),
          );
          const worker = async () => {
            while (cursor < entries.length) {
              const entry = entries[cursor++];
              let anime = known.get(entry.anime.id);
              if (!anime && !state.preview) {
                try {
                  anime = await animeDetails(entry.anime.id);
                } catch {
                  /* Keep the validated text entry when MAL is unavailable. */
                }
              }
              if (anime) entry.anime = anime;
              notify(`Importing watchlist (${++completed}/${entries.length})…`);
            }
          };
          await Promise.all([worker(), worker()]);
        }
        const reactions = { ...state.reactions };
        for (const { anime, addedAt } of entries)
          reactions[anime.id] = { action: "watch", anime, at: addedAt };
        // Imported saves follow the same explicit MAL auto-add choice as other watchlist additions.
        update({ reactions });
        update(undoState());
        persist();
        if (state.settings.autoAdd && state.session.connected) {
          update({ busy: true });
          await syncWatchlistToMal();
        }
        await next();
        return entries.length;
      } finally {
        update({ busy: false });
      }
    },
    async removeSaved(id, confirmed = false) {
      if (state.busy) return { removed: false };
      update({ busy: true });
      try {
        // Finish any earlier upload before removing, so it cannot recreate the plan.
        if (watchlistSyncPending) await watchlistSyncPending;
        // Check connected accounts even for site-only saves: MAL may have changed
        // since the last automatic refresh. No local removal precedes MAL success.
        if (state.session.connected) {
          const result = await api("/api/plan/remove", { id, confirmed });
          if (result.confirmationRequired) return result;
        }
        const reactions = { ...state.reactions };
        delete reactions[id];
        history = history.filter((entry) => entry.anime.id !== id);
        update({
          reactions,
          list: state.list.filter((a) => a.id !== id),
          canUndo: history.length > 0,
          undoableIds: [],
        });
        update(undoState());
        persist();
        await cloudSync?.flush();
        notify("Removed from your watchlist.");
        return { removed: true };
      } catch (error) {
        notify(error.message);
        return { removed: false };
      } finally {
        update({ busy: false });
      }
    },
    async saveToMal(anime) {
      if (state.busy) return;
      update({ busy: true });
      try {
        const result = await addToMal(anime);
        notify(
          result.added
            ? "Added to MAL Plan to Watch."
            : "Existing MAL status kept.",
        );
      } catch (error) {
        notify(error.message);
      } finally {
        update({ busy: false });
      }
    },
    async refreshList() {
      if (state.busy) return;
      update({ busy: true });
      try {
        await readList();
        if (state.settings.autoAdd) await syncWatchlistToMal(false);
        if (
          state.current &&
          state.list.some((anime) => anime.id === state.current.id)
        )
          await next();
        notify(
          "MAL list refreshed. Your watchlist is up to date. Refresh picks when you want a new shortlist.",
        );
      } catch (error) {
        notify(error.message);
      } finally {
        update({ busy: false });
      }
    },
    async disconnect(malOnly = false) {
      try {
        await cloudSync?.flush();
        await api(malOnly ? "/api/mal/disconnect" : "/api/logout", {});
        return true;
      } catch (error) {
        notify(error.message);
        return false;
      }
    },
    clearLocal() {
      if (state.busy) return;
      history = [];
      skipped.clear();
      recent = [];
      update({
        reactions: {},
        lastReactionId: null,
        canUndo: false,
        undoableIds: [],
      });
      persist();
      return next();
    },
  };
}
