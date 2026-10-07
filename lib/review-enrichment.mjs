import { analyzeReviews } from "./review-analysis.mjs";
import { TASTE_VERSION } from "../src/lib/taste-traits.js";
import { NUANCE_VERSION } from "../src/lib/nuanced-taste.js";
const REVIEW_PROVIDER = "tenrai";
const REVIEW_API = "https://api.tenrai.org/v1";
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
    modelBudget(day) {
      return (
        Number(
          one("SELECT code FROM review_events WHERE kind=?", "model_day_" + day)
            ?.code,
        ) || 0
      );
    },
    reserveModel(day, now) {
      const count = this.modelBudget(day) + 1;
      sql.exec(
        "DELETE FROM review_events WHERE kind LIKE 'model_day_%' AND kind != ?",
        "model_day_" + day,
      );
      this.record("model_day_" + day, now, String(count));
    },
    event(kind) {
      return one("SELECT at,code FROM review_events WHERE kind=?", kind);
    },
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
    // Failed jobs keep their priority and wait for their retry timestamp. Other
    // titles can proceed after the shared cooldown, so one bad title cannot stall all work.
    next(now) {
      return one(
        "SELECT j.id FROM review_jobs j LEFT JOIN review_profiles p ON p.id=j.id WHERE COALESCE(json_extract(p.value,'$.status'),'') != 'unavailable' OR p.expires<=? ORDER BY j.priority DESC,j.queued,j.id LIMIT 1",
        now,
      )?.id;
    },
    nextReadyAt() {
      return (
        one(
          "SELECT MIN(CASE WHEN json_extract(p.value,'$.status')='unavailable' THEN p.expires ELSE 0 END) AS at FROM review_jobs j LEFT JOIN review_profiles p ON p.id=j.id",
        ).at || 0
      );
    },
    complete(id) {
      sql.exec("DELETE FROM review_jobs WHERE id=?", id);
    },
    defer(id, now) {
      sql.exec("UPDATE review_jobs SET queued=? WHERE id=?", now, id);
    },
    useProvider(provider, now) {
      if (
        one("SELECT code FROM review_events WHERE kind='provider'")?.code ===
        provider
      )
        return;
      // An outage at the previous provider must not delay the new source. Keep
      // the daily budget, valid profiles, and queued jobs; reset only failure state.
      sql.exec("UPDATE review_scheduler SET next_at=? WHERE id=1", now);
      sql.exec(
        "UPDATE review_profiles SET expires=? WHERE id IN (SELECT id FROM review_jobs) AND json_extract(value,'$.status')='unavailable'",
        now,
      );
      sql.exec("DELETE FROM review_events WHERE kind IN ('backoff','failure')");
      sql.exec(
        "INSERT OR REPLACE INTO review_events VALUES ('provider',?,?)",
        now,
        provider,
      );
    },
    failures() {
      return (
        Number(
          one("SELECT code FROM review_events WHERE kind='backoff'")?.code,
        ) || 0
      );
    },
    recoverFailures(now) {
      // One-time upgrade: the old implementation removed failed jobs. Restore
      // transient failures within the existing queue bound, without touching accounts.
      if (one("SELECT at FROM review_events WHERE kind='retry_migration_v1'"))
        return;
      sql.exec(
        "INSERT OR IGNORE INTO review_jobs SELECT id,0,? FROM review_profiles WHERE json_extract(value,'$.status')='unavailable' AND (json_extract(value,'$.failure') GLOB 'review_http_5[0-9][0-9]' OR json_extract(value,'$.failure') IN ('review_http_429','review_timeout','review_network_or_response')) ORDER BY expires DESC LIMIT MAX(0,300-(SELECT COUNT(*) FROM review_jobs))",
        now,
      );
      sql.exec(
        "UPDATE review_profiles SET expires=? WHERE id IN (SELECT id FROM review_jobs) AND json_extract(value,'$.status')='unavailable'",
        now,
      );
      sql.exec(
        "INSERT INTO review_events VALUES ('retry_migration_v1',?,'')",
        now,
      );
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
  modelAnalyzer = null,
  modelDailyLimit = 20,
  log = () => {},
}) {
  let processing = false;
  if (enabled) {
    try {
      store.recoverFailures(now());
      store.useProvider(REVIEW_PROVIDER, now());
    } catch {
      /* Optional storage can be unavailable. */
    }
  }
  const arm = async (at) => {
    try {
      await schedule(at);
    } catch {
      try {
        store.record?.("failure", now(), "schedule_unavailable");
      } catch {}
    }
  };
  const nextAlarmAt = () =>
    Math.max(now() + 100, store.state().next_at, store.nextReadyAt());
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
  function needsAnalysis(profile) {
    if (!profile || profile.nuance?.version !== NUANCE_VERSION) return true;
    return (
      !!modelAnalyzer &&
      profile.sampleSize >= 3 &&
      !profile.modelCheckedAt &&
      (store.modelBudget?.(Math.floor(now() / DAY)) || 0) < modelDailyLimit
    );
  }
  function enqueue(id, priority = 0) {
    if (!enabled || !validId(id)) return;
    const profile = cached(id);
    if (
      profile &&
      (profile.status === "unavailable" || !needsAnalysis(profile))
    )
      return;
    try {
      store.enqueue(id, priority, now());
      void arm(nextAlarmAt());
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
    let id,
      retryAfter = 0;
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
      id = store.next(now());
      if (!id) return;
      const existing = cached(id);
      if (
        existing &&
        existing.status !== "unavailable" &&
        !needsAnalysis(existing)
      ) {
        store.complete(id);
        return;
      }
      state.count++;
      state.next_at = now() + 1500;
      store.save(state);
      const response = await fetcher(
        `${REVIEW_API}/anime/${id}/reviews?spoilers=false&preliminary=false&page=1`,
        {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        const raw = response.headers.get("retry-after");
        const seconds = Number(raw);
        const wait =
          raw && Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(raw) - now();
        retryAfter = Number.isFinite(wait)
          ? Math.max(0, Math.min(DAY, wait))
          : 0;
        await response.body?.cancel();
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
      // Model failures never discard deterministic enrichment or trigger review
      // retries. Only aggregate attributes are persisted, not reviewer text.
      if (
        modelAnalyzer &&
        analyzed.sampleSize >= 3 &&
        store.modelBudget(day) < modelDailyLimit
      ) {
        store.reserveModel(day, now());
        analyzed.modelCheckedAt = now();
        try {
          const extra = await modelAnalyzer(body.data);
          if (extra) {
            const merged = new Map(
              analyzed.nuance.observations.map((o) => [o.key, o]),
            );
            for (const o of extra.observations) {
              const prior = merged.get(o.key);
              // These are the same reviewers: never add their votes twice.
              merged.set(o.key, {
                ...o,
                support: Math.max(o.support, prior?.support || 0),
                denied: prior?.denied || 0,
              });
            }
            analyzed.nuance = {
              ...analyzed.nuance,
              model: extra.model,
              observations: [...merged.values()],
            };
            store.record("model_success", now(), extra.model);
          }
        } catch {
          store.record("model_failure", now(), "model_unavailable_or_invalid");
        }
      }
      const profile = {
        ...analyzed,
        provider: REVIEW_PROVIDER,
        fetchedAt: now(),
        status: analyzed.sampleSize ? "ready" : "empty",
      };
      store.put(id, profile, now() + (profile.sampleSize ? 14 : 2) * DAY);
      store.complete(id);
      store.record?.("backoff", now(), "0");
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
        // Retry rate limits, upstream/server failures and transport errors. Invalid
        // individual resources (e.g. 404) remain negative-cached rather than looping.
        const status = Number(code.match(/^review_http_(\d{3})$/)?.[1]);
        const retryable =
          !status || status === 408 || status === 429 || status >= 500;
        let retryAt = now() + 2 * 3600000;
        if (id && retryable) {
          const failures = Math.min(30, store.failures() + 1);
          const delay = Math.max(
            retryAfter,
            Math.min(3600000, 60000 * 2 ** Math.min(failures - 1, 6)),
          );
          const state = store.state();
          state.next_at = Math.max(state.next_at, now() + delay);
          store.save(state);
          store.record("backoff", now(), String(failures));
          retryAt = state.next_at;
          store.defer(id, now());
        } else if (id) store.complete(id);
        if (id)
          store.put(
            id,
            {
              version: TASTE_VERSION,
              source: "mal-reviews",
              provider: REVIEW_PROVIDER,
              sampleSize: 0,
              traits: [],
              status: "unavailable",
              checkedAt: now(),
              failure: code,
            },
            retryAt,
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
        if (store.pending()) await arm(nextAlarmAt());
      } catch {}
    }
  }
  function diagnostics() {
    try {
      const state = store.state();
      return {
        enabled,
        provider: REVIEW_PROVIDER,
        version: TASTE_VERSION,
        nuanceVersion: NUANCE_VERSION,
        modelEnabled: !!modelAnalyzer,
        modelDailyLimit,
        modelRequestsToday: store.modelBudget?.(Math.floor(now() / DAY)) || 0,
        lastModelSuccess: store.event?.("model_success") || null,
        lastModelFailure: store.event?.("model_failure") || null,
        storageAvailable: true,
        ...store.stats(now()),
        queued: store.pending(),
        dailyLimit,
        processedToday: state.day === Math.floor(now() / DAY) ? state.count : 0,
        consecutiveFailures: store.failures(),
        status: !enabled
          ? "disabled"
          : store.failures() && store.pending()
            ? "waiting_to_retry"
            : store.pending()
              ? "queued"
              : "idle",
        nextRequestAt: store.pending()
          ? Math.max(now(), state.next_at, store.nextReadyAt())
          : null,
      };
    } catch {
      return { enabled, version: TASTE_VERSION, storageAvailable: false };
    }
  }
  // Resume a persisted queue even if no new anime is requested after deployment.
  if (enabled) {
    try {
      if (store.pending()) void arm(nextAlarmAt());
    } catch {}
  }
  return { attach, cached, enqueue, run, diagnostics };
}
