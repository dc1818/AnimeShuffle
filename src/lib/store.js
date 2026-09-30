import { demo } from "./demo.js";
import { chooseNext, isEligible, REACTIONS } from "./recommend.js";

/**
 * Application state and asynchronous commands, independent of the DOM.
 * React subscribes through useSyncExternalStore. Keeping API orchestration here
 * makes reaction/Undo behavior testable without rendering a browser page.
 * Only local reactions/settings are persisted; imported MAL data stays in memory.
 */
export function createAnimeStore({
  request = fetch,
  storage = localStorage,
} = {}) {
  let state = {
    session: {},
    profile: null,
    list: [],
    reactions: {},
    current: null,
    reason: "",
    busy: true,
    ready: false,
    preview: true,
    canUndo: false,
    settings: { autoAdd: false, dynamic: true },
    message: "",
    error: "",
  };
  let profileKey = "guest";
  let pool = [],
    history = [],
    recent = [],
    skipped = new Set();
  let offsets = { popular: 0, top: 0, season: 0 },
    sourceIndex = 0;
  let initialization;
  const details = new Map(),
    listeners = new Set();

  // Every published snapshot has a new identity, as React's subscription API requires.
  function update(patch) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  const notify = (message) => update({ message });
  async function api(url, data) {
    const response = await request(url, {
      method: data === undefined ? "GET" : "POST",
      headers:
        data === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-CSRF-Token": state.session.csrf,
            },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }
  function persist() {
    try {
      storage.setItem(
        "anime-shuffle:" + profileKey,
        JSON.stringify({
          reactions: state.reactions,
          settings: state.settings,
        }),
      );
    } catch {
      notify("Browser storage is full. Your latest changes may not be saved.");
    }
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
      settings: {
        autoAdd: false,
        dynamic: true,
        ...stored.settings,
      },
    });
  }
  async function readList() {
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
    update({ list: imported });
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
    update({ busy: true, error: "" });
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        const pick = chooseNext(pool, {
          reactions: state.reactions,
          list: state.list,
          skipped,
          recent,
        });
        if (!pick) {
          if (await refill()) continue;
          update({ current: null });
          return;
        }
        let anime = pick.anime;
        if (!state.preview) {
          anime =
            details.get(anime.id) || (await api("/api/anime/" + anime.id));
          if (details.size >= 250) details.delete(details.keys().next().value);
          details.set(anime.id, anime);
          if (!isEligible(anime, state.reactions, state.list, skipped)) {
            skipped.add(anime.id);
            continue;
          }
        }
        update({
          current: anime,
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
      update({ busy: false, canUndo: history.length > 0 });
    }
  }
  function recordHistory(entry) {
    history.push(entry);
    history = history.slice(-30);
    update({ canUndo: true });
  }
  /**
   * Four independent actions, not two combined ratings.
   * Good/Bad mean already seen. Only Would watch may write to MAL, and only
   * when the user's optional auto-add setting is enabled.
   */
  async function react(action) {
    if (state.busy || !state.current || !REACTIONS.includes(action)) return;
    update({ busy: true });
    const anime = state.current;
    const entry = {
      anime,
      before: state.reactions[anime.id],
      reason: state.reason,
      receipt: null,
    };
    update({
      reactions: {
        ...state.reactions,
        [anime.id]: { action, anime, at: Date.now() },
      },
    });
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
      notify("Saved locally. " + error.message);
    }
    recordHistory(entry);
    recent = [...recent, anime].slice(-8);
    await next();
  }
  async function addToMal(anime) {
    const result = await api("/api/plan", { id: anime.id });
    update({
      list: [
        ...state.list.filter((a) => a.id !== anime.id),
        {
          ...anime,
          listStatus: { status: result.status || "plan_to_watch", score: 0 },
        },
      ],
    });
    return result;
  }
  /** Server receipts authorize Undo only for entries created by this session. */
  async function undo() {
    if (state.busy || !history.length) return;
    update({ busy: true });
    const entry = history.pop();
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
      current: entry.anime,
      reason: entry.reason,
      error: "",
      busy: false,
      canUndo: history.length > 0,
    });
    persist();
    notify(message);
  }
  async function skip() {
    if (state.busy || !state.current) return;
    recordHistory({ anime: state.current, reason: state.reason, skip: true });
    skipped.add(state.current.id);
    await next();
  }
  /** Initialization is idempotent, including when React StrictMode runs effects twice. */
  function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        const session = await api("/api/session");
        update({ session, preview: !session.configured });
        if (session.connected) {
          try {
            const profile = await api("/api/profile");
            profileKey = String(profile.id);
            update({ profile });
            await readList();
          } catch (error) {
            profileKey = "guest";
            update({
              profile: null,
              list: [],
              session: { ...session, connected: false },
            });
            notify(error.message);
          }
        }
        loadLocal();
        pool = state.preview ? [...demo] : [];
        await next();
      } catch (error) {
        update({ error: error.message, busy: false });
      } finally {
        update({ ready: true });
      }
    })();
    return initialization;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
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
    setSettings(patch) {
      update({ settings: { ...state.settings, ...patch } });
      persist();
    },
    removeSaved(id) {
      if (state.busy) return;
      const reactions = { ...state.reactions };
      delete reactions[id];
      // Removing an item invalidates history so an unrelated Undo cannot restore it.
      history = history.filter((entry) => entry.anime.id !== id);
      update({ reactions, canUndo: history.length > 0 });
      persist();
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
        notify("MAL list refreshed.");
      } catch (error) {
        notify(error.message);
      } finally {
        update({ busy: false });
      }
    },
    async disconnect() {
      try {
        await api("/api/logout", {});
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
      update({ reactions: {}, canUndo: false });
      persist();
      return next();
    },
  };
}
