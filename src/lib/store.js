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
  storage = localStorage,
  staticMode = false,
  now = Date.now,
  diagnostics = createDiagnostics({ storage }),
} = {}) {
  let state = {
    session: {},
    profile: null,
    list: [],
    reactions: {},
    current: null,
    reason: "",
    detailReason: "",
    busy: true,
    ready: false,
    discoveryLoading: false,
    discoveryProgress: null,
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
    state = { ...state, ...patch };
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
          // A hung read must release the loading UI. Server requests have their own deadline.
          ...(read
            ? {
                signal: AbortSignal.timeout(
                  url.startsWith("/api/taste?") ? 2500 : 45000,
                ),
              }
            : {}),
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
  function persist(sync = true) {
    try {
      storage.setItem(
        "anime-shuffle:" + profileKey,
        JSON.stringify({
          reactions: state.reactions,
          settings: state.settings,
          preferences: state.preferences,
          onboardingComplete: state.onboardingComplete,
        }),
      );
    } catch {
      notify("Browser storage is full. Your latest changes may not be saved.");
    }
    if (sync) cloudSync?.queue(state);
  }
  function loadLocal() {
    let stored = {};
    try {
      stored =
        JSON.parse(storage.getItem("anime-shuffle:" + profileKey) || "{}") ||
        {};
    } catch {}
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
  async function refreshMalIfStale({ refreshDiscovery = true } = {}) {
    // Read-only polling does not lock reaction buttons. Overlapping triggers
    // share a request; readList rejects snapshots overtaken by a MAL write.
    if (!state.ready || state.busy) return;
    await checkMalFreshness();
    if (
      (typeof refreshDiscovery === "function"
        ? refreshDiscovery()
        : refreshDiscovery) &&
      !state.busy &&
      state.current &&
      (state.reactions[state.current.id] ||
        state.list.some((anime) => anime.id === state.current.id))
    )
      await next();
  }
  // Share verified public details across both feeds, with a bounded freshness window.
  async function animeDetails(id) {
    const cached = details.get(id);
    if (cached?.expires > Date.now()) return cached.anime;
    const anime = {
      ...(pool.find((a) => a.id === id) || {}),
      ...(await api("/api/anime/" + id)),
    };
    if (details.size >= 250) details.delete(details.keys().next().value);
    details.set(id, { anime, expires: Date.now() + 1800000 });
    return anime;
  }
  let tasteCheckedAt = 0;
  async function refreshTasteMetadata(force = false) {
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
      for (const a of all) {
        if (!a || !ids.includes(a.id)) continue;
        const enriched = {
          ...a,
          ...(pool.find((item) => item.id === a.id) || {}),
          reviewTaste: data.profiles?.[a.id],
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
  async function refill() {
    if (state.preview) return false;
    const sources = ["popular", "top", "season"];
    for (let n = 0; n < sources.length; n++) {
      const source = sources[sourceIndex++ % sources.length];
      if (offsets[source] === null) continue;
      const page = await api(
        `/api/catalog?source=${source}&offset=${offsets[source]}`,
      );
      offsets[source] = page.nextOffset > 5000 ? null : page.nextOffset;
      const ids = new Set(pool.map((anime) => anime.id));
      pool.push(...page.data.filter((anime) => !ids.has(anime.id)));
      return true;
    }
    return false;
  }
  /** Fetch details before displaying a candidate so prerequisite filtering is accurate. */
  async function next() {
    const finishTiming = diagnostics.start("discovery_total");
    update({
      busy: true,
      error: "",
      discoveryLoading: true,
      discoveryProgress: null,
    });
    try {
      await yieldToBrowser();
      await checkMalFreshness();
      // Keep the first card fast; expand from explicit feedback on subsequent discoveries.
      if (state.current && Object.keys(state.reactions).length >= 3)
        await expandFromTaste(1, 2);
      await refreshTasteMetadata();
      let pagesLoaded = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (attempt && attempt % 6 === 0) await yieldToBrowser();
        const finishRank = diagnostics.start("discovery_rank");
        const pick = chooseNext(pool, {
          reactions: state.reactions,
          list: state.list,
          skipped,
          recent,
          preferences: state.preferences,
        });
        finishRank();
        if (!pick) {
          if (pagesLoaded < 3 && (await refill())) {
            pagesLoaded++;
            continue;
          }
          update({ current: null });
          return;
        }
        // The candidate is selected; verifying its details is the remaining step.
        update({ discoveryProgress: 50 });
        let anime = pick.anime;
        if (!state.preview) {
          anime = await animeDetails(anime.id);
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
            skipped.add(anime.id);
            update({ discoveryProgress: null });
            continue;
          }
        }
        update({
          current: anime,
          detailReason: pick.detailReason,
          reason: state.preview
            ? pick.reason.replace("of 8", "of 7")
            : pick.reason,
        });
        return;
      }
      update({
        current: null,
        error: "Many titles were filtered. Choose Find more anime to continue.",
      });
    } catch (error) {
      // Never keep a reacted card visible as if it were a new recommendation.
      update({ current: null, error: error.message });
    } finally {
      finishTiming();
      update({
        busy: false,
        canUndo: history.length > 0,
        discoveryLoading: false,
        discoveryProgress: null,
      });
    }
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
    if (state.busy || !anime || !REACTIONS.includes(action)) return;
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
    update({ busy: true });
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
    entry.after = state.reactions[anime.id];
    persist();
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
    const result = await api("/api/plan", { id: anime.id });
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
  async function syncWatchlistToMal(refresh = true) {
    if (!state.session.connected || state.preview) return;
    update({ malSyncError: "" });
    try {
      if (refresh) await readList();
      const entries = missingMalPlans(state.reactions, state.list);
      let done = 0;
      update({ malSyncProgress: { done, total: entries.length } });
      for (const { anime } of entries) {
        await addToMal(anime);
        update({ malSyncProgress: { done: ++done, total: entries.length } });
      }
      if (done)
        notify(
          `Synced ${done} saved shows with MAL. Existing MAL statuses were kept.`,
        );
    } catch (error) {
      update({
        malSyncError:
          "Your site watchlist is saved, but MAL sync stopped. " +
          error.message,
      });
    } finally {
      update({ malSyncProgress: null });
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
    update({ busy: true });
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
    lastMalCheck = -Infinity;
    lastAccountCheck = -Infinity;
    cloudSync?.dispose();
    cloudSync = null;
    update({ syncError: "", malSyncError: "", malSyncProgress: null });
    history = [];
    expandedSeeds.clear();
    details.clear();
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
      recommendationError: "",
      reactions: {},
      canUndo: false,
      undoableIds: [],
      preview: !session.configured,
      busy: true,
    });
    profileKey =
      session.account?.provider === "local"
        ? session.account.id
        : session.account?.provider === "mal"
          ? session.account.id.slice(4)
          : "guest";
    if (session.connected) {
      try {
        const profile = await api("/api/profile");
        if (!session.account) profileKey = String(profile.id);
        update({ profile });
        await readList();
      } catch (error) {
        update({ session: { ...session, connected: false }, list: [] });
        notify(error.message);
      }
    }
    loadLocal();
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
          const preferences = normalizePreferences(remote.preferences);
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
        await cloudSync.initialize();
      } catch (error) {
        update({ syncError: "Account sync is unavailable. " + error.message });
      }
    }
    if (state.settings.autoAdd && state.session.connected)
      await syncWatchlistToMal(false);
    pool = state.preview ? [...demo] : [];
    // Onboarding precedes discovery, including for authenticated first-time visitors.
    if (state.onboardingComplete) await next();
    else update({ busy: false });
  }
  /** Idempotent initialization also handles React StrictMode's repeated effects. */
  function initialize() {
    if (initialization) return initialization;
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
    if (state.busy || !state.onboardingComplete) return;
    if (
      !force &&
      (state.recommendationsReady || state.recommendationPicks.length)
    )
      return;
    const finishTiming = diagnostics.start("recommendations_total");
    update({
      busy: true,
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
          if (
            rankRecommendations(pool, { ...state, limit: 75 }).length >= 75 ||
            !(await refill())
          )
            break;
        }
      await refreshTasteMetadata(true);
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
      for (const { anime } of ranked) {
        try {
          const full = state.preview ? anime : await animeDetails(anime.id);
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
        } catch (error) {
          failures++;
          if ([401, 429, 502, 503, 504].includes(error.status)) throw error;
        }
        // Count settled detail checks, including failures. Publish the batch only at the end.
        checked++;
        update({
          recommendationProgress: Math.floor((checked / ranked.length) * 100),
        });
        if (eligibleCount >= 25) break;
        if (checked % 6 === 0) await yieldToBrowser();
      }
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
      update({
        recommendationError: error.message,
        recommendationsReady: true,
      });
    } finally {
      finishTiming();
      update({
        busy: false,
        recommendationsLoading: false,
        recommendationProgress: null,
      });
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
        persist();
        await cloudSync?.flush();
        if (state.settings.autoAdd) await syncWatchlistToMal();
        await next();
      } finally {
        update({ busy: false });
      }
    },
    react,
    undo,
    skip,
    notify,
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
      update({ reactions: {}, canUndo: false, undoableIds: [] });
      persist();
      return next();
    },
  };
}
