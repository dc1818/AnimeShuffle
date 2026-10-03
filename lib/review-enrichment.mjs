import { analyzeReviews } from "./review-analysis.mjs";
import { TASTE_VERSION } from "../src/lib/taste-traits.js";
const DAY = 86400000;
const validId = (id) => Number.isSafeInteger(id) && id > 0 && id <= 10000000;

/** A shared, persistent cache and bounded queue. The only saved review data is
 * aggregate vocabulary/counts. Both Node and Cloudflare use this same schema. */
export function reviewStore(sql) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS review_profiles (id INTEGER PRIMARY KEY, expires INTEGER NOT NULL, value TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS review_jobs (id INTEGER PRIMARY KEY, priority INTEGER NOT NULL, queued INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS review_scheduler (id INTEGER PRIMARY KEY, next_at INTEGER NOT NULL, day INTEGER NOT NULL, count INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS review_events (kind TEXT PRIMARY KEY, at INTEGER NOT NULL, code TEXT NOT NULL)",
  );
  const one = (query, ...args) => Array.from(sql.exec(query, ...args))[0];
  return {
    get(id) {
      const row = one(
        "SELECT expires,value FROM review_profiles WHERE id=?",
        id,
      );
      return row
        ? { expires: row.expires, profile: JSON.parse(row.value) }
        : null;
    },
    put(id, profile, expires) {
      sql.exec(
        "INSERT OR REPLACE INTO review_profiles VALUES (?,?,?)",
        id,
        expires,
        JSON.stringify(profile),
      );
      sql.exec(
        "DELETE FROM review_profiles WHERE id IN (SELECT id FROM review_profiles ORDER BY expires DESC LIMIT -1 OFFSET 2000)",
      );
    },
    enqueue(id, priority, now) {
      if (
        !one("SELECT id FROM review_jobs WHERE id=?", id) &&
        one("SELECT COUNT(*) AS n FROM review_jobs").n >= 300
      )
        return;
      sql.exec(
        "INSERT INTO review_jobs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET priority=MAX(priority,excluded.priority)",
        id,
        priority,
        now,
      );
    },
    take() {
      const row = one(
        "SELECT id FROM review_jobs ORDER BY priority DESC, queued, id LIMIT 1",
      );
      if (row) sql.exec("DELETE FROM review_jobs WHERE id=?", row.id);
      return row?.id;
    },
    pending() {
      return one("SELECT COUNT(*) AS n FROM review_jobs").n;
    },
    state() {
      return (
        one("SELECT next_at,day,count FROM review_scheduler WHERE id=1") || {
          next_at: 0,
          day: -1,
          count: 0,
        }
      );
    },
    record(kind, at, code = "") {
      sql.exec(
        "INSERT OR REPLACE INTO review_events VALUES (?,?,?)",
        kind,
        at,
        code,
      );
    },
    stats(now) {
      const counts = one(
        "SELECT COUNT(*) AS cachedProfiles, COALESCE(SUM(CASE WHEN json_array_length(json_extract(value,'$.traits')) > 0 THEN 1 ELSE 0 END),0) AS profilesWithTraits FROM review_profiles WHERE expires>? AND json_extract(value,'$.version')=? AND COALESCE(json_extract(value,'$.status'),'ready') != 'unavailable'",
        now,
        TASTE_VERSION,
      );
      const success = one("SELECT at FROM review_events WHERE kind='success'");
      const failure = one(
        "SELECT at,code FROM review_events WHERE kind='failure'",
      );
      return {
        ...counts,
        lastSuccessAt: success?.at || null,
        lastFailureAt: failure?.at || null,
        lastFailureCode: failure?.code || null,
      };
    },
    save(s) {
      sql.exec(
        "INSERT OR REPLACE INTO review_scheduler VALUES (1,?,?,?)",
        s.next_at,
        s.day,
        s.count,
      );
    },
  };
}
export function createReviewEnrichment({
  store,
  schedule,
  fetcher = fetch,
  now = Date.now,
  enabled = true,
  dailyLimit = 600,
  log = () => {},
}) {
  let processing = false;
  const arm = async (at) => {
    try {
      await schedule(at);
    } catch {
      try {
        store.record?.("failure", now(), "schedule_unavailable");
      } catch {}
    }
  };
  function cached(id) {
    if (!enabled) return null;
    try {
      const entry = store.get(id);
      return entry?.expires > now() && entry.profile.version === TASTE_VERSION
        ? entry.profile
        : null;
    } catch {
      return null;
    }
  }
  function enqueue(id, priority = 0) {
    if (!enabled || !validId(id) || cached(id)) return;
    try {
      store.enqueue(id, priority, now());
      void arm(Math.max(now() + 100, store.state().next_at));
    } catch {
      /* Optional metadata storage cannot fail a MAL response. */
    }
  }
  function attach(anime, priority = 0) {
    if (!enabled || !validId(anime.id)) return anime;
    const profile = cached(anime.id);
    enqueue(anime.id, priority);
    return profile ? { ...anime, reviewTaste: profile } : anime;
  }
  async function run() {
    if (!enabled || processing) return;
    processing = true;
    const started = now();
    let id;
    try {
      const day = Math.floor(now() / DAY);
      const state = store.state();
      if (state.day !== day) {
        state.day = day;
        state.count = 0;
      }
      if (state.count >= dailyLimit)
        state.next_at = Math.max(state.next_at, (day + 1) * DAY);
      if (state.next_at > now()) {
        store.save(state);
        return;
      }
      id = store.take();
      if (!id) return;
      if (cached(id)) return;
      state.count++;
      state.next_at = now() + 1500;
      store.save(state);
      const response = await fetcher(
        `https://api.jikan.moe/v4/anime/${id}/reviews?spoilers=false&preliminary=false&page=1`,
        {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        },
      );
      if (response.status === 429 || response.status === 503) {
        const raw = response.headers.get("retry-after");
        const seconds = Number(raw);
        const wait =
          raw && Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(raw) - now();
        state.next_at =
          now() +
          Math.max(60000, Math.min(DAY, Number.isFinite(wait) ? wait : 60000));
        store.save(state);
      }
      if (!response.ok) throw Error("review_http_" + response.status);
      // Bound bytes as well as reviewed text; an upstream response cannot exhaust memory.
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512000) {
          await reader.cancel();
          throw Error("review_size");
        }
        chunks.push(value);
      }
      const body = JSON.parse(await new Blob(chunks).text());
      if (!Array.isArray(body.data)) throw Error("review_shape");
      const analyzed = analyzeReviews(body.data);
      const profile = {
        ...analyzed,
        fetchedAt: now(),
        status: analyzed.sampleSize ? "ready" : "empty",
      };
      store.put(id, profile, now() + (profile.sampleSize ? 14 : 2) * DAY);
      store.record?.("success", now());
      log({
        event: "review_enrichment",
        id,
        ms: now() - started,
        sampleSize: profile.sampleSize,
        traits: profile.traits.length,
      });
    } catch (error) {
      const code = /^review_(http_\d{3}|size|shape)$/.test(error?.message || "")
        ? error.message
        : ["TimeoutError", "AbortError"].includes(error?.name)
          ? "review_timeout"
          : "review_network_or_response";
      try {
        store.record?.("failure", now(), code);
        if (id)
          store.put(
            id,
            {
              version: TASTE_VERSION,
              source: "jikan-mal-reviews",
              sampleSize: 0,
              traits: [],
              status: "unavailable",
              checkedAt: now(),
              failure: code,
            },
            now() + 2 * 3600000,
          );
      } catch {}
      log({
        event: "review_enrichment_unavailable",
        id,
        code,
        ms: now() - started,
      });
    } finally {
      processing = false;
      try {
        if (store.pending())
          await arm(Math.max(now() + 100, store.state().next_at));
      } catch {}
    }
  }
  function diagnostics() {
    try {
      const state = store.state();
      return {
        enabled,
        version: TASTE_VERSION,
        storageAvailable: true,
        ...store.stats(now()),
        queued: store.pending(),
        dailyLimit,
        processedToday: state.day === Math.floor(now() / DAY) ? state.count : 0,
        nextRequestAt: state.next_at > now() ? state.next_at : null,
      };
    } catch {
      return { enabled, version: TASTE_VERSION, storageAvailable: false };
    }
  }
  return { attach, cached, enqueue, run, diagnostics };
}
